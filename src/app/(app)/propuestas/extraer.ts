"use server";

import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { extraerPropuesta } from "@/lib/extraccion";
import { cargarCatalogos, mapearDatos, planificar, type DatosMapeados, type Plan } from "@/lib/ingesta";

export type ResultadoExtraccion =
  | { ok: true; valores: DatosMapeados; plan: Plan; avisos: string[]; noEsPropuesta: boolean; extraccion: unknown }
  | { ok: false; error: string; duplicada?: { id: string; empresa: string } };

export async function extraerDatos(path: string, nombre: string, hash: string): Promise<ResultadoExtraccion> {
  await exigirRol("direccion", "comercial");
  const supabase = await createClient();

  const { data: dup } = await supabase.from("v_propuestas").select("id, empresa").eq("archivo_hash", hash).maybeSingle();
  if (dup) return { ok: false, error: "Este documento ya está en el CRM.", duplicada: dup };

  const { data: blob, error } = await supabase.storage.from("propuestas").download(path);
  if (error || !blob) return { ok: false, error: "No se pudo leer el archivo subido." };

  try {
    const cat = await cargarCatalogos(supabase);
    const { datos, modelo } = await extraerPropuesta({
      archivo: Buffer.from(await blob.arrayBuffer()),
      nombreArchivo: nombre,
      servicios: cat.servicios.map((s) => s.nombre),
    });
    const valores = mapearDatos(datos, cat);
    const plan = await planificar(supabase, valores);
    return {
      ok: true,
      valores,
      plan,
      avisos: datos.avisos,
      noEsPropuesta: !datos.es_propuesta_comercial,
      extraccion: { ...datos, modelo, fecha: new Date().toISOString() },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al leer el documento con IA." };
  }
}
