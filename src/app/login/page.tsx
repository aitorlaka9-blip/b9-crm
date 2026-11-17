import { entrarConGoogle, entrarConPassword } from "./actions";

const ERRORES: Record<string, string> = {
  sin_acceso: "Tu cuenta todavía no tiene acceso. Pide a Dirección que te invite.",
  credenciales: "Email o contraseña incorrectos.",
  google: "No se ha podido entrar con Google. Inténtalo de nuevo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const devLogin = process.env.NEXT_PUBLIC_DEV_LOGIN === "1";

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="tarjeta w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-lg font-bold text-white">
            B9
          </div>
          <h1 className="text-xl font-semibold">B9 Creative Studios</h1>
          <p className="text-sm text-zinc-500">CRM interno</p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{ERRORES[error] ?? "Error al entrar."}</p>
        )}

        <form action={entrarConGoogle}>
          <button className="btn-secundario w-full py-3">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
            </svg>
            Entrar con Google
          </button>
        </form>

        {devLogin && (
          <form action={entrarConPassword} className="mt-6 space-y-3 border-t border-zinc-200 pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Acceso de pruebas (solo local)</p>
            <input name="email" type="email" required placeholder="Email" className="input" />
            <input name="password" type="password" required placeholder="Contraseña" className="input" />
            <button className="btn-primario w-full">Entrar</button>
          </form>
        )}
      </div>
    </main>
  );
}
