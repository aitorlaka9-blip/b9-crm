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
