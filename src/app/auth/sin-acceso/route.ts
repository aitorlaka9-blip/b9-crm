import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Cuenta sin invitación: se cierra la sesión y se vuelve al login con el aviso. */
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?error=sin_acceso", request.url));
}
