"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BellRing } from "lucide-react";
import { cambiarEstado } from "@/app/(app)/propuestas/actions";
import { euros } from "@/lib/etiquetas";

type P = { id: string; empresa: string; titulo_plan: string; version: string; dias_desde_envio: number; importe_mensual: number };

export function AvisoSeguimiento({ propuestas }: { propuestas: P[] }) {
  const [pendiente, start] = useTransition();
  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
        <BellRing className="h-4 w-4" /> ¿Qué ha pasado con estas propuestas?
      </h2>
      <ul className="space-y-2">
        {propuestas.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 md:flex-row md:items-center">
            <Link href={`/propuestas/${p.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.empresa} · {p.titulo_plan} <span className="text-zinc-400">({p.version})</span>
              </p>
              <p className="text-xs text-zinc-500">
                Enviada hace {p.dias_desde_envio} días · {euros(p.importe_mensual)}/mes
                {p.dias_desde_envio >= 30 && (
                  <span className="ml-1 font-medium text-red-600">· más de 30 días sin respuesta</span>
                )}
              </p>
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link href={`/propuestas/${p.id}?accion=aceptar`} className="btn-exito px-3 py-1.5">
                Aceptada
              </Link>
              <Link href={`/propuestas/${p.id}?accion=denegar`} className="btn-peligro px-3 py-1.5">
                Denegada
              </Link>
              <button
                disabled={pendiente}
                onClick={() => start(() => cambiarEstado(p.id, "en_negociacion"))}
                className="btn-secundario px-3 py-1.5"
              >
                Sigue en negociación
              </button>
              {p.dias_desde_envio >= 30 && (
                <button
                  disabled={pendiente}
                  onClick={() => start(() => cambiarEstado(p.id, "sin_respuesta"))}
                  className="btn-secundario px-3 py-1.5"
                >
                  Marcar sin respuesta
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
