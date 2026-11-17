import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { extraerPropuesta } from "@/lib/extraccion";
import {
  cargarCatalogos,
  crearPropuesta,
  mapearDatos,
  notificarDireccion,
  planificar,
  sha256,
  subirArchivo,
} from "@/lib/ingesta";

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

  const archivo = Buffer.from(cuerpo.contenido_base64, "base64");
  const hash = sha256(archivo);
  const sb = createAdminClient();

  const { data: dup } = await sb.from("propuestas").select("id").eq("archivo_hash", hash).maybeSingle();
  if (dup) return Response.json({ estado: "duplicada", propuesta_id: dup.id });

  try {
    const cat = await cargarCatalogos(sb);
    const { datos, modelo } = await extraerPropuesta({
      archivo,
      nombreArchivo: nombre,
      servicios: cat.servicios.map((s) => s.nombre),
    });
    if (!datos.es_propuesta_comercial) return Response.json({ estado: "no_es_propuesta" });

    const m = mapearDatos(datos, cat);
    const plan = await planificar(sb, m);
    const path = await subirArchivo(sb, archivo, nombre, hash);
    const id = await crearPropuesta(sb, {
      m,
      plan,
      archivo: { path, nombre, hash },
      extraccion: { ...datos, modelo, fecha: new Date().toISOString() },
      fechaArchivo: cuerpo.fecha?.slice(0, 10) ?? null,
      origen: "drive",
    });
    await notificarDireccion(sb, {
      tipo: "propuesta_nueva",
      titulo: `Nueva propuesta: ${m.empresa ?? nombre}`,
      cuerpo: `${m.titulo_plan ?? "Propuesta"} · revisa los datos que ha extraído la IA`,
      enlace: `/propuestas/${id}`,
      clave: `propuesta-${id}`,
    });
    return Response.json({ estado: "creada", propuesta_id: id });
  } catch (e) {
    console.error("ingesta", nombre, e);
    return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
