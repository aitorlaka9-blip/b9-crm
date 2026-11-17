import { createClient } from "@/lib/supabase/server";
import type { ClienteOpcion, Opcion, OportunidadOpcion } from "@/components/formulario-propuesta";

export async function opcionesFormulario() {
  const supabase = await createClient();
  const [s, e, o, c] = await Promise.all([
    supabase.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("equipo").select("id, nombre, empresa").eq("activo", true).order("nombre"),
    supabase
      .from("oportunidades")
      .select("id, empresa, nombre_contacto, sector, email, telefono, instagram, cliente_id, propuestas(version)")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("clientes")
      .select("id, empresa, nombre_contacto, sector, email, telefono, instagram")
      .neq("estado", "baja")
      .order("empresa"),
  ]);
  return {
    servicios: (s.data ?? []) as Opcion[],
    equipo: (e.data ?? []) as Opcion[],
    oportunidades: (o.data ?? []).map(({ propuestas, ...x }) => ({
      ...x,
      versiones: (propuestas as { version: string }[]).map((p) => p.version).sort(),
    })) as OportunidadOpcion[],
    clientes: (c.data ?? []) as ClienteOpcion[],
  };
}
