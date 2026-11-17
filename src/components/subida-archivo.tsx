"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ArchivoSubido = { path: string; nombre: string; hash: string; file: File };

async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function SubidaArchivo({
  actual,
  onSubido,
  onQuitar,
}: {
  actual?: { nombre: string } | null;
  onSubido: (a: ArchivoSubido) => void;
  onQuitar?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setError(null);
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["pdf", "md", "markdown", "txt"].includes(ext ?? "")) {
      setError("Solo se admiten archivos PDF o .md");
      return;
    }
    setSubiendo(true);
    try {
      const hash = await sha256(file);
      const limpio = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_");
      const path = `${new Date().getFullYear()}/${hash.slice(0, 12)}_${limpio}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("propuestas").upload(path, file, {
        upsert: true,
        contentType: ext === "pdf" ? "application/pdf" : "text/markdown",
      });
      if (error) throw error;
      onSubido({ path, nombre: file.name, hash, file });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  }

  if (actual && !subiendo) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        <Paperclip className="h-4 w-4 text-zinc-500" />
        <span className="flex-1 truncate">{actual.nombre}</span>
        {onQuitar && (
          <button type="button" onClick={onQuitar} className="text-zinc-400 hover:text-zinc-700" aria-label="Quitar archivo">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          const f = e.dataTransfer.files[0];
          if (f) subir(f);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition ${
          encima ? "border-marca-500 bg-marca-50" : "border-zinc-300 bg-white hover:bg-zinc-50"
        }`}
      >
        {subiendo ? (
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        ) : (
          <FileUp className="h-6 w-6 text-zinc-400" />
        )}
        <span className="font-medium">{subiendo ? "Subiendo…" : "Arrastra aquí el PDF o .md de la propuesta"}</span>
        <span className="text-xs text-zinc-500">o pulsa para elegirlo</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
