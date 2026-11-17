import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { aCSV, respuestaCSV } from "@/lib/csv";
import { ESTADOS_CLIENTE, hoyISO } from "@/lib/etiquetas";

export async function GET() {
  const u = await usuarioActual();
  if (!u || !u.activo || u.rol === "equipo") return new Response("Sin acceso", { status: 403 });
  const supabase = await createClient();
  const [{ data: clientes }, { data: contratos }, { data: equipo }] = await Promise.all([
    supabase.from("clientes").select("*, cliente_responsables(persona_id, funciones_internas(nombre))").order("empresa"),
    supabase.from("v_contratos").select("cliente_id, titulo_plan, importe_mensual, fecha_inicio, fecha_fin, en_vigor, estado_renovacion"),
    supabase.from("equipo").select("id, nombre"),
  ]);
  const nombre = (id: string | null) => equipo?.find((e) => e.id === id)?.nombre ?? "";

  const filas = (clientes ?? []).map((c) => {
    const cts = (contratos ?? []).filter((x) => x.cliente_id === c.id);
    return {
      ...c,
      estado: ESTADOS_CLIENTE[c.estado as keyof typeof ESTADOS_CLIENTE].texto,
      planes: [...new Set(cts.filter((x) => x.estado_renovacion !== "renovado").map((x) => x.titulo_plan))],
      mrr: String(cts.filter((x) => x.en_vigor).reduce((s, x) => s + Number(x.importe_mensual), 0)).replace(".", ","),
      fecha_fin: cts.filter((x) => !["renovado", "no_renueva"].includes(x.estado_renovacion)).map((x) => x.fecha_fin).sort()[0] ?? "",
      responsable_comercial: nombre(c.responsable_comercial_id),
      responsables: (c.cliente_responsables as unknown as { persona_id: string; funciones_internas: { nombre: string } }[]).map(
        (r) => `${r.funciones_internas.nombre}: ${nombre(r.persona_id)}`,
      ),
    };
  });

  return respuestaCSV(
    aCSV(filas, [
      ["empresa", "Empresa"],
      ["nombre_contacto", "Contacto"],
      ["sector", "Sector"],
      ["email", "Email"],
      ["telefono", "Teléfono"],
      ["instagram", "Instagram"],
      ["estado", "Estado"],
      ["planes", "Planes"],
      ["mrr", "Facturación mensual (€)"],
      ["fecha_alta", "Cliente desde"],
      ["fecha_fin", "Próximo fin de contrato"],
      ["fecha_baja", "Fecha de baja"],
      ["responsable_comercial", "Responsable comercial"],
      ["responsables", "Responsables internos"],
    ]),
    `clientes-${hoyISO()}.csv`,
  );
}
