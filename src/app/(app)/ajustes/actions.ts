"use server";

import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export async function anadirPersona(form: FormData) {
  await exigirRol("direccion");
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  const { data: u } = email ? await supabase.from("usuarios").select("id").eq("email", email).maybeSingle() : { data: null };
  await supabase.from("equipo").insert({
    nombre,
    email,
    empresa: form.get("empresa") === "abx" ? "abx" : "b9",
    usuario_id: u?.id ?? null,
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

// ---------- Usuarios y roles ----------
type Rol = "direccion" | "comercial" | "equipo";
const ROLES: Rol[] = ["direccion", "comercial", "equipo"];

export async function invitarUsuario(form: FormData) {
  await exigirRol("direccion");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const rol = String(form.get("rol")) as Rol;
  if (!email.includes("@") || !ROLES.includes(rol)) return;
  const supabase = await createClient();
  await supabase.from("invitaciones").upsert({ email, rol });
  // Si ya había entrado alguna vez, se activa con ese rol
  const { data: u } = await supabase.from("usuarios").update({ rol, activo: true }).eq("email", email).select("id").maybeSingle();
  if (u) await supabase.from("equipo").update({ usuario_id: u.id }).is("usuario_id", null).ilike("email", email);
  revalidatePath("/ajustes");
}

export async function borrarInvitacion(email: string) {
  await exigirRol("direccion");
  const supabase = await createClient();
  await supabase.from("invitaciones").delete().eq("email", email);
  revalidatePath("/ajustes");
}

export async function cambiarRol(id: string, form: FormData) {
  await exigirRol("direccion");
  const rol = String(form.get("rol")) as Rol;
  if (!ROLES.includes(rol)) return;
  const supabase = await createClient();
  await supabase.from("usuarios").update({ rol }).eq("id", id);
  revalidatePath("/ajustes");
}

export async function alternarUsuario(id: string, activo: boolean) {
  await exigirRol("direccion");
  const supabase = await createClient();
  const { data: u } = await supabase.from("usuarios").update({ activo }).eq("id", id).select("email").single();
  // Al desactivar se retira también la invitación para que no recupere el acceso
  if (!activo && u) await supabase.from("invitaciones").delete().eq("email", u.email);
  revalidatePath("/ajustes");
}
