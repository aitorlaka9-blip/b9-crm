export function aCSV(filas: Record<string, unknown>[], columnas: [string, string][]) {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join(" | ") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = columnas.map(([, t]) => esc(t)).join(";");
  const cuerpo = filas.map((f) => columnas.map(([k]) => esc(f[k])).join(";"));
  // BOM + punto y coma: Excel en español lo abre bien directamente
  return "﻿" + [cab, ...cuerpo].join("\r\n");
}

export function respuestaCSV(contenido: string, nombre: string) {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
