-- =====================================================================
-- Fase 2: aceptar / denegar, ficha de cliente, renovaciones
-- =====================================================================

-- Personas del equipo pueden ser de B9 o de ABX (reciben avisos por email aunque no entren al CRM)
alter table public.equipo add column empresa text not null default 'b9' check (empresa in ('b9', 'abx'));

-- Quién vendió la propuesta (persona concreta, interna o de ABX)
alter table public.propuestas add column vendida_por uuid references public.equipo (id) on delete set null;
-- Propuesta de renovación con cambios: qué contrato renueva
alter table public.propuestas add column contrato_renovado_id uuid references public.contratos (id) on delete set null;

-- El responsable comercial de un cliente es una persona del equipo (puede ser de ABX)
alter table public.clientes drop column responsable_comercial_id;
alter table public.clientes add column responsable_comercial_id uuid references public.equipo (id) on delete set null;

-- La vista se recrea para incluir las columnas nuevas
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

-- Contratos con su situación de renovación calculada
create view public.v_contratos with (security_invoker = true) as
select
  c.*,
  cl.empresa,
  cl.estado as estado_cliente,
  cl.responsable_comercial_id,
  c.fecha_fin - current_date as dias_para_fin,
  a.pospuesto_hasta,
  (
    c.estado_renovacion in ('vigente', 'aviso_abierto', 'pospuesto', 'en_negociacion')
    and c.fecha_fin - current_date <= 30
    and (c.estado_renovacion <> 'pospuesto' or a.pospuesto_hasta is null or a.pospuesto_hasta <= current_date)
  ) as renovacion_pendiente,
  -- Cuenta para la facturación mientras está en su periodo; si venció sin decidir la renovación, sigue contando
  (c.fecha_inicio <= current_date and
   (c.fecha_fin > current_date or c.estado_renovacion in ('vigente', 'aviso_abierto', 'pospuesto', 'en_negociacion'))
  ) as en_vigor
from public.contratos c
join public.clientes cl on cl.id = c.cliente_id
left join public.avisos_renovacion a on a.contrato_id = c.id;
grant select on public.v_contratos to authenticated;

