import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera, EtiquetaEstado, Vacio } from "@/components/ui";
import { AvisoSeguimiento } from "@/components/aviso-seguimiento";
import { euros, fecha, VENDEDORES, type EstadoPropuesta } from "@/lib/etiquetas";

const FILTROS: { id: string; texto: string; estados?: EstadoPropuesta[] }[] = [
  { id: "abiertas", texto: "Abiertas", estados: ["borrador", "enviada", "en_negociacion"] },
  { id: "aceptadas", texto: "Aceptadas", estados: ["aceptada"] },
  { id: "denegadas", texto: "Denegadas", estados: ["denegada"] },
  { id: "sin_respuesta", texto: "Sin respuesta", estados: ["sin_respuesta"] },
  { id: "todas", texto: "Todas" },
];

export type FilaPropuesta = {
  id: string;
  oportunidad_id: string;
  version: string;
  titulo_plan: string;
  empresa: string;
  nombre_contacto: string | null;
  estado: EstadoPropuesta;
  importe_mensual: number;
  importe_unico: number;
  duracion_meses: number | null;
  fecha_envio: string | null;
  dias_desde_envio: number | null;
  vendida_por_tipo: "interno" | "abx";
  servicios: string[];
  num_versiones: number;
};

export default async function PropuestasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; vendedor?: string }>;
}) {
  await exigirRol("direccion", "comercial");
  const { filtro = "abiertas", q = "", vendedor = "" } = await searchParams;
  const supabase = await createClient();

  const f = FILTROS.find((x) => x.id === filtro) ?? FILTROS[0];
  let consulta = supabase
    .from("v_propuestas")
    .select(
      "id, oportunidad_id, version, titulo_plan, empresa, nombre_contacto, estado, importe_mensual, importe_unico, duracion_meses, fecha_envio, dias_desde_envio, vendida_por_tipo, servicios, num_versiones",
    )
    .order("fecha_envio", { ascending: false, nullsFirst: true })
    .order("version");
  if (f.estados) consulta = consulta.in("estado", f.estados);
  if (vendedor === "interno" || vendedor === "abx") consulta = consulta.eq("vendida_por_tipo", vendedor);
  if (q.trim()) {
    const t = q.trim().replace(/[%,()]/g, " ");
    consulta = consulta.or(`empresa.ilike.%${t}%,titulo_plan.ilike.%${t}%,nombre_contacto.ilike.%${t}%`);
  }
  const { data, error } = await consulta;
  const filas = (data ?? []) as FilaPropuesta[];

  // Seguimiento: enviadas hace 7+ días (las más antiguas primero)
  const { data: pendientes } = await supabase
    .from("v_propuestas")
    .select("id, empresa, titulo_plan, version, dias_desde_envio, importe_mensual")
    .eq("estado", "enviada")
    .gte("dias_desde_envio", 7)
    .order("fecha_envio", { ascending: true });

  // Agrupar versiones de la misma oportunidad
  const grupos = new Map<string, FilaPropuesta[]>();
  for (const p of filas) {
    const g = grupos.get(p.oportunidad_id) ?? [];
    g.push(p);
    grupos.set(p.oportunidad_id, g);
  }

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ filtro, q, vendedor, ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `?${p.toString()}`;
  };

  return (
    <div>
      <Cabecera titulo="Propuestas" subtitulo={`${filas.length} propuesta${filas.length === 1 ? "" : "s"}`}>
        <a href="/api/export/propuestas" className="btn-secundario">
          <Download className="h-4 w-4" /> CSV
        </a>
        <Link href="/propuestas/nueva" className="btn-primario">
          <Plus className="h-4 w-4" /> Nueva propuesta
        </Link>
      </Cabecera>

      {pendientes && pendientes.length > 0 && <AvisoSeguimiento propuestas={pendientes} />}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {FILTROS.map((x) => (
            <Link
              key={x.id}
              href={qs({ filtro: x.id })}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                x.id === f.id ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {x.texto}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="filtro" value={f.id} />
          <select name="vendedor" defaultValue={vendedor} className="input w-auto">
            <option value="">Todos los vendedores</option>
            <option value="interno">Equipo interno</option>
            <option value="abx">ABX</option>
          </select>
          <div className="relative flex-1 md:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input name="q" defaultValue={q} placeholder="Buscar cliente o plan" className="input pl-9" />
          </div>
        </form>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error.message}</p>}

      {grupos.size === 0 ? (
        <Vacio>
          No hay propuestas en esta vista.{" "}
          <Link href="/propuestas/nueva" className="font-medium text-marca-600 underline">
            Crear una
          </Link>
        </Vacio>
      ) : (
        <div className="space-y-3">
          {[...grupos.values()].map((versiones) => (
            <div key={versiones[0].oportunidad_id} className="tarjeta overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-4 py-2">
                <p className="font-semibold">{versiones[0].empresa}</p>
                {versiones[0].num_versiones > 1 && (
                  <span className="text-xs text-zinc-500">{versiones[0].num_versiones} versiones</span>
                )}
              </div>
              <ul className="divide-y divide-zinc-100">
                {versiones.map((p) => (
                  <li key={p.id}>
                    <Link href={`/propuestas/${p.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-zinc-50 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600">{p.version}</span>
                          <span className="truncate font-medium">{p.titulo_plan}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {p.servicios.join(" · ") || "Sin servicios"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:justify-end">
                        <span className="font-semibold tabular-nums">
                          {euros(p.importe_mensual)}
                          <span className="font-normal text-zinc-500">/mes</span>
                        </span>
                        {Number(p.importe_unico) > 0 && (
                          <span className="text-zinc-500 tabular-nums">+ {euros(p.importe_unico)}</span>
                        )}
                        <span className="text-zinc-500">{fecha(p.fecha_envio)}</span>
                        <span className="text-xs text-zinc-500">{VENDEDORES[p.vendida_por_tipo]}</span>
                        <EtiquetaEstado estado={p.estado} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
