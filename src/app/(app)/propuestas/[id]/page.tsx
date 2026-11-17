import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Pencil, Plus } from "lucide-react";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { EtiquetaEstado } from "@/components/ui";
import { AccionesEstado } from "@/components/acciones-estado";
import {
  CATEGORIAS_NO_RENOVACION,
  ESTADOS_PROPUESTA,
  TIPOS_PROPUESTA,
  VENDEDORES,
  euros,
  fecha,
  fechaHora,
  type EstadoPropuesta,
} from "@/lib/etiquetas";

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{k}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{v || "—"}</dd>
    </div>
  );
}

export default async function PropuestaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ accion?: string }>;
}) {
  const usuario = await exigirRol("direccion", "comercial");
  const { id } = await params;
  const { accion } = await searchParams;
  const supabase = await createClient();

  const { data: p } = await supabase.from("v_propuestas").select("*").eq("id", id).single();
  if (!p) notFound();

  const [{ data: versiones }, { data: eventos }, { data: motivos }] = await Promise.all([
    supabase
      .from("propuestas")
      .select("id, version, estado, titulo_plan, importe_mensual")
      .eq("oportunidad_id", p.oportunidad_id)
      .order("version"),
    supabase
      .from("propuesta_eventos")
      .select("id, estado_anterior, estado_nuevo, created_at, comentario, usuarios(nombre)")
      .eq("propuesta_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("motivos").select("*").eq("propuesta_id", id).order("created_at", { ascending: false }),
  ]);

  // Datos para el modal de aceptar
  const [{ data: funciones }, { data: equipo }] = await Promise.all([
    supabase.from("funciones_internas").select("id, nombre").order("orden"),
    supabase.from("equipo").select("id, nombre, empresa").eq("activo", true).order("nombre"),
  ]);
  let clienteActual: { id: string; empresa: string } | null = null;
  let responsablesActuales: Record<string, string> = {};
  let responsableComercial: string | null = p.vendida_por;
  let candidatos: { id: string; empresa: string; motivo: string }[] = [];
  let fechaInicio: string | null = null;
  if (p.cliente_id) {
    const { data: cl } = await supabase
      .from("clientes")
      .select("id, empresa, responsable_comercial_id, cliente_responsables(funcion_id, persona_id)")
      .eq("id", p.cliente_id)
      .single();
    if (cl) {
      clienteActual = { id: cl.id, empresa: cl.empresa };
      responsableComercial = cl.responsable_comercial_id ?? responsableComercial;
      responsablesActuales = Object.fromEntries(cl.cliente_responsables.map((r) => [r.funcion_id, r.persona_id]));
    }
  } else {
    // ¿Existe ya un cliente con el mismo email o nombre?
    const filtros = [`empresa.ilike.${p.empresa.replace(/[%,()]/g, " ")}`];
    if (p.email) filtros.push(`email.eq.${p.email}`);
    const { data: cs } = await supabase.from("clientes").select("id, empresa, email").or(filtros.join(","));
    candidatos = (cs ?? []).map((c) => ({
      id: c.id,
      empresa: c.empresa,
      motivo: p.email && c.email === p.email ? "mismo email" : "mismo nombre",
    }));
  }
  if (p.contrato_renovado_id) {
    const { data: ct } = await supabase.from("contratos").select("fecha_fin").eq("id", p.contrato_renovado_id).single();
    fechaInicio = ct?.fecha_fin ?? null;
  }

  let urlArchivo: string | null = null;
  if (p.archivo_path) {
    const { data } = await supabase.storage.from("propuestas").createSignedUrl(p.archivo_path, 3600);
    urlArchivo = data?.signedUrl ?? null;
  }

  const total = Number(p.importe_mensual) * Number(p.duracion_meses ?? 0) + Number(p.importe_unico);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/propuestas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-4 w-4" /> Propuestas
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{p.empresa}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.titulo_plan} <span className="text-zinc-400">· {p.version}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EtiquetaEstado estado={p.estado} />
            {p.cliente_id && (
              <Link href={`/clientes/${p.cliente_id}`} className="text-xs font-medium text-marca-600 underline">
                Ver ficha de cliente
              </Link>
            )}
            <span className="text-xs text-zinc-500">{TIPOS_PROPUESTA[p.tipo as keyof typeof TIPOS_PROPUESTA]}</span>
            {p.dias_desde_envio != null && ["enviada", "en_negociacion"].includes(p.estado) && (
              <span className={`text-xs ${p.dias_desde_envio >= 7 ? "font-medium text-amber-700" : "text-zinc-500"}`}>
                Enviada hace {p.dias_desde_envio} días
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/propuestas/nueva?oportunidad=${p.oportunidad_id}&desde=${id}`} className="btn-secundario">
            <Plus className="h-4 w-4" /> Otra versión
          </Link>
          <Link href={`/propuestas/${id}/editar`} className="btn-secundario">
            <Pencil className="h-4 w-4" /> Editar
          </Link>
        </div>
      </div>

      {versiones && versiones.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {versiones.map((x) => (
            <Link
              key={x.id}
              href={`/propuestas/${x.id}`}
              className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm ${
                x.id === id ? "border-zinc-900 bg-white font-semibold" : "border-zinc-200 bg-white/60 text-zinc-600 hover:bg-white"
              }`}
            >
              {x.version} · {euros(x.importe_mensual)}/mes ·{" "}
              <span className="text-xs">{ESTADOS_PROPUESTA[x.estado as EstadoPropuesta].texto}</span>
            </Link>
          ))}
        </div>
      )}

      <AccionesEstado
        id={id}
        estado={p.estado}
        diasDesdeEnvio={p.dias_desde_envio}
        accionInicial={accion}
        esDireccion={usuario.rol === "direccion"}
        datosAceptar={{
          funciones: funciones ?? [],
          equipo: (equipo ?? []) as { id: string; nombre: string; empresa: "b9" | "abx" }[],
          clienteActual,
          candidatos,
          responsablesActuales,
          responsableComercial,
          fechaInicio,
          esRenovacion: !!p.contrato_renovado_id,
        }}
      />

      {motivos && motivos.length > 0 && (
        <section className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="mb-1 font-semibold text-red-900">Motivo del rechazo</h2>
          {motivos.map((m) => (
            <div key={m.id} className="text-sm text-red-900">
              <p className="font-medium">{CATEGORIAS_NO_RENOVACION[m.categoria as keyof typeof CATEGORIAS_NO_RENOVACION]}</p>
              <p className="whitespace-pre-wrap">{m.comentario}</p>
              {m.recontactar_el && <p className="mt-1 text-xs">Volver a contactar el {fecha(m.recontactar_el)}</p>}
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="tarjeta p-4 md:col-span-2 md:p-6">
          <h2 className="mb-4 font-semibold">Plan</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dato k="Mensual" v={euros(p.importe_mensual, true)} />
            <Dato k="Único / setup" v={euros(p.importe_unico, true)} />
            <Dato k="Duración" v={p.duracion_meses ? `${p.duracion_meses} meses` : null} />
            <Dato k="Valor total" v={p.duracion_meses ? euros(total) : null} />
          </dl>
          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-500">Servicios</p>
            <div className="flex flex-wrap gap-1.5">
              {p.servicios.length ? (
                p.servicios.map((s: string) => (
                  <span key={s} className="rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-700">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-sm text-zinc-400">—</span>
              )}
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dato k="Fecha de envío" v={fecha(p.fecha_envio)} />
            <Dato k="Preparada por" v={p.preparada_por_nombre} />
            <Dato k="Vendida por" v={VENDEDORES[p.vendida_por_tipo as keyof typeof VENDEDORES]} />
            <Dato k="Vendedor" v={p.vendedor_nombre} />
          </dl>
          {p.notas && (
            <div className="mt-6">
              <p className="mb-1 text-xs text-zinc-500">Notas</p>
              <p className="whitespace-pre-wrap text-sm">{p.notas}</p>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="tarjeta p-4 md:p-6">
            <h2 className="mb-4 font-semibold">Contacto</h2>
            <dl className="space-y-3">
              <Dato k="Persona" v={p.nombre_contacto} />
              <Dato k="Sector" v={p.sector} />
              <Dato k="Email" v={p.email && <a href={`mailto:${p.email}`} className="text-marca-600">{p.email}</a>} />
              <Dato k="Teléfono" v={p.telefono && <a href={`tel:${p.telefono}`} className="text-marca-600">{p.telefono}</a>} />
              <Dato
                k="Instagram"
                v={
                  p.instagram && (
                    <a href={`https://instagram.com/${p.instagram}`} target="_blank" className="text-marca-600">
                      @{p.instagram}
                    </a>
                  )
                }
              />
            </dl>
          </section>

          <section className="tarjeta p-4 md:p-6">
            <h2 className="mb-3 font-semibold">Documento</h2>
            {urlArchivo ? (
              <a href={urlArchivo} target="_blank" className="flex items-center gap-2 text-sm font-medium text-marca-600">
                <FileText className="h-4 w-4" /> {p.archivo_nombre}
              </a>
            ) : (
              <p className="text-sm text-zinc-400">Sin archivo adjunto</p>
            )}
          </section>
        </div>
      </div>

      <section className="tarjeta mt-4 p-4 md:p-6">
        <h2 className="mb-3 font-semibold">Historial</h2>
        <ol className="space-y-2">
          {(eventos ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-32 text-xs text-zinc-500">{fechaHora(e.created_at)}</span>
              {e.estado_anterior ? (
                <>
                  <EtiquetaEstado estado={e.estado_anterior} /> → <EtiquetaEstado estado={e.estado_nuevo} />
                </>
              ) : (
                <>
                  Creada como <EtiquetaEstado estado={e.estado_nuevo} />
                </>
              )}
              {(e.usuarios as unknown as { nombre: string } | null)?.nombre && (
                <span className="text-xs text-zinc-500">por {(e.usuarios as unknown as { nombre: string }).nombre}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