-- ---------------------------------------------------------------------
-- ACEPTAR una propuesta
--   · marca la propuesta como aceptada y descarta las demás versiones abiertas
--   · crea el cliente (o usa el existente) y le añade un contrato
--   · si es una renovación con cambios, el contrato nuevo sustituye al anterior
-- ---------------------------------------------------------------------
create or replace function public.aceptar_propuesta(
  p_propuesta uuid,
  p_fecha_inicio date,
  p_cliente uuid default null,
  p_responsable_comercial uuid default null,
  p_responsables jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_p public.propuestas%rowtype;
  v_o public.oportunidades%rowtype;
  v_cliente uuid;
  v_anterior public.contratos%rowtype;
  v_inicio date := p_fecha_inicio;
  r jsonb;
begin
  if not public.es_comercial_o_direccion() then
    raise exception 'Sin permiso';
  end if;

  select * into v_p from public.propuestas where id = p_propuesta for update;
  if not found then raise exception 'La propuesta no existe'; end if;
  if v_p.estado not in ('borrador', 'enviada', 'en_negociacion', 'sin_respuesta') then
    raise exception 'Esta propuesta ya está cerrada (%).', v_p.estado;
  end if;
  if v_p.duracion_meses is null then
    raise exception 'Indica la duración en meses de la propuesta antes de aceptarla.';
  end if;
  if v_inicio is null then raise exception 'Indica la fecha de inicio.'; end if;

  select * into v_o from public.oportunidades where id = v_p.oportunidad_id;
  v_cliente := coalesce(p_cliente, v_o.cliente_id);

  if v_cliente is null then
    insert into public.clientes (empresa, nombre_contacto, sector, email, telefono, instagram, estado,
                                 fecha_alta, responsable_comercial_id)
    values (v_o.empresa, v_o.nombre_contacto, v_o.sector, v_o.email, v_o.telefono, v_o.instagram, 'onboarding',
            v_inicio, coalesce(p_responsable_comercial, v_p.vendida_por))
    returning id into v_cliente;
  else
    -- cliente que vuelve tras una baja
    update public.clientes
       set estado = case when estado in ('baja', 'baja_programada') then 'onboarding' else estado end,
           fecha_baja = case when estado in ('baja', 'baja_programada') then null else fecha_baja end,
           responsable_comercial_id = coalesce(p_responsable_comercial, responsable_comercial_id, v_p.vendida_por),
           email = coalesce(email, v_o.email),
           telefono = coalesce(telefono, v_o.telefono),
           instagram = coalesce(instagram, v_o.instagram)
     where id = v_cliente;
  end if;

  update public.oportunidades set cliente_id = v_cliente where id = v_o.id;

  update public.propuestas set estado = 'aceptada' where id = v_p.id;
  update public.propuestas set estado = 'descartada_otra_version'
   where oportunidad_id = v_p.oportunidad_id and id <> v_p.id
     and estado in ('borrador', 'enviada', 'en_negociacion', 'sin_respuesta');

  if v_p.contrato_renovado_id is not null then
    select * into v_anterior from public.contratos where id = v_p.contrato_renovado_id for update;
    update public.contratos set estado_renovacion = 'renovado' where id = v_anterior.id;
    update public.avisos_renovacion
       set accion = 'renovar_con_cambios', gestionado_por = auth.uid(), gestionado_at = now()
     where contrato_id = v_anterior.id;
  end if;

  insert into public.contratos (cliente_id, propuesta_id, contrato_anterior_id, titulo_plan, importe_mensual,
                                importe_unico, duracion_meses, fecha_inicio, fecha_fin)
  values (v_cliente, v_p.id, v_anterior.id, v_p.titulo_plan, v_p.importe_mensual, v_p.importe_unico,
          v_p.duracion_meses, v_inicio, v_inicio);

  for r in select * from jsonb_array_elements(coalesce(p_responsables, '[]'::jsonb)) loop
    if nullif(r ->> 'persona_id', '') is null then
      delete from public.cliente_responsables
       where cliente_id = v_cliente and funcion_id = (r ->> 'funcion_id')::uuid;
    else
      insert into public.cliente_responsables (cliente_id, funcion_id, persona_id)
      values (v_cliente, (r ->> 'funcion_id')::uuid, (r ->> 'persona_id')::uuid)
      on conflict (cliente_id, funcion_id) do update set persona_id = excluded.persona_id;
    end if;
  end loop;

  return v_cliente;
end $$;

-- ---------------------------------------------------------------------
-- DENEGAR una propuesta (motivo obligatorio)
-- ---------------------------------------------------------------------
create or replace function public.denegar_propuesta(
  p_propuesta uuid,
  p_categoria categoria_motivo,
  p_comentario text,
  p_recontactar date default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_p public.propuestas%rowtype;
  v_empresa text;
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  if p_categoria is null then raise exception 'Elige la categoría del motivo.'; end if;
  if coalesce(trim(p_comentario), '') = '' then raise exception 'El comentario es obligatorio.'; end if;
  if p_categoria in ('resultados_insuficientes', 'presupuesto') then
    raise exception 'Categoría no válida para un rechazo de propuesta.';
  end if;

  select * into v_p from public.propuestas where id = p_propuesta for update;
  if not found then raise exception 'La propuesta no existe'; end if;
  if v_p.estado not in ('borrador', 'enviada', 'en_negociacion', 'sin_respuesta') then
    raise exception 'Esta propuesta ya está cerrada.';
  end if;

  insert into public.motivos (tipo, propuesta_id, categoria, comentario, recontactar_el, created_by)
  values ('rechazo_propuesta', v_p.id, p_categoria, trim(p_comentario), p_recontactar, auth.uid());

  update public.propuestas set estado = 'denegada' where id = v_p.id;

  if p_recontactar is not null then
    select empresa into v_empresa from public.oportunidades where id = v_p.oportunidad_id;
    insert into public.recordatorios (tipo, fecha, titulo, oportunidad_id, propuesta_id, asignado_a)
    values ('recontactar', p_recontactar, 'Volver a contactar a ' || v_empresa, v_p.oportunidad_id, v_p.id, auth.uid());
  end if;

  -- Si era una renovación con cambios, el contrato vuelve a tener la renovación pendiente
  if v_p.contrato_renovado_id is not null then
    update public.contratos set estado_renovacion = 'aviso_abierto'
     where id = v_p.contrato_renovado_id and estado_renovacion = 'en_negociacion';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RENOVACIONES
-- ---------------------------------------------------------------------
create or replace function public._aviso(p_contrato uuid, p_accion text, p_pospuesto date default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.avisos_renovacion (contrato_id, accion, pospuesto_hasta, gestionado_por, gestionado_at)
  values (p_contrato, p_accion, p_pospuesto, auth.uid(), now())
  on conflict (contrato_id) do update
    set accion = excluded.accion,
        pospuesto_hasta = coalesce(excluded.pospuesto_hasta, public.avisos_renovacion.pospuesto_hasta),
        ultimo_aviso_pospuesto_at = case when excluded.pospuesto_hasta is not null then null
                                         else public.avisos_renovacion.ultimo_aviso_pospuesto_at end,
        gestionado_por = excluded.gestionado_por,
        gestionado_at = excluded.gestionado_at;
end $$;

-- 1. Renovar igual: nuevo periodo con la misma duración e importe mensual, sin setup
create or replace function public.renovar_igual(p_contrato uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_c public.contratos%rowtype;
  v_nuevo uuid;
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'El contrato no existe'; end if;
  if v_c.estado_renovacion in ('renovado', 'no_renueva') then
    raise exception 'Este contrato ya está gestionado.';
  end if;

  insert into public.contratos (cliente_id, propuesta_id, contrato_anterior_id, titulo_plan, importe_mensual,
                                importe_unico, duracion_meses, fecha_inicio, fecha_fin)
  values (v_c.cliente_id, v_c.propuesta_id, v_c.id, v_c.titulo_plan, v_c.importe_mensual, 0,
          v_c.duracion_meses, v_c.fecha_fin, v_c.fecha_fin)
  returning id into v_nuevo;

  update public.contratos set estado_renovacion = 'renovado' where id = v_c.id;
  perform public._aviso(v_c.id, 'renovar_igual');
  return v_nuevo;
end $$;

-- 2. Renovar con cambios: la propuesta se crea desde la app; aquí se marca el contrato
create or replace function public.renovacion_en_negociacion(p_contrato uuid, p_propuesta uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  update public.propuestas set contrato_renovado_id = p_contrato, tipo = 'renovacion' where id = p_propuesta;
  update public.contratos set estado_renovacion = 'en_negociacion'
   where id = p_contrato and estado_renovacion not in ('renovado', 'no_renueva');
  perform public._aviso(p_contrato, 'renovar_con_cambios');
end $$;

-- 3. No renueva: motivo obligatorio; el cliente pasa a "Baja programada" (o a Baja si ya venció)
create or replace function public.no_renueva(p_contrato uuid, p_categoria categoria_motivo, p_comentario text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_c public.contratos%rowtype;
  v_otros boolean;
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  if p_categoria is null then raise exception 'Elige la categoría del motivo.'; end if;
  if coalesce(trim(p_comentario), '') = '' then raise exception 'El comentario es obligatorio.'; end if;

  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'El contrato no existe'; end if;
  if v_c.estado_renovacion in ('renovado', 'no_renueva') then
    raise exception 'Este contrato ya está gestionado.';
  end if;

  insert into public.motivos (tipo, contrato_id, cliente_id, categoria, comentario, created_by)
  values ('no_renovacion', v_c.id, v_c.cliente_id, p_categoria, trim(p_comentario), auth.uid());

  update public.contratos set estado_renovacion = 'no_renueva' where id = v_c.id;
  perform public._aviso(v_c.id, 'no_renueva');

  -- ¿Tiene otro contrato que siga después de este?
  select exists (
    select 1 from public.contratos o
     where o.cliente_id = v_c.cliente_id and o.id <> v_c.id
       and o.estado_renovacion not in ('renovado', 'no_renueva')
       and o.fecha_fin > v_c.fecha_fin
  ) into v_otros;

  if not v_otros then
    update public.clientes
       set estado = case when v_c.fecha_fin <= current_date then 'baja'::estado_cliente else 'baja_programada'::estado_cliente end,
           fecha_baja = v_c.fecha_fin
     where id = v_c.cliente_id;
  end if;
end $$;

-- 4. Posponer decisión
create or replace function public.posponer_renovacion(p_contrato uuid, p_fecha date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  if p_fecha is null or p_fecha <= current_date then
    raise exception 'La nueva fecha de recordatorio tiene que ser posterior a hoy.';
  end if;
  update public.contratos set estado_renovacion = 'pospuesto'
   where id = p_contrato and estado_renovacion not in ('renovado', 'no_renueva');
  if not found then raise exception 'Este contrato ya está gestionado.'; end if;
  perform public._aviso(p_contrato, 'posponer', p_fecha);
end $$;

-- Cambiar la fecha de fin a mano (deja de calcularse sola)
create or replace function public.cambiar_fecha_fin(p_contrato uuid, p_fecha date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.es_direccion() then raise exception 'Solo Dirección puede cambiar la fecha de fin.'; end if;
  if p_fecha is null then
    update public.contratos set fecha_fin_editada = false where id = p_contrato;
  else
    update public.contratos set fecha_fin = p_fecha, fecha_fin_editada = true where id = p_contrato;
  end if;
end $$;

-- Baja manual de un cliente (motivo obligatorio)
create or replace function public.dar_de_baja(p_cliente uuid, p_categoria categoria_motivo, p_comentario text,
                                              p_fecha date default current_date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.es_comercial_o_direccion() then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_comentario), '') = '' then raise exception 'El comentario es obligatorio.'; end if;
  insert into public.motivos (tipo, cliente_id, categoria, comentario, created_by)
  values ('baja', p_cliente, p_categoria, trim(p_comentario), auth.uid());
  update public.clientes
     set estado = case when coalesce(p_fecha, current_date) <= current_date then 'baja'::estado_cliente else 'baja_programada'::estado_cliente end,
         fecha_baja = coalesce(p_fecha, current_date)
   where id = p_cliente;
  -- los contratos que siguen abiertos dejan de renovarse
  update public.contratos set estado_renovacion = 'no_renueva'
   where cliente_id = p_cliente and estado_renovacion not in ('renovado', 'no_renueva');
end $$;

-- Bajas programadas que ya han llegado a su fecha (lo ejecuta la comprobación diaria)
create or replace function public.procesar_bajas_programadas() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.clientes set estado = 'baja'
   where estado = 'baja_programada' and fecha_baja <= current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.procesar_bajas_programadas() from public, anon, authenticated;

-- Al ser el estado de baja un "cierre", impedimos ponerlo a mano sin motivo
create or replace function public.control_baja_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'baja' and old.estado is distinct from 'baja' and old.estado <> 'baja_programada'
     and not exists (select 1 from public.motivos m where m.cliente_id = new.id and m.tipo in ('baja', 'no_renovacion')) then
    raise exception 'Para dar de baja a un cliente hay que indicar el motivo.';
  end if;
  return new;
end $$;
create trigger clientes_control_baja before update on public.clientes
  for each row execute function public.control_baja_cliente();
