-- B9 CRM · instalación completa de la base de datos.
-- Pégalo entero en Supabase → SQL Editor → Run. Solo una vez, en un proyecto vacío.

-- ===== 20261117000001_modelo_datos.sql =====
-- =====================================================================
-- B9 Creative Studios · CRM
-- Fase 1: modelo de datos completo
-- =====================================================================

-- ---------- Tipos ----------
create type rol_usuario as enum ('direccion', 'comercial', 'equipo');

create type estado_propuesta as enum (
  'borrador', 'enviada', 'en_negociacion', 'aceptada', 'denegada',
  'sin_respuesta', 'descartada_otra_version'
);

create type tipo_propuesta as enum ('nueva', 'upsell', 'renovacion');

create type vendedor_tipo as enum ('interno', 'abx');

create type estado_cliente as enum ('onboarding', 'activo', 'en_pausa', 'baja_programada', 'baja');

create type tipo_motivo as enum ('rechazo_propuesta', 'no_renovacion', 'baja');

create type categoria_motivo as enum (
  'precio', 'timing', 'no_encaja', 'competencia', 'interno', 'sin_respuesta',
  'resultados_insuficientes', 'presupuesto', 'otro'
);

create type estado_renovacion as enum (
  'vigente', 'aviso_abierto', 'en_negociacion', 'pospuesto', 'renovado', 'no_renueva'
);

-- ---------- Utilidades ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Usuarios (personas que entran al CRM) ----------
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text not null unique,
  rol rol_usuario not null default 'equipo',
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Emails autorizados a entrar y con qué rol. Quien no esté aquí no entra
-- (salvo el primer usuario del sistema, que entra como Dirección).
create table public.invitaciones (
  email text primary key,
  rol rol_usuario not null,
  created_at timestamptz not null default now()
);

create or replace function public.mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.usuarios where id = auth.uid() and activo
$$;

create or replace function public.es_direccion() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'direccion', false)
$$;

create or replace function public.es_comercial_o_direccion() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('direccion', 'comercial'), false)
$$;

-- Alta automática al hacer login por primera vez
create or replace function public.alta_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitaciones%rowtype;
  v_primero boolean;
begin
  select * into v_inv from public.invitaciones where lower(email) = lower(new.email);
  select not exists (select 1 from public.usuarios) into v_primero;

  insert into public.usuarios (id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(new.email),
    case when v_primero then 'direccion'::rol_usuario else coalesce(v_inv.rol, 'equipo') end,
    v_primero or v_inv.email is not null
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.alta_usuario();

-- ---------- Equipo interno (responsables; no necesitan login) ----------
create table public.equipo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  usuario_id uuid references public.usuarios (id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.funciones_internas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null default 0
);

-- ---------- Catálogo de servicios ----------
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null default 0,
  activo boolean not null default true
);

-- ---------- Clientes ----------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  nombre_contacto text,
  sector text,
  email text,
  telefono text,
  instagram text,
  estado estado_cliente not null default 'onboarding',
  fecha_alta date not null default current_date,
  fecha_baja date,
  responsable_comercial_id uuid references public.usuarios (id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();

create table public.cliente_responsables (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  funcion_id uuid not null references public.funciones_internas (id) on delete cascade,
  persona_id uuid not null references public.equipo (id) on delete cascade,
  primary key (cliente_id, funcion_id)
);

-- ---------- Oportunidades (agrupan las versiones de una propuesta) ----------
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  nombre_contacto text,
  empresa text not null,
  sector text,
  email text,
  telefono text,
  instagram text,
  cliente_id uuid references public.clientes (id) on delete set null,
  created_by uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger oportunidades_updated before update on public.oportunidades
  for each row execute function public.set_updated_at();

-- ---------- Propuestas (cada versión) ----------
create table public.propuestas (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  version text not null default 'A',
  tipo tipo_propuesta not null default 'nueva',
  titulo_plan text not null,
  importe_mensual numeric(10, 2) not null default 0 check (importe_mensual >= 0),
  importe_unico numeric(10, 2) not null default 0 check (importe_unico >= 0),
  duracion_meses int check (duracion_meses > 0),
  fecha_envio date,
  preparada_por uuid references public.equipo (id) on delete set null,
  vendida_por_tipo vendedor_tipo not null default 'interno',
  vendida_por_nombre text,
  estado estado_propuesta not null default 'borrador',
  fecha_decision timestamptz,
  archivo_path text,
  archivo_nombre text,
  archivo_hash text,
  extraccion_ia jsonb,
  notas text,
  created_by uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oportunidad_id, version)
);
create index propuestas_estado_idx on public.propuestas (estado, fecha_envio);
create unique index propuestas_archivo_hash_idx on public.propuestas (archivo_hash) where archivo_hash is not null;
create trigger propuestas_updated before update on public.propuestas
  for each row execute function public.set_updated_at();

