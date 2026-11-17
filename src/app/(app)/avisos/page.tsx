import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Cabecera, Vacio } from "@/components/ui";
import { marcarNotificacion, marcarTodasLeidas } from "../acciones-inicio";
import { fechaHora } from "@/lib/etiquetas";

export default async function AvisosPage() {
  const u = await exigirRol();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("usuario_id", u.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const lista = data ?? [];
  const sinLeer = lista.filter((n) => !n.leida_at).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera titulo="Avisos" subtitulo={sinLeer ? `${sinLeer} sin leer` : "Todo leído"}>
        {sinLeer > 0 && (
          <form action={marcarTodasLeidas}>
            <button className="btn-secundario">Marcar todo como leído</button>
          </form>
        )}
      </Cabecera>
      {lista.length === 0 ? (
        <Vacio>No tienes avisos.</Vacio>
      ) : (
        <ul className="tarjeta divide-y divide-zinc-100 overflow-hidden">
          {lista.map((n) => (
            <li key={n.id} className={n.leida_at ? "" : "bg-marca-50/50"}>
              <form action={marcarNotificacion.bind(null, n.id, n.enlace)}>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida_at ? "bg-transparent" : "bg-marca-600"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{n.titulo}</span>
                    {n.cuerpo && <span className="block text-sm text-zinc-600">{n.cuerpo}</span>}
                    <span className="block text-xs text-zinc-400">{fechaHora(n.created_at)}</span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
