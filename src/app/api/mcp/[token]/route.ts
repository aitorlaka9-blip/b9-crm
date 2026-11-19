import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { procesarEntrante } from "@/lib/ingesta";

/**
 * Conector del CRM para Claude (protocolo MCP sobre HTTP, sin estado).
 * Se añade en Claude → Ajustes → Conectores → "Añadir conector personalizado" con la URL que
 * aparece en el CRM → Ajustes → "Conectar con Claude". El token de la URL es la llave.
 */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const INSTRUCCIONES =
  "CRM interno de B9 Creative Studios. Cada vez que termines una propuesta comercial para un cliente o lead de B9, súbela al CRM con la herramienta subir_propuesta_al_crm (una llamada por cada versión u opción). Después dile al usuario el enlace que devuelve.";

const HERRAMIENTAS = [
  {
    name: "subir_propuesta_al_crm",
    title: "Subir propuesta al CRM de B9",
    description:
      "Registra en el CRM de B9 Creative Studios una propuesta comercial terminada para un cliente o lead. " +
      "Úsala siempre al acabar una propuesta (y otra vez por cada versión: A, B, final…). " +
      "El CRM extrae cliente, plan, servicios, importes y duración, la guarda como 'Enviada' y avisa a Dirección. " +
      "Envía la propuesta COMPLETA en Markdown, tal como se entrega al cliente, incluyendo nombre de la empresa cliente, contacto, plan, servicios, precios y duración.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: 'Título corto para el archivo, p. ej. "Clínica Sonrisa - Content Pro - Opción A"',
        },
        contenido_markdown: { type: "string", description: "La propuesta completa en Markdown" },
        notas: { type: "string", description: "Opcional: contexto interno útil (no se envía al cliente)" },
      },
      required: ["titulo", "contenido_markdown"],
      additionalProperties: false,
    },
    annotations: { title: "Subir propuesta al CRM de B9", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

type Peticion = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function tokenValido(t: string) {
  const s = process.env.MCP_SECRET;
  return !!s && t.length === s.length && timingSafeEqual(Buffer.from(t), Buffer.from(s));
}

async function responder(p: Peticion, base: string) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: p.id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: p.id ?? null, error: { code, message } });

  switch (p.method) {
    case "initialize":
      return ok({
        protocolVersion: (p.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "B9 CRM", version: "1.0.0" },
        instructions: INSTRUCCIONES,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: HERRAMIENTAS });
    case "tools/call": {
      const nombre = p.params?.name;
      const args = (p.params?.arguments ?? {}) as { titulo?: string; contenido_markdown?: string; notas?: string };
      if (nombre !== "subir_propuesta_al_crm") return err(-32602, `Herramienta desconocida: ${String(nombre)}`);
      const contenido = String(args.contenido_markdown ?? "").trim();
      const titulo = String(args.titulo ?? "Propuesta").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
      if (contenido.length < 50) {
        return ok({ isError: true, content: [{ type: "text", text: "Falta el contenido completo de la propuesta en Markdown." }] });
      }
      try {
        const r = await procesarEntrante(createAdminClient(), {
          nombre: `${titulo}.md`,
          archivo: Buffer.from(contenido, "utf8"),
          fecha: new Date().toISOString(),
          origen: "claude",
          notas: args.notas ?? null,
        });
        const texto =
          r.estado === "creada"
            ? `Propuesta guardada en el CRM como ${r.destino}: ${r.empresa ?? "¿cliente?"} · ${r.titulo ?? ""} (versión ${r.version}). ` +
              `Queda como "Enviada" y "Por revisar". Enlace: ${base}/propuestas/${r.propuesta_id}` +
              (r.avisos.length ? `\nAvisos de la lectura automática: ${r.avisos.join(" | ")}` : "")
            : r.estado === "duplicada"
              ? `Esta misma propuesta ya estaba en el CRM: ${base}/propuestas/${r.propuesta_id}`
              : "El CRM no la ha reconocido como una propuesta comercial (falta cliente, plan o precios). No se ha guardado.";
        return ok({ content: [{ type: "text", text: texto }], isError: r.estado === "no_es_propuesta" });
      } catch (e) {
        console.error("mcp subir_propuesta", e);
        return ok({
          isError: true,
          content: [{ type: "text", text: `No se pudo guardar en el CRM: ${e instanceof Error ? e.message : "error"}` }],
        });
      }
    }
    default:
      if (p.method?.startsWith("notifications/")) return null;
      return err(-32601, `Método no soportado: ${p.method}`);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) return Response.json({ error: "No autorizado" }, { status: 401 });

  let cuerpo: Peticion | Peticion[];
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido" } }, { status: 400 });
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  const respuestas = (await Promise.all(lista.map((p) => responder(p, base)))).filter(Boolean);
  if (!respuestas.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(cuerpo) ? respuestas : respuestas[0]);
}

export async function GET() {
  return new Response("Método no permitido", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
