// Junta todas las migraciones en un único archivo para pegarlo en el editor SQL de Supabase.
// Uso: npm run sql-instalacion
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "supabase/migrations";
const partes = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => `-- ===== ${f} =====\n${readFileSync(`${dir}/${f}`, "utf8")}`);
writeFileSync("supabase/instalar.sql",
  `-- B9 CRM · instalación completa de la base de datos.\n-- Pégalo entero en Supabase → SQL Editor → Run. Solo una vez, en un proyecto vacío.\n\n${partes.join("\n\n")}\n`);
console.log(`supabase/instalar.sql generado con ${partes.length} migraciones`);
