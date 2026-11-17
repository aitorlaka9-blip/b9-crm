"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { guardarPropuesta } from "@/app/(app)/propuestas/actions";
import { SubidaArchivo, type ArchivoSubido } from "@/components/subida-archivo";
import { hoyISO } from "@/lib/etiquetas";

export type Opcion = { id: string; nombre: string; empresa?: "b9" | "abx" };
export type OportunidadOpcion = {
  id: string;
  empresa: string;
  nombre_contacto: string | null;
  sector: string | null;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  cliente_id: string | null;
  versiones: string[];
};
export type ClienteOpcion = {
  id: string;
  empresa: string;
  nombre_contacto: string | null;
  sector: string | null;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
};

export type ValoresPropuesta = {
  propuesta_id?: string;
  oportunidad_id?: string | null;
  cliente_id?: string | null;
  empresa?: string;
  nombre_contacto?: string | null;
  sector?: string | null;
  email?: string | null;
  telefono?: string | null;
  instagram?: string | null;
  version?: string;
  tipo?: "nueva" | "upsell" | "renovacion";
  titulo_plan?: string;
  servicios?: string[]; // ids
  importe_mensual?: number | null;
  importe_unico?: number | null;
  duracion_meses?: number | null;
  fecha_envio?: string | null;
  preparada_por?: string | null;
  vendida_por_tipo?: "interno" | "abx";
  vendida_por?: string | null;
  vendida_por_nombre?: string | null;
  contrato_renovado_id?: string | null;
  notas?: string | null;
  archivo_nombre?: string | null;
};

type Modo = "nuevo" | "version" | "cliente";

function siguienteVersion(vs: string[]) {
  const letras = vs.filter((v) => /^[A-Z]$/.test(v)).sort();
  if (!letras.length) return vs.length ? String.fromCharCode(65 + vs.length) : "A";
  return String.fromCharCode(letras[letras.length - 1].charCodeAt(0) + 1);
}

