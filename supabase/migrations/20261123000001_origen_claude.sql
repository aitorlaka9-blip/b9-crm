-- Propuestas que llegan directamente desde Claude (conector del CRM)
alter table public.propuestas drop constraint propuestas_origen_check;
alter table public.propuestas add constraint propuestas_origen_check
  check (origen in ('manual', 'importacion', 'drive', 'claude'));
