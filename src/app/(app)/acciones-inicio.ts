"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export async function completarRecordatorio(id: string) {
  await exigirRol("direccion", "comercial");
  const supabase = await createClient();
  await supabase.from("recordatorios").update({ completado_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/");
}

export async function guardarObjetivo(form: FormData) {
  await exigirRol("direccion");
  const v = Number(String(form.get("objetivo") ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return;
  const supabase = await createClient();
  await supabase.from("configuracion").upsert({ clave: "objetivo_mrr", valor: v });
  revalidatePath("/");
  revalidatePath("/ajustes");
}

export async function marcarNotificacion(id: string, enlace: string | null) {
  const u = await exigirRol();
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida_at: new Date().toISOString() }).eq("id", id).eq("usuario_id", u.id);
  revalidatePath("/", "layout");
  if (enlace?.startsWith("/")) redirect(enlace);
}

export async function marcarTodasLeidas() {
  const u = await exigirRol();
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida_at: new Date().toISOString() }).eq("usuario_id", u.id).is("leida_at", null);
  revalidatePath("/", "layout");
}
