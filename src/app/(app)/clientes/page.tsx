import Link from "next/link";
import { Download, Search } from "lucide-react";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera, Vacio } from "@/components/ui";
import { ESTADOS_CLIENTE, euros, fecha } from "@/lib/etiquetas";

const FILTROS = [
  { id: "actuales", texto: "Actuales", estados: ["onboarding", "activo", "en_pausa", "baja_programada"] },
  { id: "renovar", texto: "Renovación próxima" },
  { id: "baja", texto: "Bajas", estados: ["baja"] },
  { id: "todos", texto: "Todos" },
];

type Ct = { cliente_id: string; titulo_plan: string; importe_mensual: number; fecha_fin: string; en_vigor: boolean; renovacion_pendiente: boolean; dias_para_fin: number; estado_renovacion: string };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const u = await exigirRol();
  const conImportes = u.rol !== "equipo";
  const { filtro = "actuales", q = "" } = await searchParams;
  const f = FILTROS.find((x) => x.id === filtro) ?? FILTROS[0];
  const supabase = await createClient();

  let consulta = supabase.from("clientes").select("id, empresa, nombre_contacto, sector, estado, fecha_alta").order("empresa");
  if (f.estados) consulta = consulta.in("estado", f.estados);
  if (q.trim()) consulta = consulta.or(`empresa.ilike.%${q.trim().replace(/[%,()]/g, " ")}%,nombre_contacto.ilike.%${q.trim().replace(/[%,()]/g, " ")}%`);
  const { data: clientes } = await consulta;

  let contratos: Ct[] = [];
  if (conImportes) {
    const { data } = await supabase
      .from("v_contratos")
      .select("cliente_id, titulo_plan, importe_mensual, fecha_fin, en_vigor, renovacion_pendiente, dias_para_fin, estado_renovacion");
    contratos = (data ?? []) as Ct[];
  }
  const porCliente = new Map<string, Ct[]>();
  for (const c of contratos) porCliente.set(c.cliente_id, [...(porCliente.get(c.cliente_id) ?? []), c]);

  let lista = clientes ?? [];
  if (f.id === "renovar") lista = lista.filter((c) => porCliente.get(c.id)?.some((x) => x.renovacion_pendiente));

  return (
    <div>
      <Cabecera titulo="Clientes" subtitulo={`${lista.length} cliente${lista.length === 1 ? "" : "s"}`}>
        {conImportes && (
          <a href="/api/export/clientes" className="btn-secundario">
            <Download className="h-4 w-4" /> CSV
          </a>
        )}
      </Cabecera>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {FILTROS.filter((x) => conImportes || x.id !== "renovar").map((x) => (
            <Link
              key={x.id}
              href={`?filtro=${x.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                x.id === f.id ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {x.texto}
            </Link>
          ))}
        </div>
        <form className="relative md:w-72">
          <input type="hidden" name="filtro" value={f.id} />
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input name="q" defaultValue={q} placeholder="Buscar cliente" className="input pl-9" />
        </form>
      </div>

      {lista.length === 0 ? (
        <Vacio>
          {u.rol === "equipo"
            ? "No tienes clientes asignados."
            : "No hay clientes en esta vista. Se crean al aceptar una propuesta."}
        </Vacio>
      ) : (
        <div className="tarjeta divide-y divide-zinc-100 overflow-hidden">
          {lista.map((c) => {
            const cts = porCliente.get(c.id) ?? [];
            const mrr = cts.filter((x) => x.en_vigor).reduce((s, x) => s + Number(x.importe_mensual), 0);
            const proximo = cts.filter((x) => !["renovado", "no_renueva"].includes(x.estado_renovacion)).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin))[0];
            const pendiente = cts.some((x) => x.renovacion_pendiente);
            const e = ESTADOS_CLIENTE[c.estado as keyof typeof ESTADOS_CLIENTE];
            return (
              <Link key={c.id} href={`/clientes/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-50 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.empresa}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {[c.nombre_contacto, c.sector, [...new Set(cts.filter((x) => x.estado_renovacion !== "renovado").map((x) => x.titulo_plan))].join(" + ")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {conImportes && <span className="font-semibold tabular-nums">{euros(mrr)}/mes</span>}
                  {conImportes && proximo && (
                    <span className={pendiente ? "font-medium text-amber-700" : "text-zinc-500"}>
                      Fin {fecha(proximo.fecha_fin)}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
