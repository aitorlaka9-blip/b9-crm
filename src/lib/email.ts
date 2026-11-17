import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envío de emails con Resend (https://resend.com).
 * Variables: RESEND_API_KEY y EMAIL_REMITENTE (p. ej. "B9 CRM <avisos@b9studios.com>").
 * Sin RESEND_API_KEY (desarrollo) el email se registra como "simulado" y no se envía.
 * Cada email lleva una clave única: el mismo aviso nunca se envía dos veces.
 */
export async function enviarEmail(
  sb: SupabaseClient,
  e: { clave: string; para: string[]; asunto: string; html: string },
): Promise<"enviado" | "simulado" | "repetido" | "sin_destinatarios" | "error"> {
  const para = [...new Set(e.para.map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@")))];
  if (!para.length) return "sin_destinatarios";

  const simulado = !process.env.RESEND_API_KEY;
  const { error: dup } = await sb.from("emails_enviados").insert({
    clave: e.clave,
    destinatarios: para,
    asunto: e.asunto,
    estado: simulado ? "simulado" : "enviado",
  });
  if (dup) return dup.code === "23505" ? "repetido" : "error";
  if (simulado) {
    console.log(`[email simulado] ${e.asunto} → ${para.join(", ")}`);
    return "simulado";
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_REMITENTE ?? "B9 CRM <onboarding@resend.dev>",
      to: para,
      subject: e.asunto,
      html: e.html,
    }),
  });
  if (!r.ok) {
    const texto = await r.text();
    console.error("Resend", r.status, texto);
    // se borra el registro para que se reintente en la próxima comprobación
    await sb.from("emails_enviados").delete().eq("clave", e.clave);
    return "error";
  }
  return "enviado";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function plantilla(o: { titulo: string; parrafos: string[]; boton?: { texto: string; url: string }; lista?: string[] }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:24px 24px 8px"><div style="display:inline-block;background:#18181b;color:#fff;font-weight:700;font-size:13px;border-radius:8px;padding:6px 8px">B9</div></td></tr>
<tr><td style="padding:8px 24px 0"><h1 style="font-size:19px;margin:0 0 12px">${esc(o.titulo)}</h1>
${o.parrafos.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px">${esc(p)}</p>`).join("")}
${o.lista ? `<ul style="font-size:14px;line-height:1.6;padding-left:18px;margin:0 0 12px">${o.lista.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
${o.boton ? `<p style="margin:20px 0 8px"><a href="${esc(o.boton.url)}" style="background:#18181b;color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;padding:10px 16px;display:inline-block">${esc(o.boton.texto)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;color:#71717a">CRM interno de B9 Creative Studios</td></tr>
</table></td></tr></table></body></html>`;
}
