/**
 * Importación en bloque de propuestas (PDF y .md).
 *
 *   npm run importar -- "/ruta/a/la/carpeta"
 *
 * 1. Lee todos los PDF y .md de la carpeta (y subcarpetas).
 * 2. Salta los que ya están en el CRM (mismo archivo exacto).
 * 3. Extrae los datos de cada uno con la IA (los resultados se guardan en la carpeta,
 *    en ".b9-extracciones.json", para no pagar dos veces si lo vuelves a lanzar).
 * 4. Muestra un RESUMEN de lo que va a crear y pide confirmación.
 * 5. Crea las propuestas en estado "Enviada" y marcadas como "por revisar".
 *
 * Necesita estas variables (en .env.local o en el entorno):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { extraerPropuesta, type DatosExtraidos } from "../src/lib/extraccion";
import {
  cargarCatalogos,
  crearPropuesta,
  mapearDatos,
  notificarDireccion,
  planificar,
  sha256,
  subirArchivo,
} from "../src/lib/ingesta";

const args = process.argv.slice(2);
const carpeta = args.find((a) => !a.startsWith("--"));
const sinPreguntar = args.includes("--si");
const estado = args.includes("--borrador") ? "borrador" : "enviada";

if (!carpeta) {
  console.error('Uso: npm run importar -- "/ruta/a/la/carpeta" [--si]');
  process.exit(1);
}
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[v]) {
    console.error(`Falta la variable ${v}. Revisa el archivo .env.local`);
    process.exit(1);
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + " €";

async function listar(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) out.push(...(await listar(p)));
    else if (/\.(pdf|md|markdown)$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

type Item = {
  ruta: string;
  nombre: string;
  buffer: Buffer;
  hash: string;
  fechaArchivo: string;
  datos?: DatosExtraidos & { modelo?: string };
  error?: string;
};

async function main() {
  const raiz = path.resolve(carpeta!);
  const rutas = await listar(raiz);
  console.log(`\nEncontrados ${rutas.length} archivos en ${raiz}\n`);
  if (!rutas.length) return;

  const cachePath = path.join(raiz, ".b9-extracciones.json");
  const cache: Record<string, DatosExtraidos & { modelo?: string }> = await readFile(cachePath, "utf8")
    .then(JSON.parse)
    .catch(() => ({}));

  // 1. Leer y quitar duplicados
  const items: Item[] = [];
  const vistos = new Set<string>();
  let yaEnCrm = 0;
  for (const ruta of rutas) {
    const buffer = await readFile(ruta);
    const hash = sha256(buffer);
    if (vistos.has(hash)) continue;
    vistos.add(hash);
    const { data } = await sb.from("propuestas").select("id").eq("archivo_hash", hash).maybeSingle();
    if (data) {
      yaEnCrm++;
      continue;
    }
    const st = await stat(ruta);
    items.push({
      ruta,
      nombre: path.basename(ruta),
      buffer,
      hash,
      fechaArchivo: st.mtime.toISOString().slice(0, 10),
    });
  }
  if (yaEnCrm) console.log(`· ${yaEnCrm} ya estaban en el CRM y se saltan.`);
  if (!items.length) {
    console.log("No hay nada nuevo que importar.");
    return;
  }

  // 2. Extraer con IA (3 a la vez)
  const cat = await cargarCatalogos(sb);
  const servicios = cat.servicios.map((s) => s.nombre);
  let hechos = 0;
  const cola = [...items];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let it = cola.shift(); it; it = cola.shift()) {
        try {
          if (cache[it.hash]) it.datos = cache[it.hash];
          else {
            const r = await extraerPropuesta({ archivo: it.buffer, nombreArchivo: it.nombre, servicios });
            it.datos = { ...r.datos, modelo: r.modelo };
            cache[it.hash] = it.datos;
            await writeFile(cachePath, JSON.stringify(cache, null, 2));
          }
        } catch (e) {
          it.error = e instanceof Error ? e.message : String(e);
        }
        process.stdout.write(`\r· Leyendo con IA: ${++hechos}/${items.length}`);
      }
    }),
  );
  console.log("\n");

  // 3. Resumen
  const validos = items.filter((i) => i.datos && i.datos.es_propuesta_comercial);
  const noPropuesta = items.filter((i) => i.datos && !i.datos.es_propuesta_comercial);
  const errores = items.filter((i) => i.error);

  const grupos = new Map<string, number>();
  const filas = [];
  for (const it of validos) {
    const m = mapearDatos(it.datos!, cat);
    const plan = await planificar(sb, m);
    const clave = (m.email || m.empresa || it.nombre).toLowerCase();
    grupos.set(clave, (grupos.get(clave) ?? 0) + 1);
    const destino = plan.oportunidad_id
      ? `Versión nueva de ${plan.oportunidad_empresa}`
      : plan.cliente_id
        ? `Upsell de ${plan.cliente_empresa}`
        : grupos.get(clave)! > 1
          ? "Otra versión (mismo cliente en esta carpeta)"
          : "Lead nuevo";
    filas.push({
      Archivo: it.nombre.length > 34 ? it.nombre.slice(0, 33) + "…" : it.nombre,
      Cliente: m.empresa ?? "¿?",
      Plan: m.titulo_plan ?? "¿?",
      "€/mes": eur(m.importe_mensual),
      Setup: eur(m.importe_unico),
      Meses: m.duracion_meses ?? "—",
      Fecha: m.fecha_envio ?? `${it.fechaArchivo}*`,
      Destino: destino,
      Avisos: it.datos!.avisos.length,
    });
  }

  console.log(`RESUMEN — se van a crear ${validos.length} propuestas en estado "${estado === "enviada" ? "Enviada" : "Borrador"}":\n`);
  console.table(filas);
  console.log("  * fecha tomada del archivo (el documento no tenía fecha)");
  const conAvisos = validos.filter((i) => i.datos!.avisos.length);
  if (conAvisos.length) {
    console.log("\nAvisos de la IA (revisa estas propuestas después en el CRM):");
    for (const i of conAvisos) for (const a of i.datos!.avisos) console.log(`  · ${i.nombre}: ${a}`);
  }
  if (noPropuesta.length) {
    console.log(`\nSe saltan ${noPropuesta.length} archivos que no parecen propuestas comerciales:`);
    noPropuesta.forEach((i) => console.log(`  · ${i.nombre}`));
  }
  if (errores.length) {
    console.log(`\nNo se han podido leer ${errores.length} archivos:`);
    errores.forEach((i) => console.log(`  · ${i.nombre}: ${i.error}`));
  }

  const totalMensual = validos.reduce((s, i) => s + (i.datos!.importe_mensual ?? 0), 0);
  console.log(`\nTotal mensual propuesto: ${eur(totalMensual)}`);

  if (!validos.length) return;
  if (!sinPreguntar) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const r = (await rl.question(`\n¿Crear estas ${validos.length} propuestas? (s/N) `)).trim().toLowerCase();
    rl.close();
    if (r !== "s" && r !== "si" && r !== "sí") {
      console.log("Cancelado. No se ha creado nada (las lecturas de la IA quedan guardadas para la próxima vez).");
      return;
    }
  }

  // 4. Crear (en orden de fecha, para que las versiones queden A, B, C…)
  validos.sort((a, b) =>
    (mapearDatos(a.datos!, cat).fecha_envio ?? a.fechaArchivo).localeCompare(mapearDatos(b.datos!, cat).fecha_envio ?? b.fechaArchivo),
  );
  let creadas = 0;
  for (const it of validos) {
    try {
      const m = mapearDatos(it.datos!, cat);
      const plan = await planificar(sb, m); // se recalcula: ve las creadas justo antes
      const archivoPath = await subirArchivo(sb, it.buffer, it.nombre, it.hash);
      await crearPropuesta(sb, {
        m,
        plan,
        archivo: { path: archivoPath, nombre: it.nombre, hash: it.hash },
        extraccion: it.datos,
        fechaArchivo: it.fechaArchivo,
        origen: "importacion",
        estado,
      });
      creadas++;
      console.log(`  ✓ ${m.empresa} — ${m.titulo_plan} (${plan.version})`);
    } catch (e) {
      console.log(`  ✗ ${it.nombre}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (creadas) {
    await notificarDireccion(sb, {
      tipo: "importacion",
      titulo: `${creadas} propuestas importadas`,
      cuerpo: "Revisa los datos que ha extraído la IA y marca cuáles se aceptaron o denegaron.",
      enlace: "/propuestas?filtro=revisar",
      clave: `importacion-${Date.now()}`,
    });
  }
  console.log(`\nHecho: ${creadas} propuestas creadas. Ábrelas en el CRM → Propuestas → "Por revisar".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
