import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosExtraidos } from "@/lib/extraccion";

/**
 * Lógica compartida para dar de alta propuestas a partir de un archivo:
 * formulario (prerrelleno), script de importación y carpeta de Drive.
 */

export type Catalogos = {
  servicios: { id: string; nombre: string }[];
  equipo: { id: string; nombre: string; empresa: "b9" | "abx" }[];
};

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function cargarCatalogos(sb: SupabaseClient): Promise<Catalogos> {
  const [s, e] = await Promise.all([
    sb.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    sb.from("equipo").select("id, nombre, empresa").eq("activo", true),
  ]);
  return { servicios: s.data ?? [], equipo: (e.data ?? []) as Catalogos["equipo"] };
}

/** Busca una persona del equipo por nombre ("Aitor", "Aitor Laka", …) */
export function buscarPersona(nombre: string | null, equipo: Catalogos["equipo"]) {
  if (!nombre) return null;
  const n = norm(nombre);
  if (!n) return null;
  const exacta = equipo.find((e) => norm(e.nombre) === n);
  if (exacta) return exacta;
  const primera = n.split(" ")[0];
  return (
    equipo.find((e) => norm(e.nombre).split(" ")[0] === primera) ??
    equipo.find((e) => norm(e.nombre).includes(n) || n.includes(norm(e.nombre))) ??
    null
  );
}

/** Convierte lo que devuelve la IA en valores del formulario (ids del catálogo, etc.) */
export function mapearDatos(d: DatosExtraidos, cat: Catalogos) {
  const preparada = buscarPersona(d.preparada_por, cat.equipo.filter((e) => e.empresa === "b9"));
  const vendedor = buscarPersona(d.vendedor, cat.equipo);
  const fechaValida = d.fecha_documento && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_documento) ? d.fecha_documento : null;
  return {
    empresa: d.empresa ?? undefined,
    nombre_contacto: d.nombre_contacto,
    sector: d.sector,
    email: d.email?.toLowerCase().trim() ?? null,
    telefono: d.telefono,
    instagram: d.instagram?.replace(/^@/, "") ?? null,
    titulo_plan: d.titulo_plan ?? undefined,
    version: d.version ?? undefined,
    servicios: cat.servicios.filter((s) => d.servicios.includes(s.nombre)).map((s) => s.id),
    importe_mensual: d.importe_mensual,
    importe_unico: d.importe_unico ?? 0,
    duracion_meses: d.duracion_meses,
    fecha_envio: fechaValida,
    preparada_por: preparada?.id ?? null,
    vendida_por: vendedor?.id ?? null,
    vendida_por_tipo: (vendedor?.empresa === "abx" ? "abx" : "interno") as "interno" | "abx",
    vendida_por_nombre: vendedor ? null : d.vendedor,
  };
}

export type DatosMapeados = ReturnType<typeof mapearDatos>;

export type Plan = {
  oportunidad_id: string | null;
  oportunidad_empresa: string | null;
  cliente_id: string | null;
  cliente_empresa: string | null;
  version: string;
  tipo: "nueva" | "upsell";
};

function siguienteVersion(usadas: string[]) {
  const letras = usadas.filter((v) => /^[A-Z]$/.test(v)).sort();
  if (!letras.length) return usadas.length ? String.fromCharCode(65 + usadas.length) : "A";
  return String.fromCharCode(letras[letras.length - 1].charCodeAt(0) + 1);
}

/**
 * Decide dónde va la propuesta:
 *  - si ya hay una oportunidad abierta del mismo cliente (email o nombre) → nueva versión de esa oportunidad
 *  - si ya es cliente → oportunidad nueva vinculada al cliente (upsell)
 *  - si no → lead nuevo
 */
