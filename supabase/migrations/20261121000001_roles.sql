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