create table public.propuesta_servicios (
  propuesta_id uuid not null references public.propuestas (id) on delete cascade,
  servicio_id uuid not null references public.servicios (id) on delete restrict,
  primary key (propuesta_id, servicio_id)
);

create table public.propuesta_eventos (
  id bigint generated always as identity primary key,
  propuesta_id uuid not null references public.propuestas (id) on delete cascade,
  estado_anterior estado_propuesta,
  estado_nuevo estado_propuesta not null,
  usuario_id uuid references public.usuarios (id) on delete set null,
  comentario text,
  created_at timestamptz not null default now()
);

-- ---------- Contratos (uno por propuesta aceptada / periodo renovado) ----------
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  propuesta_id uuid references public.propuestas (id) on delete set null,
  contrato_anterior_id uuid references public.contratos (id) on delete set null,
  titulo_plan text not null,
  importe_mensual numeric(10, 2) not null default 0,
  importe_unico numeric(10, 2) not null default 0,
  duracion_meses int not null check (duracion_meses > 0),
  fecha_inicio date not null,
  fecha_fin date not null,
  fecha_fin_editada boolean not null default false,
  estado_renovacion estado_renovacion not null default 'vigente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contratos_fin_idx on public.contratos (fecha_fin) where estado_renovacion <> 'renovado';

-- fecha de fin = inicio + duración, salvo que se haya editado a mano
create or replace function public.calcular_fecha_fin() returns trigger
language plpgsql as $$
begin
  if not new.fecha_fin_editada or new.fecha_fin is null then
    new.fecha_fin := (new.fecha_inicio + make_interval(months => new.duracion_meses))::date;
    new.fecha_fin_editada := false;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger contratos_fecha_fin before insert or update on public.contratos
  for each row execute function public.calcular_fecha_fin();

-- ---------- Motivos (rechazo de propuesta, no renovación, baja) ----------
create table public.motivos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_motivo not null,
  propuesta_id uuid references public.propuestas (id) on delete cascade,
  contrato_id uuid references public.contratos (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete cascade,
  categoria categoria_motivo not null,
  comentario text not null check (length(trim(comentario)) > 0),
  recontactar_el date,
  created_by uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (tipo = 'rechazo_propuesta' and propuesta_id is not null)
    or (tipo = 'no_renovacion' and contrato_id is not null)
    or (tipo = 'baja' and cliente_id is not null)
  )
);

-- ---------- Avisos de renovación ----------
create table public.avisos_renovacion (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references public.contratos (id) on delete cascade,
  abierto_at timestamptz not null default now(),
  aviso_30_at timestamptz,
  aviso_15_at timestamptz,
  aviso_7_at timestamptz,
  pospuesto_hasta date,
  ultimo_aviso_pospuesto_at timestamptz,
  accion text check (accion in ('renovar_igual', 'renovar_con_cambios', 'no_renueva', 'posponer')),
  gestionado_por uuid references public.usuarios (id) on delete set null,
  gestionado_at timestamptz
);

