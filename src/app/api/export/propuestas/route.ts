import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { aCSV, respuestaCSV } from "@/lib/csv";
import { ESTADOS_PROPUESTA, TIPOS_PROPUESTA, VENDEDORES, hoyISO, type EstadoPropuesta } from "@/lib/etiquetas";

export async function GET() {
  const u = await usuarioActual();
  if (!u || !u.activo || u.rol === "equipo") return new Response("Sin acceso", { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_propuestas").select("*").order("fecha_envio", { ascending: false });
  if (error) return new Response(error.message, { status: 500 });

  const filas = (data ?? []).map((p) => ({
    ...p,
    estado: ESTADOS_PROPUESTA[p.estado as EstadoPropuesta].texto,
    tipo: TIPOS_PROPUESTA[p.tipo as keyof typeof TIPOS_PROPUESTA],
    vendida_por_tipo: VENDEDORES[p.vendida_por_tipo as keyof typeof VENDEDORES],
    importe_mensual: String(p.importe_mensual).replace(".", ","),
    importe_unico: String(p.importe_unico).replace(".", ","),
  }));

  return respuestaCSV(
    aCSV(filas, [
      ["empresa", "Empresa"],
      ["nombre_contacto", "Contacto"],
      ["sector", "Sector"],
      ["email", "Email"],
      ["telefono", "Teléfono"],
      ["instagram", "Instagram"],
      ["titulo_plan", "Plan"],
      ["version", "Versión"],
      ["tipo", "Tipo"],
      ["servicios", "Servicios"],
      ["importe_mensual", "Importe mensual (€)"],
      ["importe_unico", "Importe único (€)"],
      ["duracion_meses", "Duración (meses)"],
      ["fecha_envio", "Fecha envío"],
      ["estado", "Estado"],
      ["preparada_por_nombre", "Preparada por"],
      ["vendida_por_tipo", "Vendida por"],
      ["vendida_por_nombre", "Vendedor"],
      ["fecha_decision", "Fecha decisión"],
    ]),
    `propuestas-${hoyISO()}.csv`,
  );
}
