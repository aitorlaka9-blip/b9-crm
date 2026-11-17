"use server";

import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export async function anadirPersona(form: FormData) {
  await exigirRol("direccion");
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  await supabase.from("equipo").insert({
    nombre,
    email: String(form.get("email") ?? "").trim() || null,
    empresa: form.get("empresa") === "abx" ? "abx" : "b9",
  });
  revalidatePath("/ajustes");
}

export async function alternarPersona(id: string, activo: boolean) {
  await exigirRol("direccion");
  const supabase = await createClient();
  await supabase.from("equipo").update({ activo }).eq("id", id);
  revalidatePath("/ajustes");
}

export async function anadirServicio(form: FormData) {
  await exigirRol("direccion");
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  await supabase.from("servicios").insert({ nombre, orden: 1000 });
  revalidatePath("/ajustes");
}

export async function alternarServicio(id: string, activo: boolean) {
  await exigirRol("direccion");
  const supabase = await createClient();
  await supabase.from("servicios").update({ activo }).eq("id", id);
  revalidatePath("/ajustes");
}
