"use server";

import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export type Resultado = { error?: string; ok?: boolean } | undefined;

const txt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

function refrescar(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/clientes");
  revalidatePath("/");
}

export async function actualizarCliente(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion", "comercial");
  const id = String(form.get("cliente_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      empresa: txt(form.get("empresa")) ?? undefined,
      nombre_contacto: txt(form.get("nombre_contacto")),
      sector: txt(form.get("sector")),
      email: txt(form.get("email"))?.toLowerCase() ?? null,
      telefono: txt(form.get("telefono")),
      instagram: txt(form.get("instagram"))?.replace(/^@/, "") ?? null,
      responsable_comercial_id: txt(form.get("responsable_comercial_id")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refrescar(id);
  return { ok: true };
}

export async function cambiarEstadoCliente(id: string, estado: "onboarding" | "activo" | "en_pausa") {
  await exigirRol("direccion", "comercial");
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").update({ estado, fecha_baja: null }).eq("id", id);
  if (error) throw new Error(error.message);
  refrescar(id);
}

export async function guardarResponsables(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion", "comercial");
  const id = String(form.get("cliente_id"));
  const supabase = await createClient();
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("resp_")) continue;
    const funcion_id = k.slice(5);
    const persona_id = String(v);
    const r = persona_id
      ? await supabase.from("cliente_responsables").upsert({ cliente_id: id, funcion_id, persona_id })
      : await supabase.from("cliente_responsables").delete().eq("cliente_id", id).eq("funcion_id", funcion_id);
    if (r.error) return { error: r.error.message };
  }
  refrescar(id);
  return { ok: true };
}

export async function anadirNota(form: FormData) {
  const u = await exigirRol();
  const id = String(form.get("cliente_id"));
  const texto = txt(form.get("texto"));
  if (!texto) return;
  const supabase = await createClient();
  await supabase.from("notas").insert({ cliente_id: id, texto, autor_id: u.id });
  refrescar(id);
}

export async function borrarNota(clienteId: string, notaId: string) {
  await exigirRol();
  const supabase = await createClient();
  await supabase.from("notas").delete().eq("id", notaId);
  refrescar(clienteId);
}

export async function registrarArchivo(clienteId: string, path: string, nombre: string, tipo: string) {
  const u = await exigirRol("direccion", "comercial");
  const supabase = await createClient();
  const { error } = await supabase.from("archivos").insert({ cliente_id: clienteId, path, nombre, tipo, subido_por: u.id });
  if (error) throw new Error(error.message);
  refrescar(clienteId);
}

export async function borrarArchivo(clienteId: string, archivoId: string, path: string) {
  await exigirRol("direccion", "comercial");
  const supabase = await createClient();
  await supabase.storage.from("clientes").remove([path]);
  await supabase.from("archivos").delete().eq("id", archivoId);
  refrescar(clienteId);
}

export async function darDeBaja(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion", "comercial");
  const id = String(form.get("cliente_id"));
  if (!txt(form.get("categoria"))) return { error: "Elige el motivo." };
  if (!txt(form.get("comentario"))) return { error: "El comentario es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_de_baja", {
    p_cliente: id,
    p_categoria: txt(form.get("categoria")),
    p_comentario: txt(form.get("comentario")),
    p_fecha: txt(form.get("fecha")),
  });
  if (error) return { error: error.message };
  refrescar(id);
  return { ok: true };
}

// ---------- Renovaciones ----------
export async function renovarIgual(clienteId: string, contratoId: string) {
  await exigirRol("direccion", "comercial");
  const supabase = await createClient();
  const { error } = await supabase.rpc("renovar_igual", { p_contrato: contratoId });
  if (error) throw new Error(error.message);
  refrescar(clienteId);
}

export async function noRenueva(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion", "comercial");
  const clienteId = String(form.get("cliente_id"));
  if (!txt(form.get("categoria"))) return { error: "Elige el motivo." };
  if (!txt(form.get("comentario"))) return { error: "El comentario es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("no_renueva", {
    p_contrato: String(form.get("contrato_id")),
    p_categoria: txt(form.get("categoria")),
    p_comentario: txt(form.get("comentario")),
  });
  if (error) return { error: error.message };
  refrescar(clienteId);
  return { ok: true };
}

export async function posponerRenovacion(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion", "comercial");
  const clienteId = String(form.get("cliente_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("posponer_renovacion", {
    p_contrato: String(form.get("contrato_id")),
    p_fecha: txt(form.get("fecha")),
  });
  if (error) return { error: error.message };
  refrescar(clienteId);
  return { ok: true };
}

export async function cambiarFechaFin(_p: Resultado, form: FormData): Promise<Resultado> {
  await exigirRol("direccion");
  const clienteId = String(form.get("cliente_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_fecha_fin", {
    p_contrato: String(form.get("contrato_id")),
    p_fecha: form.get("recalcular") ? null : txt(form.get("fecha_fin")),
  });
  if (error) return { error: error.message };
  refrescar(clienteId);
  return { ok: true };
}
