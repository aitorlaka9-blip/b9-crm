import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = ["/login", "/auth", "/api/cron", "/api/ingesta", "/api/mcp"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  // diagnóstico temporal: cualquier petición que no venga de un navegador (p. ej. Claude)
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua.includes("Mozilla") && !ruta.startsWith("/api/mcp") && !ruta.startsWith("/.well-known")) {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (u && k) {
      await fetch(`${u}/rest/v1/registro_conector`, {
        method: "POST",
        headers: { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ metodo: request.method, ruta: ruta.replace(/[0-9a-f]{32,}/, "<llave>"), detalle: `ua=${ua}`, estado: 0 }),
      }).catch(() => {});
    }
  }
  // Rutas que usan programas (Claude, OAuth, Drive): nunca se redirigen al login.
  // Si no existen, responden 404, así Claude entiende que el conector no necesita iniciar sesión.
  if (ruta.startsWith("/.well-known") || ruta === "/register" || ruta === "/authorize" || ruta === "/token") {
    // diagnóstico temporal: se apunta la ruta que pide Claude
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      await fetch(`${url}/rest/v1/registro_conector`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ metodo: request.method, ruta: ruta.replace(/[0-9a-f]{32,}/, "<llave>"), detalle: `ua=${request.headers.get("user-agent")}`, estado: 404 }),
      }).catch(() => {});
    }
    return new NextResponse(null, { status: 404 });
  }
  const publica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r));
  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
