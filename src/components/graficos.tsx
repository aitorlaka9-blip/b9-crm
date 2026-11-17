"use client";

import { useState } from "react";

/**
 * Barras horizontales de una sola serie (magnitud por categoría), ordenadas de mayor a menor.
 * Un solo color, extremo de dato redondeado, valor al final de la barra y tooltip al pasar.
 */
export function BarrasHorizontales({ datos, unidad }: { datos: { etiqueta: string; valor: number }[]; unidad: string }) {
  const [activa, setActiva] = useState<number | null>(null);
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return (
    <div>
      <ul className="space-y-2.5" role="list">
        {datos.map((d, i) => (
          <li
            key={d.etiqueta}
            className="relative grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 rounded-md py-0.5 sm:grid-cols-[12rem_1fr]"
            onMouseEnter={() => setActiva(i)}
            onMouseLeave={() => setActiva(null)}
            onFocus={() => setActiva(i)}
            onBlur={() => setActiva(null)}
            tabIndex={0}
            aria-label={`${d.etiqueta}: ${d.valor} ${unidad} (${Math.round((d.valor / total) * 100)} %)`}
          >
            <span className="truncate text-sm text-zinc-600">{d.etiqueta}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-4 rounded-r-[4px] transition-opacity"
                style={{
                  width: `${Math.max((d.valor / max) * 85, 1.5)}%`,
                  background: "#2a78d6",
                  opacity: activa === null || activa === i ? 1 : 0.45,
                }}
              />
              <span className="text-sm font-medium tabular-nums text-zinc-800">{d.valor}</span>
            </span>
            {activa === i && (
              <span className="pointer-events-none absolute -top-9 left-40 z-10 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg sm:left-48">
                {d.etiqueta}: <b>{d.valor}</b> {unidad} · {Math.round((d.valor / total) * 100)} %
              </span>
            )}
          </li>
        ))}
      </ul>
      <details className="mt-4 text-xs text-zinc-500">
        <summary className="cursor-pointer">Ver como tabla</summary>
        <table className="mt-2 w-full">
          <tbody>
            {datos.map((d) => (
              <tr key={d.etiqueta} className="border-b border-zinc-100">
                <td className="py-1">{d.etiqueta}</td>
                <td className="py-1 text-right tabular-nums">{d.valor}</td>
                <td className="py-1 text-right tabular-nums">{Math.round((d.valor / total) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