-- ---------- Recordatorios ----------
create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('recontactar', 'seguimiento', 'renovacion', 'otro')),
  fecha date not null,
  titulo text not null,
  oportunidad_id uuid references public.oportunidades (id) on delete cascade,
  propuesta_id uuid references public.propuestas (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete cascade,
  asignado_a uuid references public.usuarios (id) on delete set null,
  completado_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Notificaciones dentro de la app ----------
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  enlace text,
  clave text,
  leida_at timestamptz,
  created_at timestamptz not null default now(),
  unique (usuario_id, clave)
);

-- ---------- Notas y archivos ----------
create table public.notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete cascade,
  oportunidad_id uuid references public.oportunidades (id) on delete cascade,
  autor_id uuid references public.usuarios (id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now(),
  check (cliente_id is not null or oportunidad_id is not null)
);

create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null default 'otro' check (tipo in ('contrato', 'propuesta', 'factura', 'otro')),
  nombre text not null,
  path text not null,
  subido_por uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Reglas de negocio en la base de datos
-- =====================================================================

-- Historial de estados + no se puede denegar sin motivo
create or replace function public.control_estado_propuesta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    if new.estado = 'denegada' and not exists (
      select 1 from public.motivos m
      where m.propuesta_id = new.id and m.tipo = 'rechazo_propuesta'
    ) then
      raise exception 'No se puede denegar una propuesta sin indicar el motivo'
        using errcode = 'check_violation';
    end if;

    if new.estado in ('aceptada', 'denegada', 'sin_respuesta', 'descartada_otra_version') then
      new.fecha_decision := coalesce(new.fecha_decision, now());
    else
      new.fecha_decision := null;
    end if;

    if new.estado = 'enviada' and new.fecha_envio is null then
      new.fecha_envio := current_date;
    end if;
  end if;
  return new;
end $$;
create trigger propuestas_control_estado before insert or update on public.propuestas
  for each row execute function public.control_estado_propuesta();

create or replace function public.log_estado_propuesta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into public.propuesta_eventos (propuesta_id, estado_anterior, estado_nuevo, usuario_id)
    values (new.id, case when tg_op = 'UPDATE' then old.estado end, new.estado, auth.uid());
  end if;
  return new;
end $$;
create trigger propuestas_log_estado after insert or update on public.propuestas
  for each row execute function public.log_estado_propuesta();

-- =====================================================================
-- Vistas
-- =====================================================================
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
left join public.equipo eq on eq.id = p.preparada_por;

-- =====================================================================
-- Seguridad por filas (RLS)
-- Dirección: todo · Comercial: propuestas y clientes · Equipo: solo sus clientes, sin importes
-- =====================================================================
alter table public.usuarios enable row level security;
alter table public.invitaciones enable row level security;
alter table public.equipo enable row level security;
alter table public.funciones_internas enable row level security;
alter table public.servicios enable row level security;
alter table public.clientes enable row level security;
alter table public.cliente_responsables enable row level security;
alter table public.oportunidades enable row level security;
alter table public.propuestas enable row level security;
alter table public.propuesta_servicios enable row level security;
alter table public.propuesta_eventos enable row level security;
alter table public.contratos enable row level security;
alter table public.motivos enable row level security;
alter table public.avisos_renovacion enable row level security;
alter table public.recordatorios enable row level security;
alter table public.notificaciones enable row level security;
alter table public.notas enable row level security;
alter table public.archivos enable row level security;

-- Cliente asignado al usuario actual (rol Equipo)
create or replace function public.cliente_asignado(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cliente_responsables cr
    join public.equipo e on e.id = cr.persona_id
    where cr.cliente_id = p_cliente and e.usuario_id = auth.uid()
  )
$$;

-- usuarios
create policy usuarios_ver on public.usuarios for select to authenticated
  using (id = auth.uid() or public.mi_rol() is not null);
create policy usuarios_dir on public.usuarios for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());

create policy invitaciones_dir on public.invitaciones for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());

-- catálogos: todos los usuarios activos leen, Dirección edita
create policy equipo_ver on public.equipo for select to authenticated using (public.mi_rol() is not null);
create policy equipo_dir on public.equipo for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());
create policy funciones_ver on public.funciones_internas for select to authenticated using (public.mi_rol() is not null);
create policy funciones_dir on public.funciones_internas for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());
create policy servicios_ver on public.servicios for select to authenticated using (public.mi_rol() is not null);
create policy servicios_dir on public.servicios for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());

