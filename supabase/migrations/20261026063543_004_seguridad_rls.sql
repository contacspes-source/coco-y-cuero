-- =============================================================
-- 004 · Seguridad
-- Tres capas: RLS decide QUÉ FILAS, los GRANT por columna deciden
-- QUÉ CAMPOS, y un trigger crea el expediente al registrarse para
-- que nadie pueda autoasignarse el rol de administrador.
-- =============================================================

-- ¿El usuario actual es administrador?
-- security definer evita la recursión infinita de consultar
-- "cliente" desde una política que se aplica a "cliente".
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cliente
    where auth_user_id = auth.uid() and rol = 'admin'
  );
$$;

revoke execute on function public.es_admin() from public, anon;
grant  execute on function public.es_admin() to authenticated;

-- ---------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------
alter table public.genero           enable row level security;
alter table public.categoria        enable row level security;
alter table public.marca            enable row level security;
alter table public.familia_olfativa enable row level security;
alter table public.nota             enable row level security;
alter table public.perfume          enable row level security;
alter table public.perfume_nota     enable row level security;
alter table public.presentacion     enable row level security;
alter table public.canal_origen     enable row level security;
alter table public.cliente          enable row level security;
alter table public.proveedor        enable row level security;
alter table public.costo_proveedor  enable row level security;
alter table public.pedido           enable row level security;

-- ---------------------------------------------------------------
-- Catálogos de referencia: lectura pública, escritura de admin
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['genero','categoria','marca','familia_olfativa','nota','canal_origen']
  loop
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "admin escribe" on public.%I for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Perfume y sus partes: el público solo ve lo publicado
-- ---------------------------------------------------------------
create policy "lectura de publicados" on public.perfume
  for select to anon, authenticated
  using (publicado or (select public.es_admin()));

create policy "admin escribe" on public.perfume
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lectura de publicados" on public.presentacion
  for select to anon, authenticated
  using (exists (
    select 1 from public.perfume p
    where p.id = presentacion.perfume_id
      and (p.publicado or (select public.es_admin()))
  ));

create policy "admin escribe" on public.presentacion
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lectura de publicados" on public.perfume_nota
  for select to anon, authenticated
  using (exists (
    select 1 from public.perfume p
    where p.id = perfume_nota.perfume_id
      and (p.publicado or (select public.es_admin()))
  ));

create policy "admin escribe" on public.perfume_nota
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------
-- Solo administrador: proveedores y costos
-- Sin política para anon = acceso denegado por omisión.
-- ---------------------------------------------------------------
create policy "solo admin" on public.proveedor
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "solo admin" on public.costo_proveedor
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------
-- Cliente: cada quien ve y edita su propio expediente
-- ---------------------------------------------------------------
create policy "ve su expediente" on public.cliente
  for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.es_admin()));

create policy "edita su expediente" on public.cliente
  for update to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.es_admin()))
  with check (auth_user_id = (select auth.uid()) or (select public.es_admin()));

create policy "admin da de alta" on public.cliente
  for insert to authenticated
  with check ((select public.es_admin()));

create policy "admin da de baja" on public.cliente
  for delete to authenticated
  using ((select public.es_admin()));

-- Nadie cambia rol, número de cliente ni la cuenta enlazada desde la API.
-- Promover a administrador se hace a propósito, desde el editor SQL.
revoke insert, update on public.cliente from authenticated;
grant insert (auth_user_id, nombre, telefono, direccion, ciudad, canal_id)
  on public.cliente to authenticated;
grant update (nombre, telefono, direccion, ciudad, canal_id)
  on public.cliente to authenticated;

-- ---------------------------------------------------------------
-- Pedido: el cliente ve los suyos; solo el admin los registra
-- ---------------------------------------------------------------
create policy "ve sus pedidos" on public.pedido
  for select to authenticated
  using (
    (select public.es_admin())
    or cliente_id in (
      select c.id from public.cliente c where c.auth_user_id = (select auth.uid())
    )
  );

create policy "admin gestiona pedidos" on public.pedido
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------
-- Defensa en profundidad: el rol anónimo no tiene ni el permiso
-- base sobre datos sensibles, aunque RLS ya lo bloquee.
-- ---------------------------------------------------------------
revoke all on public.cliente         from anon;
revoke all on public.pedido          from anon;
revoke all on public.proveedor       from anon;
revoke all on public.costo_proveedor from anon;

-- ---------------------------------------------------------------
-- Registro: al crearse la cuenta se crea su expediente.
-- El rol NUNCA se toma de los datos que manda el usuario.
-- ---------------------------------------------------------------
create or replace function public.crear_cliente_al_registrarse()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nombre   text := trim(coalesce(new.raw_user_meta_data->>'nombre', ''));
  v_digitos  text := regexp_replace(coalesce(new.raw_user_meta_data->>'telefono', ''), '[^0-9]', '', 'g');
begin
  insert into public.cliente (auth_user_id, nombre, telefono, direccion, ciudad, canal_id)
  values (
    new.id,
    case when length(v_nombre) > 1 then v_nombre else 'Cliente nuevo' end,
    case when length(v_digitos) >= 10 then right(v_digitos, 10) end,  -- quita el 52 si viene
    nullif(trim(new.raw_user_meta_data->>'direccion'), ''),
    nullif(trim(new.raw_user_meta_data->>'ciudad'), ''),
    (select co.id from public.canal_origen co
      where co.nombre = new.raw_user_meta_data->>'canal')
  );
  return new;
end;
$$;

revoke execute on function public.crear_cliente_al_registrarse() from public, anon, authenticated;

create trigger al_registrarse
  after insert on auth.users
  for each row execute function public.crear_cliente_al_registrarse();

-- ---------------------------------------------------------------
-- Vista de margen para el panel (RF-10). security_invoker hace que
-- respete RLS: quien no es admin no ve costos, porque no puede leer
-- costo_proveedor.
-- ---------------------------------------------------------------
create view public.margen_actual
with (security_invoker = true) as
select
  pr.id                 as presentacion_id,
  pe.id                 as perfume_id,
  m.nombre              as marca,
  pe.nombre             as perfume,
  pe.tipo,
  pr.ml,
  pr.precio_venta,
  public.costo_vigente(pr.id)                         as costo,
  pr.precio_venta - public.costo_vigente(pr.id)       as ganancia,
  case when pr.precio_venta > 0
       then round((pr.precio_venta - public.costo_vigente(pr.id)) / pr.precio_venta, 4)
  end                                                 as margen
from public.presentacion pr
join public.perfume pe on pe.id = pr.perfume_id
join public.marca   m  on m.id  = pe.marca_id;

revoke all on public.margen_actual from anon;
