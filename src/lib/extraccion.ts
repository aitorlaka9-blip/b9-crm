import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Lee una propuesta comercial (PDF o Markdown) con Claude y devuelve sus datos estructurados.
 * La API key se lee de la variable de entorno ANTHROPIC_API_KEY (nunca en el código).
 */

export const MODELO = "claude-opus-5-5";

function esquema(servicios: string[]) {
  return z.object({
    es_propuesta_comercial: z
      .boolean()
      .describe("true si el documento es una propuesta/presupuesto comercial de B9 para un cliente"),
    empresa: z.string().nullable().describe("Empresa o marca del cliente (no B9 Creative Studios)"),
    nombre_contacto: z.string().nullable().describe("Persona de contacto del cliente"),
    sector: z.string().nullable().describe("Sector del cliente, en pocas palabras"),
    email: z.string().nullable(),
    telefono: z.string().nullable(),
    instagram: z.string().nullable().describe("Usuario de Instagram del cliente, sin @"),
    titulo_plan: z.string().nullable().describe('Nombre del plan propuesto, p. ej. "Content Pro"'),
    version: z
      .string()
      .nullable()
      .describe('Identificador de la opción si el documento lo indica: "A", "B", "C", "final"… null si no lo dice'),
    servicios: z.array(z.enum(servicios as [string, ...string[]])).describe("Servicios incluidos, solo del catálogo"),
    importe_mensual: z.number().nullable().describe("Cuota mensual recurrente en euros, sin IVA"),
    importe_unico: z
      .number()
      .nullable()
      .describe("Pago único (setup, producción inicial) en euros, sin IVA. 0 si no hay"),
    duracion_meses: z.number().int().nullable().describe("Duración o permanencia del contrato en meses"),
    fecha_documento: z.string().nullable().describe("Fecha de la propuesta en formato AAAA-MM-DD"),
    preparada_por: z.string().nullable().describe("Persona de B9 que firma o prepara la propuesta"),
    vendedor: z.string().nullable().describe("Comercial que la presenta (puede ser de ABX)"),
    avisos: z
      .array(z.string())
      .describe("Dudas para que una persona revise: importes ambiguos, varias opciones en un mismo documento, IVA incluido, etc."),
  });
}

export type DatosExtraidos = z.infer<ReturnType<typeof esquema>>;

const INSTRUCCIONES = `Eres el asistente comercial de B9 Creative Studios, una agencia de creación y gestión de contenido para redes sociales con estudio de grabación propio (podcasts, reels, anuncios, VSL, entrevistas, YouTube).
Te paso una propuesta comercial que B9 ha enviado a un cliente. Extrae sus datos para darla de alta en el CRM.

Reglas:
- El cliente es la empresa a la que se dirige la propuesta, nunca B9 ni ABX.
- Importes en euros y SIN IVA. Si el documento solo da precios con IVA, calcula la base (21 %) y avísalo en "avisos".
- importe_mensual es la cuota recurrente al mes. Si el precio es trimestral o anual, pásalo a mensual y avísalo.
- importe_unico es lo que se paga una sola vez (setup, producción inicial, branding…). Si no hay, 0.
- Si el documento incluye varias opciones de precio, extrae la opción recomendada o la primera, y explica las demás en "avisos".
- Asigna los servicios solo con los nombres del catálogo; elige los que mejor encajen con lo que se ofrece.
- Si un dato no aparece, devuelve null. No inventes nada.`;

export async function extraerPropuesta(opts: {
  archivo: Buffer;
  nombreArchivo: string;
  servicios: string[];
}): Promise<{ datos: DatosExtraidos; modelo: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta la variable ANTHROPIC_API_KEY: no se puede leer el documento con IA.");
  }
  const client = new Anthropic();
  const esPdf = opts.nombreArchivo.toLowerCase().endsWith(".pdf");

  const documento: Anthropic.Beta.BetaContentBlockParam = esPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: opts.archivo.toString("base64") },
        title: opts.nombreArchivo,
      }
    : {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: opts.archivo.toString("utf8") },
        title: opts.nombreArchivo,
      };

  const respuesta = await client.beta.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: INSTRUCCIONES,
    output_config: { effort: "medium", format: betaZodOutputFormat(esquema(opts.servicios)) },
    messages: [
      {
        role: "user",
        content: [
          documento,
          {
            type: "text",
            text: `Nombre del archivo: ${opts.nombreArchivo}\nCatálogo de servicios: ${opts.servicios.join(", ")}`,
          },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error("La IA no ha podido procesar este documento. Rellena los datos a mano.");
  }
  if (respuesta.stop_reason === "max_tokens" || !respuesta.parsed_output) {
    throw new Error("La IA no ha devuelto datos válidos. Rellena los datos a mano o vuelve a intentarlo.");
  }
  return { datos: respuesta.parsed_output, modelo: respuesta.model };
}
