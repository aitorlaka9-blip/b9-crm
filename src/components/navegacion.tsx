"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, Home, LogOut, Settings, Users } from "lucide-react";
import type { Usuario } from "@/lib/sesion";

const ROLES = { direccion: "Dirección", comercial: "Comercial", equipo: "Equipo" };

export function Navegacion({ usuario, sinLeer }: { usuario: Usuario; sinLeer: number }) {
  const ruta = usePathname();
  const items = [
    { href: "/", texto: "Inicio", icono: Home, roles: ["direccion", "comercial"] },
    { href: "/propuestas", texto: "Propuestas", icono: FileText, roles: ["direccion", "comercial"] },
    { href: "/clientes", texto: "Clientes", icono: Users, roles: ["direccion", "comercial", "equipo"] },
    { href: "/avisos", texto: "Avisos", icono: Bell, roles: ["direccion", "comercial", "equipo"] },
    { href: "/ajustes", texto: "Ajustes", icono: Settings, roles: ["direccion"] },
  ].filter((i) => i.roles.includes(usuario.rol));

  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

  return (
    <>
      {/* Escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">B9</span>
          <span className="font-semibold">CRM</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ href, texto, icono: Icono }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                activo(href) ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <Icono className="h-4 w-4" />
              {texto}
              {href === "/avisos" && sinLeer > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{sinLeer}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 pt-4">
          <p className="truncate px-2 text-sm font-medium">{usuario.nombre}</p>
          <p className="px-2 text-xs text-zinc-500">{ROLES[usuario.rol]}</p>
          <form action="/auth/salir" method="post">
            <button className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </form>
        </div>
      </aside>

      {/* Móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.map(({ href, texto, icono: Icono }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              activo(href) ? "text-zinc-900" : "text-zinc-400"
            }`}
          >
            <span className="relative">
              <Icono className="h-5 w-5" />
              {href === "/avisos" && sinLeer > 0 && (
                <span className="absolute -right-2 -top-1.5 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
                  {sinLeer > 9 ? "9+" : sinLeer}
                </span>
              )}
            </span>
            {texto}
          </Link>
        ))}
      </nav>
    </>
  );
}
