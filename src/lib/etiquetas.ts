export type EstadoPropuesta =
  | "borrador"
  | "enviada"
  | "en_negociacion"
  | "aceptada"
  | "denegada"
  | "sin_respuesta"
  | "descartada_otra_version";

export const ESTADOS_PROPUESTA: Record<EstadoPropuesta, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-zinc-100 text-zinc-700" },
  enviada: { texto: "Enviada", clase: "bg-sky-100 text-sky-800" },
  en_negociacion: { texto: "En negociación", clase: "bg-amber-100 text-amber-800" },
  aceptada: { texto: "Aceptada", clase: "bg-emerald-100 text-emerald-800" },
  denegada: { texto: "Denegada", clase: "bg-red-100 text-red-800" },
  sin_respuesta: { texto: "Sin respuesta", clase: "bg-zinc-200 text-zinc-600" },
  descartada_otra_version: { texto: "Descartada por otra versión", clase: "bg-zinc-100 text-zinc-500 line-through" },
};

export const ESTADOS_ABIERTOS: EstadoPropuesta[] = ["borrador", "enviada", "en_negociacion"];

export const TIPOS_PROPUESTA = { nueva: "Cliente nuevo", upsell: "Upsell", renovacion: "Renovación" } as const;

export const VENDEDORES = { interno: "Equipo interno", abx: "ABX" } as const;

export const CATEGORIAS_RECHAZO = {
  precio: "Precio",
  timing: "Timing / no es el momento",
  no_encaja: "No encaja el servicio",
  competencia: "Se fue con la competencia",
  interno: "Lo hace internamente",
  sin_respuesta: "Sin respuesta",
  otro: "Otro",
} as const;

export const CATEGORIAS_NO_RENOVACION = {
  ...CATEGORIAS_RECHAZO,
  resultados_insuficientes: "Resultados insuficientes",
  presupuesto: "Problema de presupuesto",
} as const;

export const ESTADOS_CLIENTE = {
  onboarding: { texto: "Onboarding", clase: "bg-sky-100 text-sky-800" },
  activo: { texto: "Activo", clase: "bg-emerald-100 text-emerald-800" },
  en_pausa: { texto: "En pausa", clase: "bg-amber-100 text-amber-800" },
  baja_programada: { texto: "Baja programada", clase: "bg-orange-100 text-orange-800" },
  baja: { texto: "Baja", clase: "bg-zinc-200 text-zinc-600" },
} as const;

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function euros(n: number | string | null | undefined, decimales = false) {
  const v = Number(n ?? 0);
  return (decimales ? eur2 : eur).format(v);
}

export function fecha(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function fechaHora(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
}

export function hoyISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}
