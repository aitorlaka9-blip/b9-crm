import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui";
import { alternarPersona, alternarServicio, anadirPersona, anadirServicio } from "./actions";

export default async function AjustesPage() {
  await exigirRol("direccion");
  const supabase = await createClient();
  const [{ data: equipo }, { data: servicios }] = await Promise.all([
    supabase.from("equipo").select("*").order("activo", { ascending: false }).order("nombre"),
    supabase.from("servicios").select("*").order("activo", { ascending: false }).order("orden"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Cabecera titulo="Ajustes" />

      <section className="tarjeta p-4 md:p-6">
        <h2 className="font-semibold">Equipo interno</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Personas que preparan propuestas y que se asignan como responsables de cada cliente. No necesitan acceso al CRM.
        </p>
        <ul className="mb-4 divide-y divide-zinc-100">
          {(equipo ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className={`flex-1 text-sm ${p.activo ? "" : "text-zinc-400 line-through"}`}>
                {p.nombre} {p.email && <span className="text-zinc-400">· {p.email}</span>}
              </span>
              <form action={alternarPersona.bind(null, p.id, !p.activo)}>
                <button className="text-xs text-zinc-500 underline">{p.activo ? "Desactivar" : "Activar"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={anadirPersona} className="flex flex-col gap-2 sm:flex-row">
          <input name="nombre" required placeholder="Nombre" className="input" />
          <input name="email" type="email" placeholder="Email (opcional)" className="input" />
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
