import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui";
import { guardarObjetivo } from "../acciones-inicio";
import { alternarPersona, alternarServicio, anadirPersona, anadirServicio } from "./actions";

export default async function AjustesPage() {
  await exigirRol("direccion");
  const supabase = await createClient();
  const [{ data: equipo }, { data: servicios }, { data: objetivo }] = await Promise.all([
    supabase.from("equipo").select("*").order("activo", { ascending: false }).order("nombre"),
    supabase.from("servicios").select("*").order("activo", { ascending: false }).order("orden"),
    supabase.from("configuracion").select("valor").eq("clave", "objetivo_mrr").maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Cabecera titulo="Ajustes" />

      <section className="tarjeta p-4 md:p-6">
        <h2 className="mb-3 font-semibold">Objetivo de facturación mensual</h2>
        <form action={guardarObjetivo} className="flex gap-2">
          <input name="objetivo" type="number" min="1" step="100" defaultValue={Number(objetivo?.valor ?? 50000)} className="input max-w-48" />
          <span className="self-center text-sm text-zinc-500">€/mes</span>
          <button className="btn-primario">Guardar</button>
        </form>
      </section>

      <section className="tarjeta p-4 md:p-6">
        <h2 className="font-semibold">Equipo interno</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Personas de B9 y de ABX: preparan o venden propuestas, se asignan como responsables y reciben los avisos de renovación por email. No necesitan acceso al CRM.
        </p>
        <ul className="mb-4 divide-y divide-zinc-100">
          {(equipo ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className={`flex-1 text-sm ${p.activo ? "" : "text-zinc-400 line-through"}`}>
                {p.nombre} {p.empresa === "abx" && <span className="rounded bg-zinc-100 px-1 text-[11px] text-zinc-600">ABX</span>}{" "}
                {p.email && <span className="text-zinc-400">· {p.email}</span>}
              </span>
              <form action={alternarPersona.bind(null, p.id, !p.activo)}>
                <button className="text-xs text-zinc-500 underline">{p.activo ? "Desactivar" : "Activar"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={anadirPersona} className="flex flex-col gap-2 sm:flex-row">
          <input name="nombre" required placeholder="Nombre" className="input" />
          <input name="email" type="email" placeholder="Email (para los avisos)" className="input" />
          <select name="empresa" className="input sm:w-32">
            <option value="b9">B9</option>
            <option value="abx">ABX</option>
          </select>
          <button className="btn-primario">Añadir</button>
        </form>
      </section>

      <section className="tarjeta p-4 md:p-6">
        <h2 className="mb-4 font-semibold">Servicios</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {(servicios ?? []).map((s) => (
            <form key={s.id} action={alternarServicio.bind(null, s.id, !s.activo)}>
              <button
                title={s.activo ? "Pulsa para ocultarlo" : "Pulsa para activarlo"}
                className={`rounded-full border px-3 py-1.5 text-sm ${s.activo ? "border-zinc-300 bg-white" : "border-dashed border-zinc-300 text-zinc-400 line-through"}`}
              >
                {s.nombre}
              </button>
            </form>
          ))}
        </div>
        <form action={anadirServicio} className="flex gap-2">
          <input name="nombre" required placeholder="Nuevo servicio" className="input" />
          <button className="btn-primario">Añadir</button>
        </form>
      </section>
    </div>
  );
}
