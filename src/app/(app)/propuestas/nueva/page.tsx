import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { opcionesFormulario } from "@/lib/opciones";
import { Cabecera } from "@/components/ui";
import { FormularioPropuesta, type ValoresPropuesta } from "@/components/formulario-propuesta";

export default async function NuevaPropuestaPage({
  searchParams,
}: {
  searchParams: Promise<{ oportunidad?: string; cliente?: string; tipo?: string; desde?: string }>;
}) {
  await exigirRol("direccion", "comercial");
  const sp = await searchParams;
  const opciones = await opcionesFormulario();

  let valores: ValoresPropuesta = {};
  const o = opciones.oportunidades.find((x) => x.id === sp.oportunidad);
  if (o) {
    const letras = o.versiones.filter((v) => /^[A-Z]$/.test(v)).sort();
    valores = {
      oportunidad_id: o.id,
      cliente_id: o.cliente_id,
      empresa: o.empresa,
      nombre_contacto: o.nombre_contacto,
      sector: o.sector,
      email: o.email,
      telefono: o.telefono,
      instagram: o.instagram,
      version: letras.length ? String.fromCharCode(letras.at(-1)!.charCodeAt(0) + 1) : "B",
    };
  }
  if (o && sp.desde) {
    // Copiar el plan de la versión de origen
    const supabase = await createClient();
    const { data: base } = await supabase
      .from("propuestas")
      .select("*, propuesta_servicios(servicio_id)")
      .eq("id", sp.desde)
      .eq("oportunidad_id", o.id)
      .single();
    if (base) {
      valores = {
        ...valores,
        tipo: base.tipo,
        titulo_plan: base.titulo_plan,
        servicios: base.propuesta_servicios.map((x: { servicio_id: string }) => x.servicio_id),
        importe_mensual: base.importe_mensual,
        importe_unico: base.importe_unico,
        duracion_meses: base.duracion_meses,
        preparada_por: base.preparada_por,
        vendida_por_tipo: base.vendida_por_tipo,
        vendida_por_nombre: base.vendida_por_nombre,
      };
    }
  }
  const c = opciones.clientes.find((x) => x.id === sp.cliente);
  if (c) {
    valores = {
      cliente_id: c.id,
      empresa: c.empresa,
      nombre_contacto: c.nombre_contacto,
      sector: c.sector,
      email: c.email,
      telefono: c.telefono,
      instagram: c.instagram,
      tipo: sp.tipo === "renovacion" ? "renovacion" : "upsell",
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera titulo={o ? `Nueva versión · ${o.empresa}` : "Nueva propuesta"} />
      <FormularioPropuesta valores={valores} {...opciones} />
    </div>
  );
}
