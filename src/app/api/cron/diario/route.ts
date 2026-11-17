import { createAdminClient } from "@/lib/supabase/server";
import { comprobacionDiaria } from "@/lib/diario";
import { hoyISO } from "@/lib/etiquetas";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Comprobación diaria. Vercel la llama cada mañana con  Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = new URL(request.url);
  // En local se puede simular otro día: /api/cron/diario?hoy=2026-12-01
  const hoy = process.env.NODE_ENV !== "production" || process.env.PERMITIR_FECHA_SIMULADA === "1"
    ? (url.searchParams.get("hoy") ?? hoyISO())
    : hoyISO();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const resultado = await comprobacionDiaria(createAdminClient(), hoy, base);
  console.log("comprobación diaria", hoy, resultado);
  return Response.json({ hoy, ...resultado });
}
