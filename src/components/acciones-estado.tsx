"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cambiarEstado, eliminarPropuesta } from "@/app/(app)/propuestas/actions";
import type { EstadoPropuesta } from "@/lib/etiquetas";

export function AccionesEstado({
  id,
  estado,
  diasDesdeEnvio,
  accionInicial,
  esDireccion,
}: {
  id: string;
  estado: EstadoPropuesta;
  diasDesdeEnvio: number | null;
  accionInicial?: string;
  esDireccion: boolean;
}) {
  const [pendiente, start] = useTransition();
  const abierta = ["borrador", "enviada", "en_negociacion"].includes(estado);
  const ir = (e: EstadoPropuesta) => start(() => cambiarEstado(id, e));

  return (
    <section className="tarjeta mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
      <p className="flex-1 text-sm font-medium">
        {estado === "borrador" && "Esta propuesta aún no se ha enviado."}
        {estado === "enviada" &&
          (diasDesdeEnvio != null && diasDesdeEnvio >= 7
            ? "¿Qué ha pasado con esta propuesta?"
            : "Propuesta enviada, esperando respuesta.")}
        {estado === "en_negociacion" && "En negociación con el cliente."}
        {!abierta && "Propuesta cerrada."}
      </p>
      <div className="flex flex-wrap gap-2">
        {estado === "borrador" && (
          <button disabled={pendiente} onClick={() => ir("enviada")} className="btn-primario">
            Marcar como enviada
          </button>
        )}
        {(estado === "enviada" || estado === "en_negociacion") && (
          <>
            <button disabled title="Disponible en la fase 2" className="btn-exito">
              Aceptada
            </button>
            <button disabled title="Disponible en la fase 2" className="btn-peligro">
              Denegada
            </button>
          </>
        )}
        {estado === "enviada" && (
          <button disabled={pendiente} onClick={() => ir("en_negociacion")} className="btn-secundario">
            Sigue en negociación
          </button>
        )}
        {abierta && estado !== "borrador" && (
          <button
            disabled={pendiente}
            onClick={() => ir("sin_respuesta")}
            className={diasDesdeEnvio != null && diasDesdeEnvio >= 30 ? "btn-secundario ring-2 ring-amber-300" : "btn-secundario"}
          >
            Sin respuesta
          </button>
        )}
        {(estado === "sin_respuesta" || estado === "en_negociacion") && (
          <button disabled={pendiente} onClick={() => ir("enviada")} className="btn-secundario">
            Reabrir como enviada
          </button>
        )}
        {esDireccion && (
          <button
            disabled={pendiente}
            onClick={() => {
              if (confirm("¿Eliminar esta propuesta? No se puede deshacer.")) start(() => eliminarPropuesta(id));
            }}
            className="btn-secundario text-red-600"
            aria-label="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {accionInicial && abierta && (
        <p className="w-full text-xs text-amber-700 md:hidden">Aceptar y denegar llegan en la fase 2.</p>
      )}
    </section>
  );
}
