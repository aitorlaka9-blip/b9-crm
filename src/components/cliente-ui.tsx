"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, FileUp, Loader2, Pencil, RefreshCw, Repeat, Trash2, UserX } from "lucide-react";
import { Modal } from "@/components/modal";
import { createClient } from "@/lib/supabase/client";
import {
  actualizarCliente,
  borrarArchivo,
  cambiarEstadoCliente,
  cambiarFechaFin,
  darDeBaja,
  guardarResponsables,
  noRenueva,
  posponerRenovacion,
  registrarArchivo,
  renovarIgual,
  type Resultado,
} from "@/app/(app)/clientes/actions";
import { CATEGORIAS_NO_RENOVACION, ESTADOS_CLIENTE, euros, fecha, hoyISO } from "@/lib/etiquetas";

type Persona = { id: string; nombre: string; empresa: "b9" | "abx" };

function MensajeError({ r }: { r: Resultado }) {
  return r?.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{r.error}</p> : null;
}

function useCerrarAlTerminar(r: Resultado, cerrar: () => void) {
  useEffect(() => {
    if (r?.ok) cerrar();
  }, [r, cerrar]);
}

function CamposMotivo() {
  return (
    <>
      <fieldset>
        <legend className="label">Motivo *</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(CATEGORIAS_NO_RENOVACION).map(([k, t]) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-red-500 has-[:checked]:bg-red-50"
            >
              <input type="radio" name="categoria" value={k} required className="accent-red-600" />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label">Comentario *</label>
        <textarea name="comentario" required minLength={3} className="input min-h-24" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Estado del cliente
// ---------------------------------------------------------------------
export function EstadoCliente({ id, estado, puedeEditar }: { id: string; estado: keyof typeof ESTADOS_CLIENTE; puedeEditar: boolean }) {
  const [pendiente, start] = useTransition();
  const [baja, setBaja] = useState(false);
  const e = ESTADOS_CLIENTE[estado];
  if (!puedeEditar || estado === "baja") {
    return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${e.clase}`}>{e.texto}</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <select
        value={estado}
        disabled={pendiente}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === "baja") return setBaja(true);
          start(() => cambiarEstadoCliente(id, v as "onboarding" | "activo" | "en_pausa"));
        }}
        className={`rounded-full border-0 py-1 pl-3 pr-8 text-xs font-medium ${e.clase}`}
      >
        {estado === "baja_programada" && <option value="baja_programada">Baja programada</option>}
        <option value="onboarding">Onboarding</option>
        <option value="activo">Activo</option>
        <option value="en_pausa">En pausa</option>
        <option value="baja">Dar de baja…</option>
      </select>
      {pendiente && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
      {baja && <ModalBaja clienteId={id} onCerrar={() => setBaja(false)} />}
    </div>
  );
}

function ModalBaja({ clienteId, onCerrar }: { clienteId: string; onCerrar: () => void }) {
  const [r, accion, enviando] = useActionState(darDeBaja, undefined);
  useCerrarAlTerminar(r, onCerrar);
  return (
    <Modal titulo="Dar de baja al cliente" onCerrar={onCerrar}>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <CamposMotivo />
        <div>
          <label className="label">Fecha de baja</label>
          <input type="date" name="fecha" defaultValue={hoyISO()} className="input" />
          <p className="mt-1 text-xs text-zinc-500">Si es futura, el cliente queda en &quot;Baja programada&quot; hasta ese día.</p>
        </div>
        <MensajeError r={r} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button className="btn-peligro" disabled={enviando}>
            Dar de baja
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Aviso de renovación con sus 4 acciones
// ---------------------------------------------------------------------
export type ContratoUI = {
  id: string;
  titulo_plan: string;
  importe_mensual: number;
  duracion_meses: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_fin_editada: boolean;
  estado_renovacion: string;
  dias_para_fin: number;
  pospuesto_hasta: string | null;
  renovacion_pendiente: boolean;
};

export function AccionesRenovacion({ clienteId, c, compacto = false }: { clienteId: string; c: ContratoUI; compacto?: boolean }) {
  const [modal, setModal] = useState<"igual" | "no" | "posponer" | null>(null);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cerrar = () => setModal(null);

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compacto ? "" : "mt-3"}`}>
        <button onClick={() => setModal("igual")} className="btn-exito px-3 py-1.5">
          <Repeat className="h-4 w-4" /> Renovar igual
        </button>
        <Link href={`/propuestas/nueva?cliente=${clienteId}&tipo=renovacion&contrato=${c.id}`} className="btn-secundario px-3 py-1.5">
          <RefreshCw className="h-4 w-4" /> Renovar con cambios
        </Link>
        <button onClick={() => setModal("no")} className="btn-secundario px-3 py-1.5 text-red-700">
          <UserX className="h-4 w-4" /> No renueva
        </button>
        <button onClick={() => setModal("posponer")} className="btn-secundario px-3 py-1.5">
          <CalendarClock className="h-4 w-4" /> Posponer
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {modal === "igual" && (
        <Modal titulo="Renovar igual" onCerrar={cerrar}>
          <p className="text-sm text-zinc-600">
            Se renueva <b>{c.titulo_plan}</b> por otros <b>{c.duracion_meses} meses</b> a <b>{euros(c.importe_mensual)}/mes</b>, sin
            setup. El nuevo periodo empieza el {fecha(c.fecha_fin)}.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={cerrar} className="btn-secundario">
              Cancelar
            </button>
            <button
              disabled={pendiente}
              onClick={() =>
                start(async () => {
                  try {
                    await renovarIgual(clienteId, c.id);
                    cerrar();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                    cerrar();
                  }
                })
              }
              className="btn-exito"
            >
              {pendiente && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar renovación
            </button>
          </div>
        </Modal>
      )}
      {modal === "no" && <ModalNoRenueva clienteId={clienteId} contratoId={c.id} onCerrar={cerrar} />}
      {modal === "posponer" && <ModalPosponer clienteId={clienteId} c={c} onCerrar={cerrar} />}
    </>
  );
}

function ModalNoRenueva({ clienteId, contratoId, onCerrar }: { clienteId: string; contratoId: string; onCerrar: () => void }) {
  const [r, accion, enviando] = useActionState(noRenueva, undefined);
  useCerrarAlTerminar(r, onCerrar);
  return (
    <Modal titulo="El cliente no renueva" onCerrar={onCerrar}>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <input type="hidden" name="contrato_id" value={contratoId} />
        <CamposMotivo />
        <p className="text-xs text-zinc-500">El cliente pasará a &quot;Baja&quot; en la fecha de fin del contrato.</p>
        <MensajeError r={r} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button className="btn-peligro" disabled={enviando}>
            Confirmar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalPosponer({ clienteId, c, onCerrar }: { clienteId: string; c: ContratoUI; onCerrar: () => void }) {
  const [r, accion, enviando] = useActionState(posponerRenovacion, undefined);
  const [f, setF] = useState("");
  useCerrarAlTerminar(r, onCerrar);
  return (
    <Modal titulo="Posponer decisión" onCerrar={onCerrar}>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <input type="hidden" name="contrato_id" value={c.id} />
        <div>
          <label className="label">Volver a avisarme el *</label>
          <input type="date" name="fecha" required min={hoyISO()} value={f} onChange={(e) => setF(e.target.value)} className="input" />
          {f && f > c.fecha_fin && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Ojo: es posterior al fin del contrato ({fecha(c.fecha_fin)}).
            </p>
          )}
        </div>
        <MensajeError r={r} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
          <button className="btn-primario" disabled={enviando}>
            Posponer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditarFechaFin({ clienteId, c }: { clienteId: string; c: ContratoUI }) {
  const [abierto, setAbierto] = useState(false);
  const [r, accion, enviando] = useActionState(cambiarFechaFin, undefined);
  const cerrar = () => setAbierto(false);
  useCerrarAlTerminar(r, cerrar);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="text-zinc-400 hover:text-zinc-700" aria-label="Cambiar fecha de fin">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {abierto && (
        <Modal titulo="Fecha de fin del contrato" onCerrar={cerrar}>
          <form action={accion} className="space-y-4">
            <input type="hidden" name="cliente_id" value={clienteId} />
            <input type="hidden" name="contrato_id" value={c.id} />
            <p className="text-sm text-zinc-600">
              Calculada: inicio {fecha(c.fecha_inicio)} + {c.duracion_meses} meses.
            </p>
            <input type="date" name="fecha_fin" defaultValue={c.fecha_fin} className="input" />
            <MensajeError r={r} />
            <div className="flex flex-wrap justify-end gap-2">
              {c.fecha_fin_editada && (
                <button name="recalcular" value="1" className="btn-secundario" disabled={enviando}>
                  Volver a la calculada
                </button>
              )}
              <button className="btn-primario" disabled={enviando}>
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------
type DatosContacto = {
  id: string;
  empresa: string;
  nombre_contacto: string | null;
  sector: string | null;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  responsable_comercial_id: string | null;
};

export function EditarContacto({ c, equipo }: { c: DatosContacto; equipo: Persona[] }) {
  const [abierto, setAbierto] = useState(false);
  const [r, accion, enviando] = useActionState(actualizarCliente, undefined);
  const cerrar = () => setAbierto(false);
  useCerrarAlTerminar(r, cerrar);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn-secundario px-3 py-1.5">
        <Pencil className="h-4 w-4" /> Editar
      </button>
      {abierto && (
        <Modal titulo="Datos del cliente" onCerrar={cerrar}>
          <form action={accion} className="space-y-3">
            <input type="hidden" name="cliente_id" value={c.id} />
            {(
              [
                ["empresa", "Empresa / marca", "text"],
                ["nombre_contacto", "Persona de contacto", "text"],
                ["sector", "Sector", "text"],
                ["email", "Email", "email"],
                ["telefono", "Teléfono", "tel"],
                ["instagram", "Instagram", "text"],
              ] as const
            ).map(([k, t, type]) => (
              <div key={k}>
                <label className="label">{t}</label>
                <input name={k} type={type} defaultValue={c[k] ?? ""} required={k === "empresa"} className="input" />
              </div>
            ))}
            <div>
              <label className="label">Responsable comercial</label>
              <select name="responsable_comercial_id" defaultValue={c.responsable_comercial_id ?? ""} className="input">
                <option value="">—</option>
                {equipo.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.empresa === "abx" ? " (ABX)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <MensajeError r={r} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={cerrar} className="btn-secundario">
                Cancelar
              </button>
              <button className="btn-primario" disabled={enviando}>
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Responsables internos
// ---------------------------------------------------------------------
export function Responsables({
  clienteId,
  funciones,
  equipo,
  actuales,
  puedeEditar,
}: {
  clienteId: string;
  funciones: { id: string; nombre: string }[];
  equipo: Persona[];
  actuales: Record<string, string>;
  puedeEditar: boolean;
}) {
  const [r, accion, enviando] = useActionState(guardarResponsables, undefined);
  const [cambiado, setCambiado] = useState(false);
  useEffect(() => {
    if (r?.ok) setCambiado(false);
  }, [r]);
  const nombre = (id?: string) => equipo.find((e) => e.id === id)?.nombre;

  if (!puedeEditar) {
    return (
      <dl className="space-y-2">
        {funciones.map((f) => (
          <div key={f.id} className="flex justify-between gap-2 text-sm">
            <dt className="text-zinc-500">{f.nombre}</dt>
            <dd className="font-medium">{nombre(actuales[f.id]) ?? "—"}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <form action={accion} onChange={() => setCambiado(true)} className="space-y-2">
      <input type="hidden" name="cliente_id" value={clienteId} />
      {funciones.map((f) => (
        <label key={f.id} className="grid grid-cols-[1fr_1.3fr] items-center gap-2 text-sm">
          <span className="text-zinc-500">{f.nombre}</span>
          <select name={`resp_${f.id}`} defaultValue={actuales[f.id] ?? ""} className="input py-1.5">
            <option value="">—</option>
            {equipo
              .filter((e) => e.empresa === "b9")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
          </select>
        </label>
      ))}
      <MensajeError r={r} />
      {cambiado && (
        <button className="btn-primario w-full" disabled={enviando}>
          Guardar responsables
        </button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------
// Archivos del cliente
// ---------------------------------------------------------------------
export function Archivos({
  clienteId,
  archivos,
  puedeEditar,
}: {
  clienteId: string;
  archivos: { id: string; nombre: string; tipo: string; path: string; url: string | null; created_at: string }[];
  puedeEditar: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState("contrato");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const limpio = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
      const path = `${clienteId}/${Date.now()}_${limpio}`;
      const { error } = await createClient().storage.from("clientes").upload(path, file);
      if (error) throw error;
      await registrarArchivo(clienteId, path, file.name, tipo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      <ul className="mb-3 divide-y divide-zinc-100">
        {archivos.length === 0 && <li className="py-2 text-sm text-zinc-400">Sin archivos</li>}
        {archivos.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] uppercase text-zinc-500">{a.tipo}</span>
            {a.url ? (
              <a href={a.url} target="_blank" className="flex-1 truncate font-medium text-marca-600">
                {a.nombre}
              </a>
            ) : (
              <span className="flex-1 truncate">{a.nombre}</span>
            )}
            {puedeEditar && (
              <button
                disabled={pendiente}
                onClick={() => confirm("¿Borrar el archivo?") && start(() => borrarArchivo(clienteId, a.id, a.path))}
                className="text-zinc-300 hover:text-red-600"
                aria-label="Borrar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <div className="flex gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input w-auto py-1.5">
            <option value="contrato">Contrato</option>
            <option value="factura">Factura</option>
            <option value="propuesta">Propuesta</option>
            <option value="otro">Otro</option>
          </select>
          <button onClick={() => input.current?.click()} disabled={subiendo} className="btn-secundario flex-1 py-1.5">
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Subir archivo
          </button>
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
