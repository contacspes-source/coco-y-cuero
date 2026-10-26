-- =============================================================
-- 011 · Clientes y pedidos (incremento 4)
--
-- 1. Descripción del perfume (la escribe el admin, la ve el sitio).
-- 2. Historial de estados de cada pedido, con fecha.
-- 3. Nota interna del pedido en tabla aparte: el cliente nunca la ve.
-- 4. Vista pedido_detalle: la usan el panel (todos) y "Mi cuenta"
--    (solo los propios; RLS decide).
-- 5. El cliente puede SOLICITAR un pedido y cancelarlo mientras
--    siga en "consultado", siempre a través de funciones que fijan
--    precio y estado. No puede escribir en la tabla directamente.
-- 6. Lista de clientes para el panel, con correo y totales.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Descripción
-- -------------------------------------------------------------
alter table public.perfume
  add column descripcion text
  check (descripcion is null or length(descripcion) <= 1200);

drop view public.catalogo_publico;
create view public.catalogo_publico
with (security_invoker = true) as
select
  p.id,
  m.nombre                 as marca,
  p.nombre,
  p.tipo,
  g.clave                  as genero,
  c.clave                  as categoria,
  p.imagen_url,
  p.descripcion,
  coalesce((
    select json_agg(json_build_object('ml', pr.ml, 'precio', pr.precio_venta) order by pr.ml)
    from public.presentacion pr
    where pr.perfume_id = p.id
  ), '[]'::json)           as presentaciones,
  coalesce((
    select json_agg(json_build_object('nota', n.nombre, 'familia', f.nombre) order by n.nombre)
    from public.perfume_nota pn
    join public.nota n on n.id = pn.nota_id
    left join public.familia_olfativa f on f.id = n.familia_id
    where pn.perfume_id = p.id
  ), '[]'::json)           as notas,
  p.actualizado_en
from public.perfume p
join public.marca     m on m.id = p.marca_id
join public.genero    g on g.id = p.genero_id
join public.categoria c on c.id = p.categoria_id
where p.publicado;

comment on view public.catalogo_publico is
  'Catálogo que ve el sitio público: solo perfumes publicados, sin costos.';
revoke all on public.catalogo_publico from anon, authenticated;
grant select on public.catalogo_publico to anon, authenticated;

