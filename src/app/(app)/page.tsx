import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BellRing, Check } from "lucide-react";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera, EtiquetaEstado } from "@/components/ui";
import { BarrasHorizontales } from "@/components/graficos";
import { completarRecordatorio } from "./acciones-inicio";
import { CATEGORIAS_NO_RENOVACION, euros, fecha, hoyISO } from "@/lib/etiquetas";
import { sumarDias } from "@/lib/diario";

type Prop = {
  id: string;
  estado: string;
  importe_mensual: number;
  fecha_decision: string | null;
  fecha_envio: string | null;
  vendida_por_tipo: "interno" | "abx";
  vendedor_nombre: string | null;
};

function tasa(lista: Prop[]) {
  const decididas = lista.filter((p) => ["aceptada", "denegada", "sin_respuesta"].includes(p.estado));
  const ganadas = decididas.filter((p) => p.estado === "aceptada");
  const sum = (l: Prop[]) => l.reduce((s, p) => s + Number(p.importe_mensual), 0);
  return {
    decididas: decididas.length,
    ganadas: ganadas.length,
    pct: decididas.length ? ganadas.length / decididas.length : null,
    eurGanado: sum(ganadas),
    eurDecidido: sum(decididas),
    pctEur: sum(decididas) ? sum(ganadas) / sum(decididas) : null,
  };
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);

function Tile({ etiqueta, valor, detalle, aviso }: { etiqueta: string; valor: string; detalle?: string; aviso?: boolean }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs text-zinc-500">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold ${aviso ? "text-amber-700" : ""}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-zinc-500">{detalle}</p>}
    </div>
  );
}

