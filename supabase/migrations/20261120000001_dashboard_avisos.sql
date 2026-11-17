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