-- guardar_perfume ahora también guarda la descripción
create or replace function public.guardar_perfume(p_datos jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id         bigint := nullif(p_datos->>'id', '')::bigint;
  v_marca      text   := trim(coalesce(p_datos->>'marca', ''));
  v_nombre     text   := trim(coalesce(p_datos->>'nombre', ''));
  v_desc       text   := nullif(trim(coalesce(p_datos->>'descripcion', '')), '');
  v_marca_id   bigint;
  v_proveedor  bigint;
  v_pres       jsonb;
  v_pres_id    bigint;
  v_conservar  bigint[] := '{}';
  v_costo      numeric;
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede modificar el catálogo'
      using errcode = '42501';
  end if;

  if length(v_marca) < 2 then
    raise exception 'Falta la marca' using errcode = 'P0001', hint = 'marca';
  end if;
  if length(v_nombre) < 2 then
    raise exception 'Falta el nombre del perfume' using errcode = 'P0001', hint = 'nombre';
  end if;
  if jsonb_typeof(p_datos->'presentaciones') is distinct from 'array'
     or jsonb_array_length(p_datos->'presentaciones') = 0 then
    raise exception 'El perfume necesita al menos una presentación'
      using errcode = 'P0001', hint = 'presentaciones';
  end if;

  select id into v_marca_id from public.marca where lower(nombre) = lower(v_marca);
  if v_marca_id is null then
    insert into public.marca (nombre) values (v_marca) returning id into v_marca_id;
  end if;

  if v_id is null then
    insert into public.perfume (marca_id, genero_id, categoria_id, nombre, tipo, imagen_url, publicado, descripcion)
    values (v_marca_id,
            (p_datos->>'genero_id')::smallint,
            (p_datos->>'categoria_id')::smallint,
            v_nombre,
            p_datos->>'tipo',
            nullif(p_datos->>'imagen_url', ''),
            coalesce((p_datos->>'publicado')::boolean, true),
            v_desc)
    returning id into v_id;
  else
    update public.perfume set
      marca_id     = v_marca_id,
      genero_id    = (p_datos->>'genero_id')::smallint,
      categoria_id = (p_datos->>'categoria_id')::smallint,
      nombre       = v_nombre,
      tipo         = p_datos->>'tipo',
      imagen_url   = nullif(p_datos->>'imagen_url', ''),
      publicado    = coalesce((p_datos->>'publicado')::boolean, publicado),
      descripcion  = v_desc
    where id = v_id;
    if not found then
      raise exception 'El perfume % no existe', v_id using errcode = 'P0002';
    end if;
  end if;

  v_proveedor := coalesce(nullif(p_datos->>'proveedor_id', '')::bigint,
                          (select min(id) from public.proveedor));

  for v_pres in select * from jsonb_array_elements(p_datos->'presentaciones') loop
    v_pres_id := nullif(v_pres->>'id', '')::bigint;

    if v_pres_id is null then
      insert into public.presentacion (perfume_id, ml, precio_venta)
      values (v_id, (v_pres->>'ml')::smallint, (v_pres->>'precio_venta')::numeric)
      returning id into v_pres_id;
    else
      update public.presentacion
         set ml = (v_pres->>'ml')::smallint,
             precio_venta = (v_pres->>'precio_venta')::numeric
       where id = v_pres_id and perfume_id = v_id;
      if not found then
        raise exception 'La presentación % no pertenece a este perfume', v_pres_id
          using errcode = 'P0002';
      end if;
    end if;
    v_conservar := v_conservar || v_pres_id;

    v_costo := nullif(v_pres->>'costo', '')::numeric;
    if v_costo is not null
       and v_costo is distinct from privado.costo_vigente(v_pres_id) then
      if v_proveedor is null then
        raise exception 'No hay proveedores registrados' using errcode = 'P0001';
      end if;
      insert into public.costo_proveedor (presentacion_id, proveedor_id, costo)
      values (v_pres_id, v_proveedor, v_costo)
      on conflict (presentacion_id, proveedor_id, vigente_desde)
      do update set costo = excluded.costo;
    end if;
  end loop;

  begin
    delete from public.presentacion
     where perfume_id = v_id and not (id = any (v_conservar));
  exception when foreign_key_violation then
    raise exception 'No se puede quitar una presentación que ya tiene pedidos. Da de baja el perfume en su lugar.'
      using errcode = 'P0001', hint = 'presentacion_con_pedidos';
  end;

  if jsonb_typeof(p_datos->'notas') = 'array' then
    delete from public.perfume_nota where perfume_id = v_id;
    insert into public.perfume_nota (perfume_id, nota_id)
    select v_id, (n #>> '{}')::bigint
    from jsonb_array_elements(p_datos->'notas') n
    on conflict do nothing;
  end if;

  set constraints public.presentacion_precio_valido, public.costo_no_supera_precio immediate;
  set constraints public.presentacion_precio_valido, public.costo_no_supera_precio deferred;

  return v_id;
end;
$$;

-- -------------------------------------------------------------
-- 2. Historial de estados
-- -------------------------------------------------------------
create table public.pedido_evento (
  id         bigint generated always as identity primary key,
  pedido_id  bigint not null references public.pedido(id) on delete cascade,
  estado     text   not null,
  creado_en  timestamptz not null default now()
);
create index pedido_evento_pedido_idx on public.pedido_evento (pedido_id);

alter table public.pedido_evento enable row level security;
-- se ve si se ve el pedido (la subconsulta respeta el RLS de pedido)
create policy "ve el historial de pedidos visibles" on public.pedido_evento
  for select to authenticated
  using (exists (select 1 from public.pedido p where p.id = pedido_evento.pedido_id));
revoke all on public.pedido_evento from anon;
revoke insert, update, delete, truncate on public.pedido_evento from authenticated;

-- solo el trigger escribe el historial; nadie lo edita a mano
create or replace function privado.registrar_evento_pedido()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into public.pedido_evento (pedido_id, estado) values (new.id, new.estado);
  end if;
  return null;
end;
$$;
revoke execute on function privado.registrar_evento_pedido() from public, anon, authenticated;

create trigger pedido_historial
  after insert or update of estado on public.pedido
  for each row execute function privado.registrar_evento_pedido();

-- -------------------------------------------------------------
-- 3. Nota interna (solo admin)
-- -------------------------------------------------------------
create table public.pedido_nota_interna (
  pedido_id      bigint primary key references public.pedido(id) on delete cascade,
  nota           text not null check (length(nota) <= 1000),
  actualizado_en timestamptz not null default now()
);
alter table public.pedido_nota_interna enable row level security;
create policy "solo admin" on public.pedido_nota_interna
  for all to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
revoke all on public.pedido_nota_interna from anon;

-- -------------------------------------------------------------
-- 4. Vista de pedidos con todo lo necesario para mostrarlos
-- -------------------------------------------------------------
create view public.pedido_detalle
with (security_invoker = true) as
select
  pd.id,
  pd.estado,
  pd.precio_pactado,
  pd.anticipo,
  pd.precio_pactado - pd.anticipo   as saldo,
  pd.ciudad_entrega,
  pd.notas,
  ni.nota                           as nota_interna,
  pd.creado_en,
  pd.actualizado_en,
  pd.cliente_id,
  cl.numero_cliente,
  cl.nombre                         as cliente_nombre,
  cl.telefono                       as cliente_telefono,
  pd.presentacion_id,
  pr.ml,
  pe.id                             as perfume_id,
  pe.nombre                         as perfume,
  ma.nombre                         as marca,
  pe.imagen_url,
  coalesce((
    select json_agg(json_build_object('estado', ev.estado, 'fecha', ev.creado_en) order by ev.creado_en, ev.id)
    from public.pedido_evento ev
    where ev.pedido_id = pd.id
  ), '[]'::json)                    as historial
from public.pedido pd
left join public.pedido_nota_interna ni on ni.pedido_id = pd.id
left join public.cliente      cl on cl.id = pd.cliente_id
left join public.presentacion pr on pr.id = pd.presentacion_id
left join public.perfume      pe on pe.id = pr.perfume_id
left join public.marca        ma on ma.id = pe.marca_id;

revoke all on public.pedido_detalle from anon, authenticated;
grant select on public.pedido_detalle to authenticated;

-- -------------------------------------------------------------
-- 5. El cliente solicita y cancela sus pedidos
-- -------------------------------------------------------------
create or replace function public.solicitar_pedido(
  p_presentacion_id bigint,
  p_ciudad_entrega  text default null,
  p_notas           text default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cliente bigint;
  v_precio  numeric;
  v_ciudad  text;
  v_id      bigint;
begin
  select id, ciudad into v_cliente, v_ciudad
  from public.cliente where auth_user_id = auth.uid();
  if v_cliente is null then
    raise exception 'Inicia sesión con tu cuenta para apartar un perfume'
      using errcode = '42501';
  end if;

  -- el precio lo pone la base, nunca el navegador
  select pr.precio_venta into v_precio
  from public.presentacion pr
  join public.perfume pe on pe.id = pr.perfume_id
  where pr.id = p_presentacion_id and pe.publicado;
  if v_precio is null then
    raise exception 'Ese perfume ya no está disponible' using errcode = 'P0001';
  end if;

  if (select count(*) from public.pedido
      where cliente_id = v_cliente and estado = 'consultado') >= 5 then
    raise exception 'Ya tienes 5 solicitudes pendientes. Espera a que te contactemos por WhatsApp.'
      using errcode = 'P0001', hint = 'demasiadas_solicitudes';
  end if;

  insert into public.pedido (cliente_id, presentacion_id, estado, anticipo, precio_pactado, ciudad_entrega, notas)
  values (v_cliente, p_presentacion_id, 'consultado', 0, v_precio,
          coalesce(nullif(left(trim(p_ciudad_entrega), 60), ''), v_ciudad),
          nullif(left(trim(p_notas), 500), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancelar_mi_pedido(p_pedido_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.pedido pd set estado = 'cancelado'
  from public.cliente cl
  where pd.id = p_pedido_id
    and cl.id = pd.cliente_id
    and cl.auth_user_id = auth.uid()
    and pd.estado = 'consultado';
  if not found then
    raise exception 'Solo puedes cancelar tus solicitudes que aún no apartamos. Escríbenos por WhatsApp.'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.solicitar_pedido(bigint, text, text) from public, anon;
revoke execute on function public.cancelar_mi_pedido(bigint)          from public, anon;
grant  execute on function public.solicitar_pedido(bigint, text, text) to authenticated;
grant  execute on function public.cancelar_mi_pedido(bigint)          to authenticated;

-- -------------------------------------------------------------
-- 6. Clientes para el panel (con correo, que vive en auth.users)
-- -------------------------------------------------------------
create or replace function public.clientes_admin()
returns table (
  id              bigint,
  numero_cliente  integer,
  nombre          text,
  telefono        text,
  direccion       text,
  ciudad          text,
  canal           text,
  correo          text,
  rol             text,
  con_cuenta      boolean,
  creado_en       timestamptz,
  pedidos         bigint,
  pedidos_activos bigint,
  total_entregado numeric
)
language plpgsql security definer stable
set search_path = ''
as $$
begin
  if not privado.es_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
  return query
  select c.id, c.numero_cliente, c.nombre, c.telefono, c.direccion, c.ciudad,
         co.nombre, u.email::text, c.rol, c.auth_user_id is not null, c.creado_en,
         count(p.id),
         count(p.id) filter (where p.estado in ('consultado','apartado','comprado')),
         coalesce(sum(p.precio_pactado) filter (where p.estado = 'entregado'), 0)
  from public.cliente c
  left join public.canal_origen co on co.id = c.canal_id
  left join auth.users u on u.id = c.auth_user_id
  left join public.pedido p on p.cliente_id = c.id
  group by c.id, co.nombre, u.email
  order by c.numero_cliente desc;
end;
$$;
revoke execute on function public.clientes_admin() from public, anon;
grant  execute on function public.clientes_admin() to authenticated;
