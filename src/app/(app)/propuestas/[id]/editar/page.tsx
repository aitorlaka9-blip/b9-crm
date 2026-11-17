import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { opcionesFormulario } from "@/lib/opciones";
import { Cabecera } from "@/components/ui";
import { FormularioPropuesta } from "@/components/formulario-propuesta";

export default async function EditarPropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirRol("direccion", "comercial");
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("propuestas")
    .select("*, oportunidades(*), propuesta_servicios(servicio_id)")
    .eq("id", id)
    .single();
  if (!p) notFound();
  const opciones = await opcionesFormulario();
  const o = p.oportunidades;

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecera titulo={`Editar · ${o.empresa}`} />
      <FormularioPropuesta
        editando
        {...opciones}
        valores={{
          propuesta_id: p.id,
          oportunidad_id: o.id,
          cliente_id: o.cliente_id,
          empresa: o.empresa,
          nombre_contacto: o.nombre_contacto,
          sector: o.sector,
          email: o.email,
          telefono: o.telefono,
          instagram: o.instagram,
          version: p.version,
          tipo: p.tipo,
          titulo_plan: p.titulo_plan,
          servicios: p.propuesta_servicios.map((x: { servicio_id: string }) => x.servicio_id),
          importe_mensual: p.importe_mensual,
          importe_unico: p.importe_unico,
          duracion_meses: p.duracion_meses,
          fecha_envio: p.fecha_envio,
          preparada_por: p.preparada_por,
          vendida_por_tipo: p.vendida_por_tipo,
          vendida_por: p.vendida_por,
          vendida_por_nombre: p.vendida_por_nombre,
          notas: p.notas,
          archivo_nombre: p.archivo_nombre,
        }}
      />
    </div>
  );
}
