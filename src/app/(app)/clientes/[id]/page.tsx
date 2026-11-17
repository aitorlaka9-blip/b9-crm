import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { EtiquetaEstado } from "@/components/ui";
import {
  AccionesRenovacion,
  Archivos,
  EditarContacto,
  EditarFechaFin,
  EstadoCliente,
  Responsables,
  type ContratoUI,
} from "@/components/cliente-ui";
import { anadirNota, borrarNota } from "../actions";
import { CATEGORIAS_NO_RENOVACION, euros, fecha, fechaHora } from "@/lib/etiquetas";

const RENOVACION: Record<string, { texto: string; clase: string }> = {
  vigente: { texto: "Vigente", clase: "text-emerald-700" },
  aviso_abierto: { texto: "Renovación pendiente", clase: "text-amber-700" },
  pospuesto: { texto: "Decisión pospuesta", clase: "text-amber-700" },
  en_negociacion: { texto: "Renovación en negociación", clase: "text-sky-700" },
  renovado: { texto: "Renovado", clase: "text-zinc-500" },
  no_renueva: { texto: "No renueva", clase: "text-red-700" },
};

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const usuario = await exigirRol();
  const { id } = await params;
  const { nuevo } = await searchParams;
  const supabase = await createClient();
  const conImportes = usuario.rol !== "equipo";
  const puedeEditar = conImportes;

  const { data: c } = await supabase
    .from("clientes")
    .select("*, cliente_responsables(funcion_id, persona_id)")
    .eq("id", id)
    .single();
  if (!c) notFound();

  const [{ data: funciones }, { data: equipo }, { data: notas }, { data: archivos }] = await Promise.all([
    supabase.from("funciones_internas").select("id, nombre").order("orden"),
    supabase.from("equipo").select("id, nombre, empresa").order("nombre"),
    supabase.from("notas").select("id, texto, created_at, autor_id, usuarios(nombre)").eq("cliente_id", id).order("created_at", { ascending: false }),
    supabase.from("archivos").select("*").eq("cliente_id", id).order("created_at", { ascending: false }),
  ]);

  let contratos: ContratoUI[] = [];
  let propuestas: { id: string; titulo_plan: string; version: string; estado: never; importe_mensual: number; fecha_envio: string | null }[] = [];
  let motivos: { id: string; tipo: string; categoria: string; comentario: string; created_at: string }[] = [];
  if (conImportes) {
    const [ct, pr, mo] = await Promise.all([
      supabase.from("v_contratos").select("*").eq("cliente_id", id).order("fecha_inicio", { ascending: false }),
      supabase
        .from("v_propuestas")
        .select("id, titulo_plan, version, estado, importe_mensual, fecha_envio")
        .eq("cliente_id", id)
        .order("fecha_envio", { ascending: false }),
      supabase.from("motivos").select("id, tipo, categoria, comentario, created_at").eq("cliente_id", id).order("created_at", { ascending: false }),
    ]);
    contratos = (ct.data ?? []) as ContratoUI[];
    propuestas = (pr.data ?? []) as typeof propuestas;
    motivos = mo.data ?? [];
  }

  const urls = new Map<string, string>();
  if (archivos?.length) {
    const { data } = await supabase.storage.from("clientes").createSignedUrls(archivos.map((a) => a.path), 3600);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }

  const pendientes = contratos.filter((x) => x.renovacion_pendiente);
  const abiertos = contratos.filter((x) => !["renovado", "no_renueva"].includes(x.estado_renovacion));
  const mrr = contratos
    .filter((x) => (x as ContratoUI & { en_vigor: boolean }).en_vigor)
    .reduce((s, x) => s + Number(x.importe_mensual), 0);
  const equipoT = (equipo ?? []) as { id: string; nombre: string; empresa: "b9" | "abx" }[];
  const responsableComercial = equipoT.find((e) => e.id === c.responsable_comercial_id);
  const actuales = Object.fromEntries(
    (c.cliente_responsables as { funcion_id: string; persona_id: string }[]).map((r) => [r.funcion_id, r.persona_id]),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      {nuevo && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          Propuesta aceptada. Ficha de cliente actualizada.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.empresa}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <EstadoCliente id={c.id} estado={c.estado} puedeEditar={puedeEditar} />
            <span className="text-xs text-zinc-500">Cliente desde {fecha(c.fecha_alta)}</span>
            {c.fecha_baja && <span className="text-xs text-red-700">Baja: {fecha(c.fecha_baja)}</span>}
          </div>
        </div>
        {conImportes && (
          <div className="text-right">
            <p className="text-xs text-zinc-500">Facturación mensual</p>
            <p className="text-2xl font-semibold tabular-nums">{euros(mrr)}</p>
          </div>
        )}
      </div>

      {/* Aviso de renovación */}
      {pendientes.map((x) => (
        <section key={x.id} className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {x.dias_para_fin >= 0
              ? `El contrato "${x.titulo_plan}" termina en ${x.dias_para_fin} días (${fecha(x.fecha_fin)})`
              : `El contrato "${x.titulo_plan}" terminó el ${fecha(x.fecha_fin)} y no se ha gestionado`}
          </p>
          <p className="text-sm text-amber-800">
            {euros(x.importe_mensual)}/mes · {x.duracion_meses} meses
            {x.estado_renovacion === "en_negociacion" && " · Hay una propuesta de renovación en negociación"}
          </p>
          {x.estado_renovacion !== "en_negociacion" && <AccionesRenovacion clienteId={c.id} c={x} />}
        </section>
      ))}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          {conImportes && (
            <section className="tarjeta p-4 md:p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Contratos</h2>
                <Link href={`/propuestas/nueva?cliente=${c.id}`} className="btn-secundario px-3 py-1.5">
                  <Plus className="h-4 w-4" /> Upsell
                </Link>
              </div>
              {contratos.length === 0 && <p className="text-sm text-zinc-400">Sin contratos</p>}
              <ul className="divide-y divide-zinc-100">
                {contratos.map((x) => (
                  <li key={x.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{x.titulo_plan}</p>
                      <p className="font-semibold tabular-nums">{euros(x.importe_mensual)}/mes</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>
                        {fecha(x.fecha_inicio)} → <b className="text-zinc-700">{fecha(x.fecha_fin)}</b>
                        {x.fecha_fin_editada && " (editada)"}
                      </span>
                      {usuario.rol === "direccion" && !["renovado", "no_renueva"].includes(x.estado_renovacion) && (
                        <EditarFechaFin clienteId={c.id} c={x} />
                      )}
                      <span>{x.duracion_meses} meses</span>
                      <span className={RENOVACION[x.estado_renovacion].clase}>
                        {RENOVACION[x.estado_renovacion].texto}
                        {x.estado_renovacion === "pospuesto" && x.pospuesto_hasta && ` hasta ${fecha(x.pospuesto_hasta)}`}
                      </span>
                    </div>
                    {abiertos.includes(x) && !x.renovacion_pendiente && x.estado_renovacion !== "en_negociacion" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-marca-600">Gestionar renovación ahora</summary>
                        <div className="mt-2">
                          <AccionesRenovacion clienteId={c.id} c={x} compacto />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {conImportes && propuestas.length > 0 && (
            <section className="tarjeta p-4 md:p-6">
              <h2 className="mb-3 font-semibold">Propuestas</h2>
              <ul className="divide-y divide-zinc-100">
                {propuestas.map((p) => (
                  <li key={p.id}>
                    <Link href={`/propuestas/${p.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-zinc-50">
                      <span className="flex-1 truncate">
                        {p.titulo_plan} <span className="text-zinc-400">({p.version})</span>
                      </span>
                      <span className="tabular-nums text-zinc-500">{euros(p.importe_mensual)}/mes</span>
                      <span className="hidden text-zinc-500 sm:inline">{fecha(p.fecha_envio)}</span>
                      <EtiquetaEstado estado={p.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tarjeta p-4 md:p-6">
            <h2 className="mb-3 font-semibold">Notas</h2>
            <form action={anadirNota} className="mb-4 flex gap-2">
              <input type="hidden" name="cliente_id" value={c.id} />
              <textarea name="texto" required placeholder="Añadir una nota…" className="input min-h-10 flex-1" rows={1} />
              <button className="btn-primario">Añadir</button>
            </form>
            <ul className="space-y-3">
              {(notas ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.texto}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      {(n.usuarios as unknown as { nombre: string } | null)?.nombre} · {fechaHora(n.created_at)}
                    </span>
                    {(n.autor_id === usuario.id || usuario.rol === "direccion") && (
                      <form action={borrarNota.bind(null, c.id, n.id)}>
                        <button className="hover:text-red-600" aria-label="Borrar nota">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {motivos.length > 0 && (
            <section className="tarjeta p-4 md:p-6">
              <h2 className="mb-3 font-semibold">Motivos de baja / no renovación</h2>
              {motivos.map((m) => (
                <div key={m.id} className="mb-2 text-sm">
                  <p className="font-medium">
                    {CATEGORIAS_NO_RENOVACION[m.categoria as keyof typeof CATEGORIAS_NO_RENOVACION]}{" "}
                    <span className="text-xs font-normal text-zinc-400">{fechaHora(m.created_at)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-zinc-600">{m.comentario}</p>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="tarjeta p-4 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Contacto</h2>
              {puedeEditar && <EditarContacto c={c} equipo={equipoT.filter((e) => e.id)} />}
            </div>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-zinc-500">Persona</dt><dd>{c.nombre_contacto ?? "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Sector</dt><dd>{c.sector ?? "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Email</dt><dd>{c.email ? <a className="text-marca-600" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Teléfono</dt><dd>{c.telefono ? <a className="text-marca-600" href={`tel:${c.telefono}`}>{c.telefono}</a> : "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Instagram</dt><dd>{c.instagram ? <a className="text-marca-600" target="_blank" href={`https://instagram.com/${c.instagram}`}>@{c.instagram}</a> : "—"}</dd></div>
              {conImportes && (
                <div>
                  <dt className="text-xs text-zinc-500">Responsable comercial</dt>
                  <dd>
                    {responsableComercial ? `${responsableComercial.nombre}${responsableComercial.empresa === "abx" ? " (ABX)" : ""}` : "—"}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="tarjeta p-4 md:p-6">
            <h2 className="mb-3 font-semibold">Responsables internos</h2>
            <Responsables
              clienteId={c.id}
              funciones={funciones ?? []}
              equipo={equipoT}
              actuales={actuales}
              puedeEditar={puedeEditar}
            />
          </section>

          <section className="tarjeta p-4 md:p-6">
            <h2 className="mb-3 font-semibold">Archivos</h2>
            <Archivos
              clienteId={c.id}
              puedeEditar={puedeEditar}
              archivos={(archivos ?? []).map((a) => ({ ...a, url: urls.get(a.path) ?? null }))}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
