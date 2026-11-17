import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Rol = "direccion" | "comercial" | "equipo";
export type Usuario = { id: string; nombre: string; email: string; rol: Rol; activo: boolean };

export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("usuarios").select("id, nombre, email, rol, activo").eq("id", user.id).single();
  return (data as Usuario) ?? null;
});

/** Exige sesión y, opcionalmente, uno de los roles indicados. */
export async function exigirRol(...roles: Rol[]): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect("/login");
  if (!u.activo) redirect("/auth/sin-acceso");
  if (roles.length && !roles.includes(u.rol)) redirect("/");
  return u;
}
