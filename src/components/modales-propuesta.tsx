"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { aceptarPropuesta, denegarPropuesta } from "@/app/(app)/propuestas/actions";
import { CATEGORIAS_RECHAZO, hoyISO } from "@/lib/etiquetas";

export type DatosAceptar = {
  funciones: { id: string; nombre: string }[];
  equipo: { id: string; nombre: string; empresa: "b9" | "abx" }[];
  clienteActual: { id: string; empresa: string } | null;
  candidatos: { id: string; empresa: string; motivo: string }[];
  responsablesActuales: Record<string, string>;
  responsableComercial: string | null;
  fechaInicio: string | null;
  esRenovacion: boolean;
};

export function ModalAceptar({ propuestaId, datos, onCerrar }: { propuestaId: string; datos: DatosAceptar; onCerrar: () => void }) {
  const [estado, accion, enviando] = useActionState(aceptarPropuesta, undefined);
  return (
    <Modal titulo="Aceptar propuesta" onCerrar={onCerrar}>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="propuesta_id" value={propuestaId} />

        {datos.clienteActual ? (
          <>
            <input type="hidden" name="cliente_id" value={datos.clienteActual.id} />
            <p className="rounded-lg bg-zinc-50 p-3 text-sm">
              Se añadirá a la ficha de <b>{datos.clienteActual.empresa}</b>
              {datos.esRenovacion ? " como renovación del contrato actual." : "."}
            </p>
          </>
        ) : (
          <div>
            <label className="label">Ficha de cliente</label>
            <select name="cliente_id" className="input" defaultValue={datos.candidatos[0]?.id ?? ""}>
              <option value="">Crear cliente nuevo</option>
              {datos.candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  Añadir a {c.empresa} ({c.motivo})
                </option>
              ))}
            </select>
            {datos.candidatos.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">Parece que este cliente ya existe. Revisa para no duplicarlo.</p>
            )}
          </div>
        )}

        <div>
          <label className="label">Fecha de inicio *</label>
          <input type="date" name="fecha_inicio" required defaultValue={datos.fechaInicio ?? hoyISO()} className="input" />
        </div>

        <div>
          <label className="label">Responsable comercial (recibe los avisos de renovación)</label>
          <select name="responsable_comercial_id" className="input" defaultValue={datos.responsableComercial ?? ""}>
            <option value="">—</option>
            {datos.equipo.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.empresa === "abx" ? " (ABX)" : ""}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="label">Responsables internos</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {datos.funciones.map((f) => (
              <label key={f.id} className="text-xs text-zinc-500">
                {f.nombre}
                <select name={`resp_${f.id}`} className="input mt-0.5" defaultValue={datos.responsablesActuales[f.id] ?? ""}>
                  <option value="">—</option>
                  {datos.equipo
                    .filter((e) => e.empresa === "b9")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        {estado?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{estado.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button className="btn-exito" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar y crear ficha
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalDenegar({ propuestaId, onCerrar }: { propuestaId: string; onCerrar: () => void }) {
  const [estado, accion, enviando] = useActionState(denegarPropuesta, undefined);
  return (
    <Modal titulo="Denegar propuesta" onCerrar={onCerrar}>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="propuesta_id" value={propuestaId} />
        <fieldset>
          <legend className="label">Motivo *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(CATEGORIAS_RECHAZO).map(([k, t]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
                <input type="radio" name="categoria" value={k} required className="accent-red-600" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label">Comentario *</label>
          <textarea name="comentario" required minLength={3} className="input min-h-24" placeholder="Qué dijo el cliente, qué se podría haber hecho distinto…" />
        </div>
        <div>
          <label className="label">Volver a contactar el (opcional)</label>
          <input type="date" name="recontactar_el" min={hoyISO()} className="input" />
          <p className="mt-1 text-xs text-zinc-500">Se creará un recordatorio para ese día.</p>
        </div>
        {estado?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{estado.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button className="btn-peligro" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Denegar propuesta
          </button>
        </div>
      </form>
    </Modal>
  );
}
