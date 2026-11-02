-- =============================================================
-- 015 · Endurecimiento del registro y de lo que escribe el cliente
--
-- Motivo: apareció un registro con correo @mailinator.com (desechable)
-- hecho por un script. Esta migración cierra lo que un bot puede
-- explotar aunque el CAPTCHA del sitio fallara o se saltara:
--
-- 1. Topes de longitud en todo lo que escribe un cliente (nombre,
--    dirección, ciudad, notas). Sin esto, una cuenta podía guardar
--    megabytes de texto y llenar la base.
-- 2. El trigger de registro recorta los metadatos en vez de confiar
--    en que vienen bien, y rechaza correos de dominios desechables.
-- 3. Lista de dominios desechables (privado.dominio_desechable) y un
--    hook "Before User Created" para Supabase Auth, que rechaza el
--    registro con un mensaje claro ANTES de crear la cuenta. El hook
--    se activa en Supabase → Authentication → Hooks (ver
--    docs/SEGURIDAD.md); si no está activado, el trigger del punto 2
--    sigue bloqueando, solo que con un mensaje genérico.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Topes de longitud
-- -------------------------------------------------------------
-- Primero se recorta lo que ya exista para que las restricciones
-- entren sin fallar (en producción no debería haber nada tan largo).
update public.cliente set
  nombre    = left(nombre, 120),
  direccion = left(direccion, 300),
  ciudad    = left(ciudad, 60)
where length(nombre) > 120 or length(direccion) > 300 or length(ciudad) > 60;

update public.pedido set
  notas          = left(notas, 500),
  ciudad_entrega = left(ciudad_entrega, 60)
where length(notas) > 500 or length(ciudad_entrega) > 60;

alter table public.cliente
  add constraint cliente_nombre_largo    check (length(nombre) <= 120),
  add constraint cliente_direccion_largo check (direccion is null or length(direccion) <= 300),
  add constraint cliente_ciudad_largo    check (ciudad is null or length(ciudad) <= 60);

alter table public.pedido
  add constraint pedido_notas_largo  check (notas is null or length(notas) <= 500),
  add constraint pedido_ciudad_largo check (ciudad_entrega is null or length(ciudad_entrega) <= 60);

-- -------------------------------------------------------------
-- 2 y 3. Dominios desechables
-- -------------------------------------------------------------
create table privado.dominio_desechable (
  dominio text primary key check (dominio = lower(dominio) and dominio !~ '\s')
);
comment on table privado.dominio_desechable is
  'Dominios de correo temporal que no se aceptan al registrarse. Agrega más con INSERT desde el editor SQL.';

-- nadie de la API lee ni escribe esta lista; solo las funciones de abajo
revoke all on privado.dominio_desechable from public, anon, authenticated;

insert into privado.dominio_desechable (dominio) values
  ('mailinator.com'), ('yopmail.com'), ('yopmail.fr'), ('guerrillamail.com'),
  ('guerrillamail.net'), ('guerrillamail.org'), ('sharklasers.com'), ('grr.la'),
  ('10minutemail.com'), ('10minutemail.net'), ('temp-mail.org'), ('tempmail.com'),
  ('tempmail.net'), ('tempr.email'), ('trashmail.com'), ('trashmail.me'),
  ('getnada.com'), ('nada.email'), ('dispostable.com'), ('maildrop.cc'),
  ('mohmal.com'), ('throwam.com'), ('fakeinbox.com'), ('mailnesia.com'),
  ('emailondeck.com'), ('mintemail.com'), ('mailcatch.com'), ('spamgourmet.com'),
  ('mytemp.email'), ('tempail.com'), ('moakt.com'), ('burnermail.io'),
  ('inboxkitten.com'), ('harakirimail.com'), ('mailsac.com'), ('33mail.com'),
  ('emailfake.com'), ('crazymailing.com'), ('tmpmail.org'), ('tmpmail.net'),
  ('mail-temp.com'), ('tempmailo.com'), ('luxusmail.org'), ('mailtemp.net'),
  ('1secmail.com'), ('1secmail.org'), ('1secmail.net'), ('dropmail.me'),
  ('mailpoof.com'), ('eyepaste.com'), ('spambog.com'), ('discard.email'),
  ('mailexpire.com'), ('cuvox.de'), ('dayrep.com'), ('einrot.com'),
  ('fleckens.hu'), ('gustr.com'), ('jourrapide.com'), ('rhyta.com'),
  ('superrito.com'), ('teleworm.us'), ('armyspy.com')
on conflict do nothing;

-- ¿Este correo es de un dominio desechable? (también cubre subdominios)
create or replace function privado.correo_desechable(p_correo text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from privado.dominio_desechable d
    where lower(split_part(coalesce(p_correo, ''), '@', 2)) = d.dominio
       or lower(split_part(coalesce(p_correo, ''), '@', 2)) like '%.' || d.dominio
  );
$$;
revoke execute on function privado.correo_desechable(text) from public, anon, authenticated;

-- 2. El trigger de registro: recorta y rechaza desechables.
-- Si rechaza, Supabase responde "Database error saving new user" y
-- el sitio lo traduce a "No aceptamos correos temporales".
create or replace function public.crear_cliente_al_registrarse()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nombre   text := left(trim(coalesce(new.raw_user_meta_data->>'nombre', '')), 120);
  v_digitos  text := regexp_replace(coalesce(new.raw_user_meta_data->>'telefono', ''), '[^0-9]', '', 'g');
begin
  if privado.correo_desechable(new.email) then
    raise exception 'No aceptamos correos temporales o desechables'
      using errcode = 'P0001', hint = 'correo_desechable';
  end if;

  insert into public.cliente (auth_user_id, nombre, telefono, direccion, ciudad, canal_id)
  values (
    new.id,
    case when length(v_nombre) > 1 then v_nombre else 'Cliente nuevo' end,
    case when length(v_digitos) >= 10 and length(v_digitos) <= 15 then right(v_digitos, 10) end,
    nullif(left(trim(new.raw_user_meta_data->>'direccion'), 300), ''),
    nullif(left(trim(new.raw_user_meta_data->>'ciudad'), 60), ''),
    (select co.id from public.canal_origen co
      where co.nombre = left(new.raw_user_meta_data->>'canal', 60))
  );
  return new;
end;
$$;

-- 3. Hook "Before User Created" de Supabase Auth.
-- Supabase lo llama con el usuario que está por crearse y, si
-- devolvemos {"error": …}, cancela el registro con ese mensaje.
-- Debe vivir en public y poder ejecutarlo supabase_auth_admin.
create or replace function public.hook_antes_de_crear_usuario(evento jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if privado.correo_desechable(evento #>> '{user,email}') then
    return jsonb_build_object('error', jsonb_build_object(
      'message',   'No aceptamos correos temporales o desechables. Usa tu correo personal.',
      'http_code', 400));
  end if;
  return '{}'::jsonb;
end;
$$;

grant  usage   on schema privado to supabase_auth_admin;
grant  execute on function privado.correo_desechable(text)         to supabase_auth_admin;
grant  select  on privado.dominio_desechable                       to supabase_auth_admin;
revoke execute on function public.hook_antes_de_crear_usuario(jsonb) from public, anon, authenticated;
grant  execute on function public.hook_antes_de_crear_usuario(jsonb) to supabase_auth_admin;
