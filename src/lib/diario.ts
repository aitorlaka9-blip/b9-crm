import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarEmail, plantilla } from "@/lib/email";

/**
 * Comprobación diaria (la lanza el cron de Vercel cada mañana).
 * Es segura de repetir: cada aviso y cada email tiene una clave única.
 */

const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmt = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 864e5);

type Destinatarios = { emails: string[]; usuarios: string[] };

export async function comprobacionDiaria(sb: SupabaseClient, hoy: string, urlBase: string) {
  const r = { bajas: 0, avisosRenovacion: 0, emails: [] as string[], seguimientos: 0, recordatorios: 0 };

  // ---- Dirección (siempre recibe los avisos)
  const { data: direccion } = await sb.from("usuarios").select("id, email").eq("rol", "direccion").eq("activo", true);
  const dir: Destinatarios = { emails: (direccion ?? []).map((u) => u.email), usuarios: (direccion ?? []).map((u) => u.id) };

  // ---- 1. Bajas programadas que llegan a su fecha
  const { data: bajas } = await sb
    .from("clientes")
    .update({ estado: "baja" })
    .eq("estado", "baja_programada")
    .lte("fecha_baja", hoy)
    .select("id");
  r.bajas = bajas?.length ?? 0;

  // ---- 2. Renovaciones
  const { data: contratos } = await sb
    .from("contratos")
    .select(
      "id, titulo_plan, importe_mensual, duracion_meses, fecha_fin, estado_renovacion, clientes!inner(id, empresa, estado, equipo!clientes_responsable_comercial_id_fkey(nombre, email, usuario_id)), avisos_renovacion(*)",
    )
    .in("estado_renovacion", ["vigente", "aviso_abierto", "pospuesto"])
    .not("clientes.estado", "in", "(baja,baja_programada)")
    .lte("fecha_fin", sumarDias(hoy, 30));

  for (const c of contratos ?? []) {
    const cliente = c.clientes as unknown as {
      id: string;
      empresa: string;
      equipo: { nombre: string; email: string | null; usuario_id: string | null } | null;
    };
    // avisos_renovacion es 1 a 1 con el contrato: llega como objeto (o lista, según la versión)
    const av = c.avisos_renovacion as unknown as Record<string, string | null> | Record<string, string | null>[] | null;
    const aviso = (Array.isArray(av) ? av[0] : av) ?? null;
    const dias = diasEntre(hoy, c.fecha_fin);
    const resp = cliente.equipo;
    const para: Destinatarios = {
      emails: [...dir.emails, ...(resp?.email ? [resp.email] : [])],
      usuarios: [...new Set([...dir.usuarios, ...(resp?.usuario_id ? [resp.usuario_id] : [])])],
    };
    const enlace = `/clientes/${cliente.id}`;

    let tipo: "30" | "15" | "7" | "pospuesto" | null = null;
    if (c.estado_renovacion === "pospuesto") {
      if (aviso?.pospuesto_hasta && aviso.pospuesto_hasta <= hoy && !aviso.ultimo_aviso_pospuesto_at) tipo = "pospuesto";
      else continue;
    } else {
      const umbral = dias <= 7 ? "7" : dias <= 15 ? "15" : "30";
      if (!aviso?.[`aviso_${umbral}_at`]) tipo = umbral;
    }

    // Marca el contrato como "aviso abierto" y registra el aviso
    const ahora = new Date().toISOString();
    const cambios: Record<string, string> = {};
    if (tipo === "pospuesto") cambios.ultimo_aviso_pospuesto_at = ahora;
    else if (tipo) for (const u of ["30", "15", "7"]) if (Number(u) >= Number(tipo) && !aviso?.[`aviso_${u}_at`]) cambios[`aviso_${u}_at`] = ahora;
    if (!aviso) await sb.from("avisos_renovacion").insert({ contrato_id: c.id, ...cambios });
    else if (Object.keys(cambios).length) await sb.from("avisos_renovacion").update(cambios).eq("contrato_id", c.id);
    if (c.estado_renovacion !== "aviso_abierto") {
      await sb.from("contratos").update({ estado_renovacion: "aviso_abierto" }).eq("id", c.id);
    }
    if (!tipo) continue;

    r.avisosRenovacion++;
    const cuando = dias > 0 ? `termina en ${dias} días (${fmt(c.fecha_fin)})` : dias === 0 ? "termina hoy" : `terminó el ${fmt(c.fecha_fin)}`;
    const asunto =
      tipo === "pospuesto"
        ? `Recordatorio: decidir la renovación de ${cliente.empresa}`
        : tipo === "30"
          ? `Renovación próxima: ${cliente.empresa} (${dias} días)`
          : `Renovación sin gestionar: ${cliente.empresa} ${dias > 0 ? `(${dias} días)` : "(vencido)"}`;

    await sb.from("notificaciones").upsert(
      para.usuarios.map((u) => ({
        usuario_id: u,
        tipo: "renovacion",
        titulo: asunto,
        cuerpo: `${c.titulo_plan} · ${eur(Number(c.importe_mensual))}/mes · ${cuando}`,
        enlace,
        clave: `renovacion-${c.id}-${tipo}${tipo === "pospuesto" ? `-${aviso?.pospuesto_hasta}` : ""}`,
      })),
      { onConflict: "usuario_id,clave", ignoreDuplicates: true },
    );

    const estadoEmail = await enviarEmail(sb, {
      clave: `renovacion-${c.id}-${tipo}${tipo === "pospuesto" ? `-${aviso?.pospuesto_hasta}` : ""}`,
      para: para.emails,
      asunto,
      html: plantilla({
        titulo: asunto,
        parrafos: [
          `El contrato "${c.titulo_plan}" de ${cliente.empresa} ${cuando}.`,
          `Importe: ${eur(Number(c.importe_mensual))}/mes · ${c.duracion_meses} meses.${resp ? ` Responsable comercial: ${resp.nombre}.` : ""}`,
          "Entra en la ficha del cliente y elige: renovar igual, renovar con cambios, no renueva o posponer la decisión.",
        ],
        boton: { texto: "Gestionar renovación", url: urlBase + enlace },
      }),
    });
    r.emails.push(`${asunto}: ${estadoEmail}`);
  }

  // ---- 3. Seguimiento de propuestas enviadas (7 y 30 días) y recordatorios
  const resumen: string[] = [];
  const { data: enviadas } = await sb
    .from("v_propuestas")
    .select("id, empresa, titulo_plan, version, fecha_envio")
    .eq("estado", "enviada")
    .lte("fecha_envio", sumarDias(hoy, -7));
  for (const p of enviadas ?? []) {
    const dias = diasEntre(p.fecha_envio, hoy);
    const umbral = dias >= 30 ? 30 : 7;
    const titulo =
      umbral === 30
        ? `${p.empresa}: 30 días sin respuesta. ¿La marcamos como "Sin respuesta"?`
        : `${p.empresa}: ¿qué ha pasado con esta propuesta?`;
    const { data: nuevas } = await sb
      .from("notificaciones")
      .upsert(
        dir.usuarios.map((u) => ({
          usuario_id: u,
          tipo: "seguimiento",
          titulo,
          cuerpo: `${p.titulo_plan} (${p.version}) · enviada hace ${dias} días`,
          enlace: `/propuestas/${p.id}`,
          clave: `seguimiento${umbral}-${p.id}`,
        })),
        { onConflict: "usuario_id,clave", ignoreDuplicates: true },
      )
      .select("id");
    if (nuevas?.length) {
      r.seguimientos++;
      resumen.push(`${titulo} (${p.titulo_plan}, enviada hace ${dias} días)`);
    }
  }

  const { data: recordatorios } = await sb
    .from("recordatorios")
    .select("id, titulo, fecha, asignado_a, oportunidad_id, cliente_id")
    .is("completado_at", null)
    .lte("fecha", hoy);
  for (const rec of recordatorios ?? []) {
    const usuarios = rec.asignado_a ? [rec.asignado_a] : dir.usuarios;
    const enlace = rec.cliente_id ? `/clientes/${rec.cliente_id}` : "/";
    const { data: nuevas } = await sb
      .from("notificaciones")
      .upsert(
        usuarios.map((u: string) => ({
          usuario_id: u,
          tipo: "recordatorio",
          titulo: rec.titulo,
          cuerpo: `Recordatorio del ${fmt(rec.fecha)}`,
          enlace,
          clave: `recordatorio-${rec.id}`,
        })),
        { onConflict: "usuario_id,clave", ignoreDuplicates: true },
      )
      .select("id");
    if (nuevas?.length) {
      r.recordatorios++;
      resumen.push(rec.titulo);
    }
  }

  // ---- 4. Un único email resumen a Dirección con lo nuevo de hoy
  if (resumen.length) {
    const estado = await enviarEmail(sb, {
      clave: `resumen-${hoy}`,
      para: dir.emails,
      asunto: `B9 CRM · ${resumen.length} ${resumen.length === 1 ? "cosa pendiente" : "cosas pendientes"} hoy`,
      html: plantilla({
        titulo: "Pendiente de hoy",
        parrafos: ["Esto es lo nuevo que requiere tu atención en el CRM:"],
        lista: resumen,
        boton: { texto: "Abrir el CRM", url: urlBase + "/" },
      }),
    });
    r.emails.push(`resumen: ${estado}`);
  }

  return r;
}

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(fecha.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