export async function planificar(sb: SupabaseClient, m: DatosMapeados): Promise<Plan> {
  const plan: Plan = {
    oportunidad_id: null,
    oportunidad_empresa: null,
    cliente_id: null,
    cliente_empresa: null,
    version: m.version ?? "A",
    tipo: "nueva",
  };
  if (!m.empresa && !m.email) return plan;

  // Comparación tolerante: sin tildes, mayúsculas ni "S.L.", "S.A."…
  const clave = (x: string | null | undefined) =>
    x ? norm(x).replace(/\b(s ?l ?u?|s ?a|sociedad limitada|slp|sc)$/g, "").trim() : "";
  const empresa = clave(m.empresa);
  const coincide = (o: { empresa: string | null; email: string | null }) =>
    (!!m.email && o.email?.toLowerCase() === m.email) || (!!empresa && clave(o.empresa) === empresa);

  const { data: ops } = await sb
    .from("oportunidades")
    .select("id, empresa, email, cliente_id, updated_at, propuestas(version, estado)")
    .order("updated_at", { ascending: false })
    .limit(5000);

  const abierta = (ops ?? []).filter(coincide).find((o) =>
    (o.propuestas as { estado: string }[]).some((p) => ["borrador", "enviada", "en_negociacion"].includes(p.estado)),
  );
  if (abierta) {
    const usadas = (abierta.propuestas as { version: string }[]).map((p) => p.version);
    plan.oportunidad_id = abierta.id;
    plan.oportunidad_empresa = abierta.empresa;
    plan.cliente_id = abierta.cliente_id;
    plan.version = m.version && !usadas.includes(m.version) ? m.version : siguienteVersion(usadas);
  }

  if (!plan.cliente_id) {
    const { data: cs } = await sb.from("clientes").select("id, empresa, email").limit(5000);
    const c = (cs ?? []).find(coincide);
    if (c) {
      plan.cliente_id = c.id;
      plan.cliente_empresa = c.empresa;
      plan.tipo = "upsell";
    }
  }
  return plan;
}

