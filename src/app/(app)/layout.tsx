import { exigirRol } from "@/lib/sesion";
import { Navegacion } from "@/components/navegacion";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRol();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario.id)
    .is("leida_at", null);
  return (
    <div className="min-h-dvh md:flex">
      <Navegacion usuario={usuario} sinLeer={count ?? 0} />
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
    </div>
  );
}
