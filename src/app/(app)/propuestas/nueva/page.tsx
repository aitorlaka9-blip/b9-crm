import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { opcionesFormulario } from "@/lib/opciones";
import { Cabecera } from "@/components/ui";
import { FormularioPropuesta, type ValoresPropuesta } from "@/components/formulario-propuesta";

export default async function NuevaPropuestaPage({
  searchParams,
}: {
  searchParams: Promise<{ oportunidad?: string; cliente?: string; tipo?: string; desde?: string; contrato?: string }>;
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
        vendida_por: base.vendida_por,
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
    if (sp.contrato) {
      // Renovación con cambios: parte del contrato actual
      const supabase = await createClient();
      const { data: ct } = await supabase
        .from("contratos")
        .select("*, propuestas!contratos_propuesta_id_fkey(propuesta_servicios(servicio_id), preparada_por, vendida_por, vendida_por_tipo)")
        .eq("id", sp.contrato)
        .eq("cliente_id", c.id)
        .single();
      if (ct) {
        const pr = ct.propuestas as { propuesta_servicios: { servicio_id: string }[]; preparada_por: string | null; vendida_por: string | null; vendida_por_tipo: "interno" | "abx" } | null;
        valores = {
          ...valores,
          tipo: "renovacion",
          contrato_renovado_id: ct.id,
          titulo_plan: ct.titulo_plan,
          importe_mensual: ct.importe_mensual,
          importe_unico: 0,
          duracion_meses: ct.duracion_meses,
          servicios: pr?.propuesta_servicios.map((x) => x.servicio_id) ?? [],
          preparada_por: pr?.preparada_por ?? null,
          vendida_por: pr?.vendida_por ?? null,
          vendida_por_tipo: pr?.vendida_por_tipo ?? "interno",
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera
        titulo={o ? `Nueva versión · ${o.empresa}` : valores.contrato_renovado_id ? `Renovación con cambios · ${valores.empresa}` : "Nueva propuesta"}
        subtitulo={valores.contrato_renovado_id ? "Parte del contrato actual: cambia lo que haga falta. Seguirá el flujo normal de aceptar/denegar." : undefined}
      />
      <FormularioPropuesta valores={valores} {...opciones} />
    </div>
  );
}
