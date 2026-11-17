import { ESTADOS_PROPUESTA, type EstadoPropuesta } from "@/lib/etiquetas";

export function EtiquetaEstado({ estado }: { estado: EstadoPropuesta }) {
  const e = ESTADOS_PROPUESTA[estado];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span>;
}

export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="text-sm text-zinc-500">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="tarjeta p-10 text-center text-sm text-zinc-500">{children}</div>;
}
