-- =============================================================
-- 016 · Clientes: baja lógica y detalle del canal; borrar perfumes
--
-- 1. cliente.canal_detalle: cuando "¿Cómo nos conociste?" = Otro, el
--    cliente escribe dónde o con quién. Viaja en los metadatos del
--    registro y lo guarda el trigger.
-- 2. cliente.activo: baja LÓGICA. Un cliente dado de baja desaparece
--    de la lista del panel, no puede apartar ni ver sus pedidos, pero
--    sus pedidos e historial se conservan para los reportes. Solo el
--    admin lo cambia (dar_de_baja_cliente / reactivar_cliente).
-- 3. eliminar_perfume: borra de verdad un perfume que no tiene pedidos
--    (presentaciones, costos y notas se van en cascada). Si tiene
--    pedidos, avisa: hay que darlo de baja (ocultar) en su lugar.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Detalle del canal
-- -------------------------------------------------------------
alter table public.cliente
  add column canal_detalle text check (canal_detalle is null or length(canal_detalle) <= 80);
comment on column public.cliente.canal_detalle is 'Solo cuando el canal es "Otro": dónde o con quién nos conoció.';

-- el cliente puede corregirlo desde Mi cuenta, igual que el canal
grant update (canal_detalle) on public.cliente to authenticated;
grant insert (canal_detalle) on public.cliente to authenticated;

-- -------------------------------------------------------------
-- 2. Baja lógica
-- -------------------------------------------------------------
alter table public.cliente
  add column activo boolean not null default true,
  add column baja_en timestamptz;
create index cliente_activo_idx on public.cliente (activo);

-- nadie cambia "activo" por la API: solo las funciones de abajo
-- (el GRANT UPDATE por columna de la 004 no lo incluye, así que ya
-- está bloqueado; se deja explícito)
revoke update (activo, baja_en) on public.cliente from authenticated;

create or replace function public.dar_de_baja_cliente(p_cliente_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede dar de baja clientes' using errcode = '42501';
  end if;
  if exists (select 1 from public.cliente where id = p_cliente_id and rol = 'admin') then
    raise exception 'No se puede dar de baja a un administrador' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedido
             where cliente_id = p_cliente_id and estado in ('apartado','comprado')) then
    raise exception 'Este cliente tiene pedidos apartados o comprados. Entrégalos o cancélalos antes de darlo de baja.'
      using errcode = 'P0001', hint = 'pedidos_en_curso';
  end if;
  -- las solicitudes sin anticipo se cancelan solas
  update public.pedido set estado = 'cancelado'
   where cliente_id = p_cliente_id and estado = 'consultado';
  update public.cliente set activo = false, baja_en = now()
   where id = p_cliente_id and activo;
  if not found then
    raise exception 'El cliente % no existe o ya estaba dado de baja', p_cliente_id using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.reactivar_cliente(p_cliente_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede reactivar clientes' using errcode = '42501';
  end if;
  update public.cliente set activo = true, baja_en = null
   where id = p_cliente_id and not activo;
  if not found then
    raise exception 'El cliente % no existe o ya estaba activo', p_cliente_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.dar_de_baja_cliente(bigint) from public, anon;
revoke execute on function public.reactivar_cliente(bigint)   from public, anon;
grant  execute on function public.dar_de_baja_cliente(bigint) to authenticated;
grant  execute on function public.reactivar_cliente(bigint)   to authenticated;

-- un cliente dado de baja no puede apartar
create or replace function public.solicitar_pedido(
  p_presentacion_id bigint,
  p_ciudad_entrega  text default null,
  p_notas           text default null,
  p_direccion       text default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cliente   bigint;
  v_activo    boolean;
  v_precio    numeric;
  v_costo     numeric;
  v_ciudad    text;
  v_final     numeric;
  v_descuento numeric := 0;
  v_id        bigint;
begin
  select id, ciudad, activo into v_cliente, v_ciudad, v_activo
  from public.cliente where auth_user_id = auth.uid();
  if v_cliente is null then
    raise exception 'Inicia sesión con tu cuenta para apartar un perfume'
      using errcode = '42501';
  end if;
  if not v_activo then
    raise exception 'Tu cuenta está dada de baja. Escríbenos por WhatsApp si quieres reactivarla.'
      using errcode = 'P0001', hint = 'cuenta_inactiva';
  end if;

  select pr.precio_venta, privado.costo_vigente(pr.id) into v_precio, v_costo
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

  v_final := v_precio;
  if not exists (select 1 from public.pedido where cliente_id = v_cliente and estado <> 'cancelado') then
    v_final := greatest(round(v_precio * (1 - privado.porcentaje_bienvenida()) / 10) * 10,
                        coalesce(v_costo, 0));
    v_descuento := v_precio - v_final;
  end if;

  insert into public.pedido (cliente_id, presentacion_id, estado, anticipo, precio_pactado,
                             descuento, ciudad_entrega, direccion_envio, notas)
  values (v_cliente, p_presentacion_id, 'consultado', 0, v_final, v_descuento,
          coalesce(nullif(left(trim(p_ciudad_entrega), 60), ''), v_ciudad),
          nullif(left(trim(p_direccion), 300), ''),
          nullif(left(trim(p_notas), 500), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- el trigger de registro guarda el detalle del canal
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

  insert into public.cliente (auth_user_id, nombre, telefono, direccion, ciudad, canal_id, canal_detalle)
  values (
    new.id,
    case when length(v_nombre) > 1 then v_nombre else 'Cliente nuevo' end,
    case when length(v_digitos) >= 10 and length(v_digitos) <= 15 then right(v_digitos, 10) end,
    nullif(left(trim(new.raw_user_meta_data->>'direccion'), 300), ''),
    nullif(left(trim(new.raw_user_meta_data->>'ciudad'), 60), ''),
    (select co.id from public.canal_origen co
      where co.nombre = left(new.raw_user_meta_data->>'canal', 60)),
    nullif(left(trim(new.raw_user_meta_data->>'canal_detalle'), 80), '')
  );
  return new;
end;
$$;

-- la lista del panel trae detalle del canal y si está activo
drop function public.clientes_admin();
create or replace function public.clientes_admin()
returns table (
  id              bigint,
  numero_cliente  integer,
  nombre          text,
  telefono        text,
  direccion       text,
  ciudad          text,
  canal           text,
  canal_detalle   text,
  correo          text,
  rol             text,
  con_cuenta      boolean,
  activo          boolean,
  baja_en         timestamptz,
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
         co.nombre, c.canal_detalle, u.email::text, c.rol, c.auth_user_id is not null,
         c.activo, c.baja_en, c.creado_en,
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

-- -------------------------------------------------------------
-- 3. Borrar un perfume sin pedidos
-- -------------------------------------------------------------
create or replace function public.eliminar_perfume(p_perfume_id bigint)
returns void
language plpgsql security invoker
set search_path = ''
as $$
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede borrar perfumes' using errcode = '42501';
  end if;
  if exists (select 1 from public.pedido pd
             join public.presentacion pr on pr.id = pd.presentacion_id
             where pr.perfume_id = p_perfume_id) then
    raise exception 'Este perfume tiene pedidos y no se puede borrar. Dalo de baja: se oculta del sitio y conserva su historial.'
      using errcode = 'P0001', hint = 'perfume_con_pedidos';
  end if;
  -- presentaciones, costos y notas se van en cascada
  delete from public.perfume where id = p_perfume_id;
  if not found then
    raise exception 'El perfume % no existe', p_perfume_id using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.eliminar_perfume(bigint) from public, anon;
grant  execute on function public.eliminar_perfume(bigint) to authenticated;
