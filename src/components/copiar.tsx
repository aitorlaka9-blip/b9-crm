"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function Copiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="btn-secundario shrink-0 px-3 py-1.5"
    >
      {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {ok ? "Copiado" : etiqueta}
    </button>
  );
}
