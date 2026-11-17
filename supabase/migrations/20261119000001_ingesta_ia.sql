-- =====================================================================
-- Fase 3: extracción con IA e importación
-- =====================================================================

-- Propuestas creadas automáticamente (importación / carpeta de Drive) quedan "por revisar"
alter table public.propuestas add column revisada boolean not null default true;
alter table public.propuestas add column origen text not null default 'manual'
  check (origen in ('manual', 'importacion', 'drive'));

drop view public.v_propuestas;
create view public.v_propuestas with (security_invoker = true) as
select
  p.*,
  o.empresa,
  o.nombre_contacto,
  o.sector,
  o.email,
  o.telefono,
  o.instagram,
  o.cliente_id,
  eq.nombre as preparada_por_nombre,
  coalesce(vend.nombre, p.vendida_por_nombre) as vendedor_nombre,
  case when p.fecha_envio is not null then current_date - p.fecha_envio end as dias_desde_envio,
  coalesce(
    (select array_agg(s.nombre order by s.orden)
       from public.propuesta_servicios ps join public.servicios s on s.id = ps.servicio_id
      where ps.propuesta_id = p.id),
    '{}'
  ) as servicios,
  (select count(*) from public.propuestas p2 where p2.oportunidad_id = p.oportunidad_id) as num_versiones
from public.propuestas p
join public.oportunidades o on o.id = p.oportunidad_id
left join public.equipo eq on eq.id = p.preparada_por
left join public.equipo vend on vend.id = p.vendida_por;
grant select on public.v_propuestas to authenticated;
