import { createAdminClient } from "@/lib/supabase/server";

/** Registro temporal de diagnóstico del conector de Claude (sin datos sensibles). */
export async function registrar(metodo: string, ruta: string, detalle: string, estado: number) {
  try {
    await createAdminClient()
      .from("registro_conector")
      .insert({ metodo, ruta: ruta.replace(/\/api\/mcp\/[0-9a-f]{16,}/, "/api/mcp/<llave>"), detalle: detalle.slice(0, 500), estado });
  } catch {
    /* el diagnóstico nunca debe romper el conector */
  }
}