export default async function InicioPage() {
  const u = await exigirRol();
  if (u.rol === "equipo") redirect("/clientes");
  const supabase = await createClient();
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + "01";
  const hace90 = sumarDias(hoy, -90);
  const hace365 = sumarDias(hoy, -365);

  const [conf, contratos, propuestas, pendientes, motivos, recordatorios] = await Promise.all([
    supabase.from("configuracion").select("valor").eq("clave", "objetivo_mrr").maybeSingle(),
    supabase
      .from("v_contratos")
      .select("id, cliente_id, empresa, titulo_plan, importe_mensual, fecha_fin, dias_para_fin, estado_renovacion, estado_cliente, en_vigor, renovacion_pendiente"),
    supabase
      .from("v_propuestas")
      .select("id, estado, importe_mensual, fecha_decision, fecha_envio, vendida_por_tipo, vendedor_nombre")
      .gte("fecha_envio", hace365),
    supabase
      .from("v_propuestas")
      .select("id, empresa, titulo_plan, version, estado, importe_mensual, dias_desde_envio")
      .in("estado", ["enviada", "en_negociacion"])
      .order("fecha_envio", { ascending: true }),
    supabase.from("motivos").select("categoria").eq("tipo", "rechazo_propuesta").gte("created_at", hace365),
    supabase
      .from("recordatorios")
      .select("id, titulo, fecha, oportunidad_id, propuesta_id, cliente_id")
      .is("completado_at", null)
      .lte("fecha", sumarDias(hoy, 7))
      .order("fecha"),
  ]);

  const objetivo = Number(conf.data?.valor ?? 50000);
  const cts = contratos.data ?? [];
  const pagando = cts.filter((c) => c.en_vigor && ["onboarding", "activo", "baja_programada"].includes(c.estado_cliente));
  const mrr = pagando.reduce((s, c) => s + Number(c.importe_mensual), 0);
  const enPausa = cts.filter((c) => c.en_vigor && c.estado_cliente === "en_pausa").reduce((s, c) => s + Number(c.importe_mensual), 0);
  const clientesActivos = new Set(pagando.map((c) => c.cliente_id)).size;
  const avance = Math.min(mrr / objetivo, 1);

  const renovaciones = cts.filter((c) => c.renovacion_pendiente).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin));
  const enRiesgo = renovaciones.filter((c) => c.dias_para_fin <= 30).reduce((s, c) => s + Number(c.importe_mensual), 0);
  const vencidos12 = cts.filter((c) => c.fecha_fin >= hace365 && ["renovado", "no_renueva"].includes(c.estado_renovacion));
  const renovados = vencidos12.filter((c) => c.estado_renovacion === "renovado").length;
  const tasaRenov = vencidos12.length ? renovados / vencidos12.length : null;

  const props = (propuestas.data ?? []) as Prop[];
  const delMes = tasa(props.filter((p) => p.fecha_decision && p.fecha_decision.slice(0, 10) >= inicioMes));
  const de90 = tasa(props.filter((p) => p.fecha_decision && p.fecha_decision.slice(0, 10) >= hace90));

  const conteo = new Map<string, number>();
  for (const m of motivos.data ?? []) conteo.set(m.categoria, (conteo.get(m.categoria) ?? 0) + 1);
  const barrasMotivos = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ etiqueta: CATEGORIAS_NO_RENOVACION[k as keyof typeof CATEGORIAS_NO_RENOVACION] ?? k, valor: v }));

  // Rendimiento por vendedor (últimos 12 meses)
  const enviadas = props.filter((p) => !["borrador", "descartada_otra_version"].includes(p.estado));
  const grupos = new Map<string, { tipo: "interno" | "abx"; nombre: string; lista: Prop[] }>();
  for (const p of enviadas) {
    const nombre = p.vendedor_nombre ?? (p.vendida_por_tipo === "abx" ? "ABX (sin asignar)" : "Interno (sin asignar)");
    const k = `${p.vendida_por_tipo}|${nombre}`;
    if (!grupos.has(k)) grupos.set(k, { tipo: p.vendida_por_tipo, nombre, lista: [] });
    grupos.get(k)!.lista.push(p);
  }
  const filasVend = (["interno", "abx"] as const).map((tipo) => {
    const lista = enviadas.filter((p) => p.vendida_por_tipo === tipo);
    return {
      tipo,
      total: { nombre: tipo === "abx" ? "ABX" : "Equipo interno", enviadas: lista.length, ...tasa(lista) },
      personas: [...grupos.values()]
        .filter((g) => g.tipo === tipo)
        .map((g) => ({ nombre: g.nombre, enviadas: g.lista.length, ...tasa(g.lista) }))
        .sort((a, b) => b.eurGanado - a.eurGanado),
    };
  });

  const pend = pendientes.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <Cabecera titulo={`Hola, ${u.nombre.split(" ")[0]}`} />

      {/* MRR frente al objetivo */}
      <section className="tarjeta p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-zinc-500">Facturación recurrente mensual (MRR)</p>
            <p className="text-5xl font-semibold tracking-tight">{euros(mrr)}</p>
          </div>
          <p className="text-sm text-zinc-500">
            Objetivo <b className="text-zinc-800">{euros(objetivo)}</b> · faltan{" "}
            <b className="text-zinc-800">{euros(Math.max(objetivo - mrr, 0))}</b>
          </p>
        </div>
        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#d6e5f7]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={objetivo}
          aria-valuenow={mrr}
          aria-label="MRR frente al objetivo"
        >
          <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${avance * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          {Math.round((mrr / objetivo) * 100)} % del objetivo · {clientesActivos} clientes pagando
          {enPausa > 0 && ` · ${euros(enPausa)} en clientes en pausa (no cuentan)`}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile
          etiqueta="Tasa de cierre este mes"
          valor={pct(delMes.pct)}
          detalle={`${delMes.ganadas} de ${delMes.decididas} · ${pct(delMes.pctEur)} en €`}
        />
        <Tile
          etiqueta="Tasa de cierre 90 días"
          valor={pct(de90.pct)}
          detalle={`${de90.ganadas} de ${de90.decididas} · ${euros(de90.eurGanado)}/mes ganados de ${euros(de90.eurDecidido)}`}
        />
        <Tile
          etiqueta="MRR en riesgo (30 días)"
          valor={euros(enRiesgo)}
          detalle={`${renovaciones.length} ${renovaciones.length === 1 ? "renovación" : "renovaciones"} sin cerrar`}
          aviso={enRiesgo > 0}
        />
        <Tile
          etiqueta="Tasa de renovación 12 meses"
          valor={pct(tasaRenov)}
          detalle={`${renovados} de ${vencidos12.length} contratos`}
        />
      </div>

      {/* Renovaciones y recordatorios */}
      {(renovaciones.length > 0 || (recordatorios.data ?? []).length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {renovaciones.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50">
              <h2 className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> Renovaciones próximas
              </h2>
              <ul className="divide-y divide-amber-200">
                {renovaciones.map((r) => (
                  <li key={r.id}>
                    <Link href={`/clientes/${r.cliente_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-100/50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.empresa}</p>
                        <p className="truncate text-xs text-amber-800">
                          {r.titulo_plan} · {euros(r.importe_mensual)}/mes · fin {fecha(r.fecha_fin)}
                          {r.estado_renovacion === "en_negociacion" && " · en negociación"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-amber-900">
                        {r.dias_para_fin >= 0 ? `${r.dias_para_fin} d` : "vencido"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(recordatorios.data ?? []).length > 0 && (
            <section className="tarjeta">
              <h2 className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 font-semibold">
                <BellRing className="h-4 w-4" /> Recordatorios
              </h2>
              <ul className="divide-y divide-zinc-100">
                {recordatorios.data!.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Link
                      href={r.cliente_id ? `/clientes/${r.cliente_id}` : r.propuesta_id ? `/propuestas/${r.propuesta_id}` : "/"}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-medium">{r.titulo}</p>
                      <p className={`text-xs ${r.fecha <= hoy ? "font-medium text-amber-700" : "text-zinc-500"}`}>
                        {r.fecha < hoy ? `Atrasado (${fecha(r.fecha)})` : r.fecha === hoy ? "Hoy" : fecha(r.fecha)}
                      </p>
                    </Link>
                    <form action={completarRecordatorio.bind(null, r.id)}>
                      <button className="btn-secundario px-2.5 py-1.5" aria-label="Marcar como hecho">
                        <Check className="h-4 w-4" /> Hecho
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Pendientes de respuesta */}
        <section className="tarjeta">
          <h2 className="border-b border-zinc-100 px-4 py-3 font-semibold">
            Propuestas pendientes de respuesta <span className="font-normal text-zinc-400">({pend.length})</span>
          </h2>
          {pend.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">Nada pendiente.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-zinc-100 overflow-y-auto">
              {pend.map((p) => (
                <li key={p.id}>
                  <Link href={`/propuestas/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.empresa}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {p.titulo_plan} ({p.version}) · {euros(p.importe_mensual)}/mes
                      </p>
                    </div>
                    <span
                      className={`text-sm tabular-nums ${(p.dias_desde_envio ?? 0) >= 30 ? "font-semibold text-red-600" : (p.dias_desde_envio ?? 0) >= 7 ? "font-semibold text-amber-700" : "text-zinc-500"}`}
                    >
                      {p.dias_desde_envio} d
                    </span>
                    <EtiquetaEstado estado={p.estado} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Motivos de rechazo */}
        <section className="tarjeta p-4 md:p-5">
          <h2 className="font-semibold">Motivos de rechazo</h2>
          <p className="mb-4 text-xs text-zinc-500">Propuestas denegadas en los últimos 12 meses</p>
          {barrasMotivos.length ? (
            <BarrasHorizontales datos={barrasMotivos} unidad="propuestas" />
          ) : (
            <p className="text-sm text-zinc-400">Aún no hay propuestas denegadas.</p>
          )}
        </section>
      </div>

      {/* Vendedores */}
      <section className="tarjeta overflow-hidden">
        <div className="px-4 pt-4 md:px-5">
          <h2 className="font-semibold">Rendimiento por vendedor</h2>
          <p className="text-xs text-zinc-500">Propuestas enviadas en los últimos 12 meses (sin contar versiones descartadas)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-4 py-2 font-medium md:px-5">Vendedor</th>
                <th className="px-3 py-2 text-right font-medium">Enviadas</th>
                <th className="px-3 py-2 text-right font-medium">Cerradas</th>
                <th className="px-3 py-2 text-right font-medium">Tasa de cierre</th>
                <th className="px-4 py-2 text-right font-medium md:px-5">MRR ganado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {filasVend.map((g) => (
                <FilasVendedor key={g.tipo} total={g.total} personas={g.personas} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type FilaV = { nombre: string; enviadas: number; ganadas: number; decididas: number; pct: number | null; eurGanado: number };

function FilasVendedor({ total, personas }: { total: FilaV; personas: FilaV[] }) {
  return (
    <>
      <tr className="border-b border-zinc-100 bg-zinc-50 font-semibold">
        <td className="px-4 py-2 md:px-5">{total.nombre}</td>
        <td className="px-3 py-2 text-right">{total.enviadas}</td>
        <td className="px-3 py-2 text-right">{total.ganadas}</td>
        <td className="px-3 py-2 text-right">
          {pct(total.pct)} <span className="font-normal text-zinc-400">({total.decididas} decididas)</span>
        </td>
        <td className="px-4 py-2 text-right md:px-5">{euros(total.eurGanado)}</td>
      </tr>
      {personas.map((p) => (
        <tr key={p.nombre} className="border-b border-zinc-100 text-zinc-600">
          <td className="py-2 pl-8 pr-4 md:pl-9">{p.nombre}</td>
          <td className="px-3 py-2 text-right">{p.enviadas}</td>
          <td className="px-3 py-2 text-right">{p.ganadas}</td>
          <td className="px-3 py-2 text-right">{pct(p.pct)}</td>
          <td className="px-4 py-2 text-right md:px-5">{euros(p.eurGanado)}</td>
        </tr>
      ))}
    </>
  );
}
