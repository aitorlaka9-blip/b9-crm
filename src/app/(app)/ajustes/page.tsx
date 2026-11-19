import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera } from "@/components/ui";
import { Copiar } from "@/components/copiar";
import { headers } from "next/headers";
import { guardarObjetivo } from "../acciones-inicio";
import { alternarUsuario, borrarInvitacion, cambiarRol, invitarUsuario, alternarPersona, alternarServicio, anadirPersona, anadirServicio } from "./actions";

const ROLES = {
  direccion: "Dirección — ve y gestiona todo",
  comercial: "Comercial — propuestas y clientes, sin Ajustes",
  equipo: "Equipo — solo sus clientes asignados, sin importes",
};

export default async function AjustesPage() {
  const yo = await exigirRol("direccion");
  const supabase = await createClient();
  const [{ data: equipo }, { data: servicios }, { data: objetivo }] = await Promise.all([
    supabase.from("equipo").select("*").order("activo", { ascending: false }).order("nombre"),
    supabase.from("servicios").select("*").order("activo", { ascending: false }).order("orden"),
    supabase.from("configuracion").select("valor").eq("clave", "objetivo_mrr").maybeSingle(),
  ]);
  const [{ data: usuarios }, { data: invitaciones }] = await Promise.all([
    supabase.from("usuarios").select("*").order("activo", { ascending: false }).order("nombre"),
    supabase.from("invitaciones").select("*").order("created_at"),
  ]);
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const urlConector = process.env.MCP_SECRET ? `${base}/api/mcp/${process.env.MCP_SECRET}` : null;
  const preferencias =
    "Trabajo en B9 Creative Studios. Cada vez que terminemos una propuesta comercial para un cliente o lead (y cada versión u opción de una misma propuesta), súbela al CRM con la herramienta subir_propuesta_al_crm del conector B9 CRM, enviando la propuesta completa en Markdown, y dime el enlace que devuelve.";
  const pendientes = (invitaciones ?? []).filter((i) => !(usuarios ?? []).some((u) => u.email === i.email));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Cabecera titulo="Ajustes" />

      <section className="tarjeta p-4 md:p-6">
        <h2 className="font-semibold">Acceso al CRM</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Solo entran las personas invitadas, con su cuenta de Google. Para que alguien del rol Equipo vea sus clientes, su email
          tiene que ser el mismo que el de su ficha en &quot;Equipo interno&quot;.
        </p>
        <ul className="mb-4 divide-y divide-zinc-100">
          {(usuarios ?? []).map((u) => (
            <li key={u.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
              <div className={`min-w-0 flex-1 text-sm ${u.activo ? "" : "text-zinc-400 line-through"}`}>
                <p className="truncate font-medium">{u.nombre}</p>
                <p className="truncate text-xs text-zinc-500">{u.email}</p>
              </div>
              {u.id === yo.id ? (
                <span className="text-xs text-zinc-500">Tú · Dirección</span>
              ) : (
                <div className="flex items-center gap-2">
                  <form action={cambiarRol.bind(null, u.id)} className="flex gap-1">
                    <select name="rol" defaultValue={u.rol} className="input w-auto py-1.5 text-sm">
                      <option value="direccion">Dirección</option>
                      <option value="comercial">Comercial</option>
                      <option value="equipo">Equipo</option>
                    </select>
                    <button className="btn-secundario px-2.5 py-1.5">Guardar</button>
                  </form>
                  <form action={alternarUsuario.bind(null, u.id, !u.activo)}>
                    <button className="text-xs text-zinc-500 underline">{u.activo ? "Quitar acceso" : "Dar acceso"}</button>
                  </form>
                </div>
              )}
            </li>
          ))}
          {pendientes.map((i) => (
            <li key={i.email} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1 truncate">
                {i.email} <span className="text-xs text-zinc-400">· invitado como {i.rol}, aún no ha entrado</span>
              </span>
              <form action={borrarInvitacion.bind(null, i.email)}>
                <button className="text-xs text-zinc-500 underline">Cancelar</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={invitarUsuario} className="flex flex-col gap-2 sm:flex-row">
          <input name="email" type="email" required placeholder="email@gmail.com o @b9studios.com" className="input" />
          <select name="rol" defaultValue="equipo" className="input sm:w-auto">
            {Object.entries(ROLES).map(([k, t]) => (
              <option key={k} value={k}>{t}</option>
            ))}
          </select>
          <button className="btn-primario">Invitar</button>
        </form>
      </section>

      <section className="tarjeta p-4 md:p-6">
        <h2 className="font-semibold">Conectar con Claude</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Así, cada propuesta que prepares con Claude se sube sola al CRM. Se configura una vez.
        </p>
        {urlConector ? (
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>
              En Claude (claude.ai): <b>Ajustes → Conectores → Añadir conector personalizado</b>. Nombre: <b>B9 CRM</b>. En URL pega esta
              dirección (no la compartas: es la llave del conector):
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-100 px-3 py-2 text-xs">{urlConector}</code>
                <Copiar texto={urlConector} />
              </div>
            </li>
            <li>
              En Claude: <b>Ajustes → Perfil → Preferencias personales</b>, añade este texto:
              <div className="mt-2 flex items-start gap-2">
                <p className="min-w-0 flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs">{preferencias}</p>
                <Copiar texto={preferencias} />
              </div>
            </li>
            <li>En cada conversación nueva, comprueba que el conector <b>B9 CRM</b> está activado (menú de herramientas del chat).</li>
          </ol>
        ) : (
          <p className="text-sm text-amber-700">Falta la variable MCP_SECRET en Vercel.</p>
        )}
      </section>

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
