import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { procesarEntrante } from "@/lib/ingesta";

export const maxDuration = 120;

/**
 * Entrada automática de propuestas (la llama el script de Google Drive).
 * POST JSON { nombre, contenido_base64, fecha? }  con cabecera  Authorization: Bearer <INGESTA_SECRET>
 */
export async function POST(request: Request) {
  const secreto = process.env.INGESTA_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (
    !secreto ||
    recibido.length !== secreto.length ||
    !timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto))
  ) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: { nombre?: string; contenido_base64?: string; fecha?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON no válido" }, { status: 400 });
  }
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre || !cuerpo.contenido_base64) return Response.json({ error: "Faltan nombre o contenido" }, { status: 400 });
  if (!/\.(pdf|md|markdown)$/i.test(nombre)) return Response.json({ estado: "ignorado", motivo: "No es PDF ni .md" });

  try {
    const r = await procesarEntrante(createAdminClient(), {
      nombre,
      archivo: Buffer.from(cuerpo.contenido_base64, "base64"),
      fecha: cuerpo.fecha ?? null,
      origen: "drive",
    });
    return Response.json(r);
  } catch (e) {
    console.error("ingesta", nombre, e);
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
