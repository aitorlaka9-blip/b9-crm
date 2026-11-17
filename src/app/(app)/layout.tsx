import { exigirRol } from "@/lib/sesion";
import { Navegacion } from "@/components/navegacion";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRol();
  return (
    <div className="min-h-dvh md:flex">
      <Navegacion usuario={usuario} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
    </div>
  );
}