/** Crea la propuesta (y la oportunidad si hace falta) con el archivo ya subido. */
export async function crearPropuesta(
  sb: SupabaseClient,
  a: {
    m: DatosMapeados;
    plan: Plan;
    archivo: { path: string; nombre: string; hash: string };
    extraccion: unknown;
    fechaArchivo?: string | null;
    origen: "importacion" | "drive" | "manual" | "claude";
    usuarioId?: string | null;
    estado?: "enviada" | "borrador";
  },
) {
  const { m, plan } = a;
  let oportunidadId = plan.oportunidad_id;
  if (!oportunidadId) {
    const { data, error } = await sb
      .from("oportunidades")
      .insert({
        empresa: m.empresa ?? a.archivo.nombre.replace(/\.(pdf|md)$/i, ""),
        nombre_contacto: m.nombre_contacto,
        sector: m.sector,
        email: m.email,
        telefono: m.telefono,
        instagram: m.instagram,
        cliente_id: plan.cliente_id,
        created_by: a.usuarioId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    oportunidadId = data.id;
  }

  const { data: p, error } = await sb
    .from("propuestas")
    .insert({
      oportunidad_id: oportunidadId,
      version: plan.version,
      tipo: plan.tipo,
      titulo_plan: m.titulo_plan ?? "Propuesta",
      importe_mensual: m.importe_mensual ?? 0,
      importe_unico: m.importe_unico ?? 0,
      duracion_meses: m.duracion_meses,
      fecha_envio: m.fecha_envio ?? a.fechaArchivo ?? null,
      preparada_por: m.preparada_por,
      vendida_por: m.vendida_por,
      vendida_por_tipo: m.vendida_por_tipo,
      vendida_por_nombre: m.vendida_por_nombre,
      estado: a.estado ?? "enviada",
      archivo_path: a.archivo.path,
      archivo_nombre: a.archivo.nombre,
      archivo_hash: a.archivo.hash,
      extraccion_ia: a.extraccion,
      revisada: false,
      origen: a.origen,
      created_by: a.usuarioId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (!plan.oportunidad_id) await sb.from("oportunidades").delete().eq("id", oportunidadId);
    throw new Error(error.message);
  }
  if (m.servicios.length) {
    await sb.from("propuesta_servicios").insert(m.servicios.map((s) => ({ propuesta_id: p.id, servicio_id: s })));
  }
  return p.id as string;
}

export function rutaArchivo(hash: string, nombre: string) {
  const limpio = nombre.normalize("NFD").replace(/[^\w.\-]+/g, "_");
  return `${new Date().getFullYear()}/${hash.slice(0, 12)}_${limpio}`;
}

export async function subirArchivo(sb: SupabaseClient, archivo: Buffer, nombre: string, hash: string) {
  const path = rutaArchivo(hash, nombre);
  const { error } = await sb.storage.from("propuestas").upload(path, archivo, {
    upsert: true,
    contentType: nombre.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/markdown",
  });
  if (error) throw new Error(`No se pudo subir ${nombre}: ${error.message}`);
  return path;
}

/** Avisa en la campanita a todos los usuarios de Dirección */
export async function notificarDireccion(
  sb: SupabaseClient,
  n: { tipo: string; titulo: string; cuerpo?: string; enlace?: string; clave?: string },
) {
  const { data: us } = await sb.from("usuarios").select("id").eq("rol", "direccion").eq("activo", true);
  if (!us?.length) return;
  await sb.from("notificaciones").upsert(
    us.map((u) => ({ usuario_id: u.id, ...n })),
    { onConflict: "usuario_id,clave", ignoreDuplicates: true },
  );
}

export type ResultadoEntrada =
  | { estado: "creada"; propuesta_id: string; empresa: string | null; titulo: string | null; version: string; destino: string; avisos: string[] }
  | { estado: "duplicada"; propuesta_id: string }
  | { estado: "no_es_propuesta" };

/**
 * Alta automática de una propuesta a partir de un archivo (Drive o conector de Claude):
 * evita duplicados, la lee con IA, decide si es lead nuevo / versión / upsell, la guarda y avisa a Dirección.
 */
export async function procesarEntrante(
  sb: SupabaseClient,
  e: { nombre: string; archivo: Buffer; fecha?: string | null; origen: "drive" | "claude"; notas?: string | null },
): Promise<ResultadoEntrada> {
  const { extraerPropuesta } = await import("@/lib/extraccion");
  const hash = sha256(e.archivo);
  const { data: dup } = await sb.from("propuestas").select("id").eq("archivo_hash", hash).maybeSingle();
  if (dup) return { estado: "duplicada", propuesta_id: dup.id };

  const cat = await cargarCatalogos(sb);
  const { datos, modelo } = await extraerPropuesta({
    archivo: e.archivo,
    nombreArchivo: e.nombre,
    servicios: cat.servicios.map((s) => s.nombre),
  });
  if (!datos.es_propuesta_comercial) return { estado: "no_es_propuesta" };

  const m = mapearDatos(datos, cat);
  const plan = await planificar(sb, m);
  const path = await subirArchivo(sb, e.archivo, e.nombre, hash);
  const id = await crearPropuesta(sb, {
    m,
    plan,
    archivo: { path, nombre: e.nombre, hash },
    extraccion: { ...datos, modelo, fecha: new Date().toISOString() },
    fechaArchivo: e.fecha?.slice(0, 10) ?? null,
    origen: e.origen,
  });
  if (e.notas) await sb.from("propuestas").update({ notas: e.notas }).eq("id", id);
  await notificarDireccion(sb, {
    tipo: "propuesta_nueva",
    titulo: `Nueva propuesta: ${m.empresa ?? e.nombre}`,
    cuerpo: `${m.titulo_plan ?? "Propuesta"} · ${e.origen === "claude" ? "subida desde Claude" : "desde Drive"} · revisa los datos`,
    enlace: `/propuestas/${id}`,
    clave: `propuesta-${id}`,
  });
  const destino = plan.oportunidad_id
    ? `versión ${plan.version} de la propuesta abierta de ${plan.oportunidad_empresa}`
    : plan.cliente_id
      ? `upsell del cliente ${plan.cliente_empresa}`
      : "lead nuevo";
  return {
    estado: "creada",
    propuesta_id: id,
    empresa: m.empresa ?? null,
    titulo: m.titulo_plan ?? null,
    version: plan.version,
    destino,
    avisos: datos.avisos,
  };
}
