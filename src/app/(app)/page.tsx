import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera, EtiquetaEstado } from "@/components/ui";
import { euros } from "@/lib/etiquetas";

export default async function InicioPage() {
  const u = await exigirRol();
  if (u.rol === "equipo") redirect("/clientes");
  const supabase = await createClient();

  const { data: abiertas } = await supabase
    .from("v_propuestas")
    .select("id, empresa, titulo_plan, version, estado, importe_mensual, dias_desde_envio, fecha_envio")
    .in("estado", ["enviada", "en_negociacion"])
    .order("fecha_envio", { ascending: true });

  const lista = abiertas ?? [];
  const { data: renovaciones } = await supabase
    .from("v_contratos")
    .select("id, cliente_id, empresa, titulo_plan, importe_mensual, fecha_fin, dias_para_fin, estado_renovacion")
    .eq("renovacion_pendiente", true)
    .order("fecha_fin");
  const mrrPendiente = lista.reduce((s, p) => s + Number(p.importe_mensual), 0);

  return (
    <div>
      <Cabecera titulo={`Hola, ${u.nombre.split(" ")[0]}`} subtitulo="El panel completo (MRR, tasas de cierre, rechazos, renovaciones) llega en la fase 4." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="tarjeta p-4">
          <p className="text-xs text-zinc-500">Pendientes de respuesta</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{lista.length}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs text-zinc-500">Más de 7 días sin respuesta</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">
            {lista.filter((p) => p.estado === "enviada" && (p.dias_desde_envio ?? 0) >= 7).length}
          </p>
        </div>
        <div className="tarjeta col-span-2 p-4 md:col-span-1">
          <p className="text-xs text-zinc-500">MRR en juego (propuestas abiertas)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{euros(mrrPendiente)}</p>
        </div>
      </div>

      {renovaciones && renovaciones.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50">
          <h2 className="border-b border-amber-200 px-4 py-3 font-semibold text-amber-900">Renovaciones próximas</h2>
          <ul className="divide-y divide-amber-200">
            {renovaciones.map((r) => (
              <li key={r.id}>
                <Link href={`/clientes/${r.cliente_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-100/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.empresa}</p>
                    <p className="truncate text-xs text-amber-800">
                      {r.titulo_plan} · {euros(r.importe_mensual)}/mes
                      {r.estado_renovacion === "en_negociacion" && " · en negociación"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-amber-900">
                    {r.dias_para_fin >= 0 ? `${r.dias_para_fin} d` : "vencido"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta">
        <h2 className="border-b border-zinc-100 px-4 py-3 font-semibold">Propuestas pendientes de respuesta</h2>
        {lista.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nada pendiente.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {lista.map((p) => (
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
    </div>
  );
}