-- clientes
create policy clientes_ver on public.clientes for select to authenticated
  using (public.es_comercial_o_direccion() or public.cliente_asignado(id));
create policy clientes_editar on public.clientes for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy responsables_ver on public.cliente_responsables for select to authenticated
  using (public.es_comercial_o_direccion() or public.cliente_asignado(cliente_id));
create policy responsables_editar on public.cliente_responsables for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());

-- comercial: oportunidades, propuestas, motivos, contratos, avisos, recordatorios
create policy oportunidades_com on public.oportunidades for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy propuestas_com on public.propuestas for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy propuesta_servicios_com on public.propuesta_servicios for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy propuesta_eventos_com on public.propuesta_eventos for select to authenticated
  using (public.es_comercial_o_direccion());
create policy contratos_com on public.contratos for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy motivos_com on public.motivos for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy avisos_com on public.avisos_renovacion for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());
create policy recordatorios_com on public.recordatorios for all to authenticated
  using (public.es_comercial_o_direccion() or asignado_a = auth.uid())
  with check (public.es_comercial_o_direccion() or asignado_a = auth.uid());

-- notificaciones: cada uno las suyas
create policy notificaciones_propias on public.notificaciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- notas y archivos: comercial/dirección todo; equipo los de sus clientes
create policy notas_ver on public.notas for select to authenticated
  using (public.es_comercial_o_direccion() or (cliente_id is not null and public.cliente_asignado(cliente_id)));
create policy notas_crear on public.notas for insert to authenticated
  with check (
    autor_id = auth.uid()
    and (public.es_comercial_o_direccion() or (cliente_id is not null and public.cliente_asignado(cliente_id)))
  );
create policy notas_editar on public.notas for update to authenticated
  using (autor_id = auth.uid() or public.es_direccion());
create policy notas_borrar on public.notas for delete to authenticated
  using (autor_id = auth.uid() or public.es_direccion());

create policy archivos_ver on public.archivos for select to authenticated
  using (public.es_comercial_o_direccion() or public.cliente_asignado(cliente_id));
create policy archivos_editar on public.archivos for all to authenticated
  using (public.es_comercial_o_direccion()) with check (public.es_comercial_o_direccion());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.v_propuestas to authenticated;
revoke all on all tables in schema public from anon;

-- =====================================================================
-- Almacenamiento de archivos
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('propuestas', 'propuestas', false, 31457280, array['application/pdf', 'text/markdown', 'text/plain', 'application/octet-stream']),
  ('clientes', 'clientes', false, 52428800, null)
on conflict (id) do nothing;

create policy propuestas_archivos on storage.objects for all to authenticated
  using (bucket_id = 'propuestas' and public.es_comercial_o_direccion())
  with check (bucket_id = 'propuestas' and public.es_comercial_o_direccion());

-- en el bucket "clientes" la primera carpeta es el id del cliente
create policy clientes_archivos_ver on storage.objects for select to authenticated
  using (
    bucket_id = 'clientes'
    and (public.es_comercial_o_direccion()
         or public.cliente_asignado(((storage.foldername(name))[1])::uuid))
  );
create policy clientes_archivos_editar on storage.objects for all to authenticated
  using (bucket_id = 'clientes' and public.es_comercial_o_direccion())
  with check (bucket_id = 'clientes' and public.es_comercial_o_direccion());

-- =====================================================================
-- Datos iniciales
-- =====================================================================
insert into public.servicios (nombre, orden) values
  ('Gestión de redes', 10),
  ('Grabación en estudio', 20),
  ('Podcast', 30),
  ('Reels', 40),
  ('YouTube', 50),
  ('VSL', 55),
  ('Anuncios Meta', 60),
  ('Anuncios Google', 70),
  ('Branding', 80),
  ('Web', 90),
  ('UGC', 100),
  ('Entrevistas', 105),
  ('Eventos', 110);

