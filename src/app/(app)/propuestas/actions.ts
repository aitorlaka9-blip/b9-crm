"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import type { EstadoPropuesta } from "@/lib/etiquetas";

export type ResultadoForm = { error?: string } | undefined;

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(",", ".").trim();
  return s === "" ? 0 : Number(s);
};
const txt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export async function guardarPropuesta(_prev: ResultadoForm, form: FormData): Promise<ResultadoForm> {
  const usuario = await exigirRol("direccion", "comercial");
  const supabase = await createClient();

  const propuestaId = txt(form.get("propuesta_id"));
  let oportunidadId = txt(form.get("oportunidad_id"));

  const titulo = txt(form.get("titulo_plan"));
  const empresa = txt(form.get("empresa"));
  if (!titulo) return { error: "Falta el título del plan." };
  if (!empresa) return { error: "Falta el nombre de la empresa o cliente." };

  const importeMensual = num(form.get("importe_mensual"));
  const importeUnico = num(form.get("importe_unico"));
  const duracion = txt(form.get("duracion_meses"));
  if (Number.isNaN(importeMensual) || Number.isNaN(importeUnico)) return { error: "Revisa los importes." };

  const datosOportunidad = {
    empresa,
    nombre_contacto: txt(form.get("nombre_contacto")),
    sector: txt(form.get("sector")),
    email: txt(form.get("email"))?.toLowerCase() ?? null,
    telefono: txt(form.get("telefono")),
    instagram: txt(form.get("instagram"))?.replace(/^@/, "") ?? null,
  };

  let oportunidadCreada: string | null = null;
  if (oportunidadId) {
    const { error } = await supabase.from("oportunidades").update(datosOportunidad).eq("id", oportunidadId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("oportunidades")
      .insert({ ...datosOportunidad, cliente_id: txt(form.get("cliente_id")), created_by: usuario.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    oportunidadId = oportunidadCreada = data.id;
  }

  const datosPropuesta = {
    oportunidad_id: oportunidadId,
    version: txt(form.get("version")) ?? "A",
    tipo: (txt(form.get("tipo")) ?? "nueva") as "nueva" | "upsell" | "renovacion",
    titulo_plan: titulo,
    importe_mensual: importeMensual,
    importe_unico: importeUnico,
    duracion_meses: duracion ? Number(duracion) : null,
    fecha_envio: txt(form.get("fecha_envio")),
    preparada_por: txt(form.get("preparada_por")),
    vendida_por_tipo: (txt(form.get("vendida_por_tipo")) ?? "interno") as "interno" | "abx",
    vendida_por_nombre: txt(form.get("vendida_por_nombre")),
    notas: txt(form.get("notas")),
    ...(form.get("archivo_path")
      ? {
          archivo_path: txt(form.get("archivo_path")),
          archivo_nombre: txt(form.get("archivo_nombre")),
          archivo_hash: txt(form.get("archivo_hash")),
        }
      : {}),
    ...(form.get("extraccion_ia") ? { extraccion_ia: JSON.parse(String(form.get("extraccion_ia"))) } : {}),
  };

  let id = propuestaId;
  if (id) {
    const { error } = await supabase.from("propuestas").update(datosPropuesta).eq("id", id);
    if (error) return { error: traducirError(error.message) };
  } else {
    const estadoInicial = (txt(form.get("estado")) ?? "borrador") as EstadoPropuesta;
    const { data, error } = await supabase
      .from("propuestas")
      .insert({ ...datosPropuesta, estado: estadoInicial, created_by: usuario.id })
      .select("id")
      .single();
    if (error) {
      if (oportunidadCreada) await supabase.from("oportunidades").delete().eq("id", oportunidadCreada);
      return { error: traducirError(error.message) };
    }
    id = data.id;
  }

  const servicios = form.getAll("servicios").map(String);
  await supabase.from("propuesta_servicios").delete().eq("propuesta_id", id!);
  if (servicios.length) {
    const { error } = await supabase
      .from("propuesta_servicios")
      .insert(servicios.map((s) => ({ propuesta_id: id!, servicio_id: s })));
    if (error) return { error: error.message };
  }

  revalidatePath("/propuestas");
  revalidatePath("/");
  redirect(`/propuestas/${id}`);
}

function traducirError(m: string) {
  if (m.includes("propuestas_oportunidad_id_version_key")) return "Ya existe una versión con ese nombre para este cliente.";
  if (m.includes("propuestas_archivo_hash_idx")) return "Este archivo ya está subido en otra propuesta.";
  return m;
}

export async function cambiarEstado(id: string, estado: EstadoPropuesta) {
  await exigirRol("direccion", "comercial");
  // Aceptar y denegar tienen su propio flujo (modal con datos obligatorios)
  if (estado === "aceptada" || estado === "denegada" || estado === "descartada_otra_version") {
    throw new Error("Usa el flujo de aceptar/denegar");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("propuestas").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/propuestas");
  revalidatePath(`/propuestas/${id}`);
  revalidatePath("/");
}

export async function eliminarPropuesta(id: string) {
  await exigirRol("direccion");
  const supabase = await createClient();
  const { data: p } = await supabase.from("propuestas").select("oportunidad_id, archivo_path").eq("id", id).single();
  if (!p) return;
  if (p.archivo_path) await supabase.storage.from("propuestas").remove([p.archivo_path]);
  await supabase.from("propuestas").delete().eq("id", id);
  const { count } = await supabase
    .from("propuestas")
    .select("id", { count: "exact", head: true })
    .eq("oportunidad_id", p.oportunidad_id);
  if (!count) await supabase.from("oportunidades").delete().eq("id", p.oportunidad_id);
  revalidatePath("/propuestas");
  redirect("/propuestas");
}