export function FormularioPropuesta({
  valores = {},
  servicios,
  equipo,
  oportunidades = [],
  clientes = [],
  editando = false,
}: {
  valores?: ValoresPropuesta;
  servicios: Opcion[];
  equipo: Opcion[];
  oportunidades?: OportunidadOpcion[];
  clientes?: ClienteOpcion[];
  editando?: boolean;
}) {
  const [estado, accion, enviando] = useActionState(guardarPropuesta, undefined);
  const [modo, setModo] = useState<Modo>(valores.oportunidad_id ? "version" : valores.cliente_id ? "cliente" : "nuevo");
  const [v, setV] = useState<ValoresPropuesta>({
    version: "A",
    tipo: "nueva",
    vendida_por_tipo: "interno",
    fecha_envio: hoyISO(),
    servicios: [],
    ...valores,
  });
  const [archivo, setArchivo] = useState<ArchivoSubido | null>(null);

  const set = <K extends keyof ValoresPropuesta>(k: K, val: ValoresPropuesta[K]) => setV((x) => ({ ...x, [k]: val }));

  const oportunidad = useMemo(() => oportunidades.find((o) => o.id === v.oportunidad_id), [oportunidades, v.oportunidad_id]);

  function elegirOportunidad(id: string) {
    const o = oportunidades.find((x) => x.id === id);
    if (!o) return set("oportunidad_id", null);
    setV((x) => ({
      ...x,
      oportunidad_id: o.id,
      cliente_id: o.cliente_id,
      empresa: o.empresa,
      nombre_contacto: o.nombre_contacto,
      sector: o.sector,
      email: o.email,
      telefono: o.telefono,
      instagram: o.instagram,
      version: siguienteVersion(o.versiones),
    }));
  }

  function elegirCliente(id: string) {
    const c = clientes.find((x) => x.id === id);
    if (!c) return set("cliente_id", null);
    setV((x) => ({
      ...x,
      oportunidad_id: null,
      cliente_id: c.id,
      empresa: c.empresa,
      nombre_contacto: c.nombre_contacto,
      sector: c.sector,
      email: c.email,
      telefono: c.telefono,
      instagram: c.instagram,
      tipo: x.tipo === "nueva" ? "upsell" : x.tipo,
      version: "A",
    }));
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    if (m === "nuevo") setV((x) => ({ ...x, oportunidad_id: null, cliente_id: null, tipo: "nueva", version: "A" }));
  }

  const campo = (k: keyof ValoresPropuesta) => ({
    name: k,
    value: (v[k] as string | number | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(k, e.target.value as never),
  });

  return (
    <form action={accion} className="space-y-6">
      {v.propuesta_id && <input type="hidden" name="propuesta_id" value={v.propuesta_id} />}
      {v.oportunidad_id && <input type="hidden" name="oportunidad_id" value={v.oportunidad_id} />}
      {v.cliente_id && <input type="hidden" name="cliente_id" value={v.cliente_id} />}
      {v.contrato_renovado_id && <input type="hidden" name="contrato_renovado_id" value={v.contrato_renovado_id} />}
      <input type="hidden" name="vendida_por_tipo" value={v.vendida_por_tipo ?? "interno"} />
      {archivo && (
        <>
          <input type="hidden" name="archivo_path" value={archivo.path} />
          <input type="hidden" name="archivo_nombre" value={archivo.nombre} />
          <input type="hidden" name="archivo_hash" value={archivo.hash} />
        </>
      )}

      {/* Archivo */}
      <section className="tarjeta p-4 md:p-6">
        <h2 className="mb-3 font-semibold">Documento de la propuesta</h2>
        <SubidaArchivo
          actual={archivo ? { nombre: archivo.nombre } : v.archivo_nombre ? { nombre: v.archivo_nombre } : null}
          onSubido={setArchivo}
          onQuitar={() => {
            setArchivo(null);
            set("archivo_nombre", null);
          }}
        />
        <p className="mt-2 text-xs text-zinc-500">
          En la fase 3 el CRM leerá el documento con IA y rellenará el formulario automáticamente.
        </p>
      </section>

      {/* Cliente */}
      <section className="tarjeta space-y-4 p-4 md:p-6">
        <h2 className="font-semibold">Cliente o lead</h2>
        {!editando && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                ["nuevo", "Lead nuevo"],
                ["version", "Otra versión de una propuesta"],
                ["cliente", "Cliente actual (upsell / renovación)"],
              ] as [Modo, string][]
            ).map(([m, t]) => (
              <button
                key={m}
                type="button"
                onClick={() => cambiarModo(m)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  modo === m ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {!editando && modo === "version" && (
          <div>
            <label className="label">Oportunidad</label>
            <select className="input" value={v.oportunidad_id ?? ""} onChange={(e) => elegirOportunidad(e.target.value)} required>
              <option value="">Elige la propuesta original…</option>
              {oportunidades.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.empresa} — versiones: {o.versiones.join(", ")}
                </option>
              ))}
            </select>
          </div>
        )}

        {!editando && modo === "cliente" && (
          <div>
            <label className="label">Cliente</label>
            <select className="input" value={v.cliente_id ?? ""} onChange={(e) => elegirCliente(e.target.value)} required>
              <option value="">{clientes.length ? "Elige el cliente…" : "Todavía no hay clientes"}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.empresa}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Empresa / marca *</label>
            <input className="input" required {...campo("empresa")} />
          </div>
          <div>
            <label className="label">Persona de contacto</label>
            <input className="input" {...campo("nombre_contacto")} />
          </div>
          <div>
            <label className="label">Sector</label>
            <input className="input" placeholder="Ej. Clínica estética, inmobiliaria…" {...campo("sector")} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" {...campo("email")} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" type="tel" {...campo("telefono")} />
          </div>
          <div>
            <label className="label">Instagram</label>
            <input className="input" placeholder="@usuario" {...campo("instagram")} />
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="tarjeta space-y-4 p-4 md:p-6">
        <h2 className="font-semibold">Plan propuesto</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_120px_200px]">
          <div>
            <label className="label">Título del plan *</label>
            <input className="input" required placeholder="Ej. Content Pro" {...campo("titulo_plan")} />
          </div>
          <div>
            <label className="label">Versión</label>
            <input className="input" placeholder="A, B, final…" {...campo("version")} />
            {oportunidad && <p className="mt-1 text-xs text-zinc-500">Ya existen: {oportunidad.versiones.join(", ")}</p>}
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" {...campo("tipo")}>
              <option value="nueva">Cliente nuevo</option>
              <option value="upsell">Upsell</option>
              <option value="renovacion">Renovación</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Servicios incluidos</label>
          <div className="flex flex-wrap gap-2">
            {servicios.map((s) => {
              const marcado = v.servicios?.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`cursor-pointer select-none rounded-full border px-3 py-1.5 text-sm ${
                    marcado ? "border-marca-600 bg-marca-600 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="servicios"
                    value={s.id}
                    checked={!!marcado}
                    onChange={(e) =>
                      set(
                        "servicios",
                        e.target.checked ? [...(v.servicios ?? []), s.id] : (v.servicios ?? []).filter((x) => x !== s.id),
                      )
                    }
                    className="sr-only"
                  />
                  {s.nombre}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Importe mensual (€)</label>
            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" {...campo("importe_mensual")} />
          </div>
          <div>
            <label className="label">Importe único / setup (€)</label>
            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" {...campo("importe_unico")} />
          </div>
          <div>
            <label className="label">Duración (meses)</label>
            <input className="input" type="number" min="1" step="1" inputMode="numeric" {...campo("duracion_meses")} />
          </div>
        </div>
      </section>

      {/* Envío */}
      <section className="tarjeta space-y-4 p-4 md:p-6">
        <h2 className="font-semibold">Envío y venta</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Fecha de envío</label>
            <input className="input" type="date" {...campo("fecha_envio")} />
          </div>
          <div>
            <label className="label">Preparada por</label>
            <select className="input" {...campo("preparada_por")}>
              <option value="">—</option>
              {equipo.filter((e) => e.empresa !== "abx").map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Vendida por</label>
            <select
              className="input"
              name="vendida_por"
              value={v.vendida_por ?? ""}
              onChange={(e) => {
                const persona = equipo.find((x) => x.id === e.target.value);
                setV((x) => ({ ...x, vendida_por: e.target.value || null, vendida_por_tipo: persona?.empresa === "abx" ? "abx" : "interno" }));
              }}
            >
              <option value="">—</option>
              <optgroup label="Equipo interno B9">
                {equipo.filter((e) => e.empresa !== "abx").map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </optgroup>
              <optgroup label="ABX (empresa comercial)">
                {equipo.filter((e) => e.empresa === "abx").map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </optgroup>
            </select>
            {v.vendida_por_nombre && !v.vendida_por && (
              <p className="mt-1 text-xs text-zinc-500">Según el documento: {v.vendida_por_nombre}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500">Las personas de ABX se dan de alta en Ajustes → Equipo.</p>
          </div>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input min-h-20" {...campo("notas")} />
        </div>
        {!editando && (
          <div>
            <label className="label">Guardar como</label>
            <select name="estado" className="input md:w-64" defaultValue="enviada">
              <option value="enviada">Enviada</option>
              <option value="borrador">Borrador (aún no enviada)</option>
            </select>
          </div>
        )}
      </section>

      {estado?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{estado.error}</p>}

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl bg-white/90 p-2 backdrop-blur md:bottom-4">
        <button type="button" onClick={() => history.back()} className="btn-secundario">
          Cancelar
        </button>
        <button className="btn-primario min-w-32" disabled={enviando}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          {editando ? "Guardar cambios" : "Guardar propuesta"}
        </button>
      </div>
    </form>
  );
}