insert into public.funciones_internas (nombre, orden) values
  ('Director/a de contenido', 10),
  ('Guionista', 20),
  ('Filmmaker', 30),
  ('Community manager', 40),
  ('Editor/a', 50),
  ('Anuncios', 60);


-- ===== 20261118000001_aceptar_denegar_clientes.sql =====
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


-- ===== 20261119000001_ingesta_ia.sql =====
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


-- ===== 20261120000001_dashboard_avisos.sql =====
-- =====================================================================
-- Fase 4: dashboard, avisos de renovación por email, comprobación diaria
-- =====================================================================

create table public.configuracion (
  clave text primary key,
  valor jsonb not null
);
insert into public.configuracion (clave, valor) values ('objetivo_mrr', '50000');
alter table public.configuracion enable row level security;
create policy configuracion_ver on public.configuracion for select to authenticated using (public.mi_rol() is not null);
create policy configuracion_dir on public.configuracion for all to authenticated
  using (public.es_direccion()) with check (public.es_direccion());
grant select, insert, update, delete on public.configuracion to authenticated;

-- Registro de emails enviados (también evita enviar dos veces el mismo aviso)
create table public.emails_enviados (
  id bigint generated always as identity primary key,
  clave text not null unique,
  destinatarios text[] not null,
  asunto text not null,
  estado text not null default 'enviado' check (estado in ('enviado', 'simulado', 'error')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.emails_enviados enable row level security;
create policy emails_dir on public.emails_enviados for select to authenticated using (public.es_direccion());
grant select on public.emails_enviados to authenticated;


-- ===== 20261121000001_roles.sql =====
-- =====================================================================
-- Fase 5: roles y acceso
-- =====================================================================

-- Al entrar por primera vez: rol según la invitación y enlace automático con su ficha del equipo (mismo email)
create or replace function public.alta_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitaciones%rowtype;
  v_primero boolean;
begin
  select * into v_inv from public.invitaciones where lower(email) = lower(new.email);
  select not exists (select 1 from public.usuarios) into v_primero;

  insert into public.usuarios (id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(new.email),
    case when v_primero then 'direccion'::rol_usuario else coalesce(v_inv.rol, 'equipo') end,
    v_primero or v_inv.email is not null
  );

  update public.equipo set usuario_id = new.id
   where usuario_id is null and lower(email) = lower(new.email);
  return new;
end $$;

-- Nadie puede quitarse a sí mismo el rol de Dirección ni desactivarse (evita quedarse sin administrador)
create or replace function public.proteger_usuario() returns trigger
language plpgsql as $$
begin
  if old.id = auth.uid() and (new.rol <> old.rol or new.activo <> old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte.';
  end if;
  return new;
end $$;
create trigger usuarios_proteger before update on public.usuarios
  for each row execute function public.proteger_usuario();


-- ===== 20261122000001_dueno.sql =====
-- El primer usuario solo se convierte en Dirección si no hay invitaciones.
-- Así, con la invitación del dueño creada de antemano, nadie más puede "adelantarse".
create or replace function public.alta_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitaciones%rowtype;
  v_primero boolean;
begin
  select * into v_inv from public.invitaciones where lower(email) = lower(new.email);
  select not exists (select 1 from public.usuarios) and not exists (select 1 from public.invitaciones) into v_primero;

  insert into public.usuarios (id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(new.email),
    case when v_primero then 'direccion'::rol_usuario else coalesce(v_inv.rol, 'equipo') end,
    v_primero or v_inv.email is not null
  );

  update public.equipo set usuario_id = new.id
   where usuario_id is null and lower(email) = lower(new.email);
  return new;
end $$;


-- ===== 20261123000001_origen_claude.sql =====
-- Propuestas que llegan directamente desde Claude (conector del CRM)
alter table public.propuestas drop constraint propuestas_origen_check;
alter table public.propuestas add constraint propuestas_origen_check
  check (origen in ('manual', 'importacion', 'drive', 'claude'));

