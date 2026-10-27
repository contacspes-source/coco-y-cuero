-- =============================================================
-- 013 · Descuento de bienvenida y dirección de envío
--
-- * 10 % en la primera compra de cada cuenta. Lo calcula la base,
--   nunca el navegador: redondeado a decenas y nunca por debajo del
--   costo. "Primera compra" = el cliente no tiene ningún pedido que
--   no esté cancelado (si cancela, conserva su descuento).
-- * Dirección de envío por pedido: solo para envíos a otra ciudad
--   de la república; en GDL, Zamora y Morelia se entrega en punto
--   acordado.
-- =============================================================

alter table public.pedido
  add column descuento       numeric not null default 0 check (descuento >= 0),
  add column direccion_envio text check (direccion_envio is null or length(direccion_envio) <= 300);

create or replace function privado.porcentaje_bienvenida()
returns numeric language sql immutable
set search_path = ''
as $$ select 0.10::numeric $$;
grant execute on function privado.porcentaje_bienvenida() to authenticated, service_role;

-- ¿Cuánto descuento de bienvenida tengo? (0.10 o 0). Para mostrarlo
-- en el sitio; el cobro real lo decide solicitar_pedido.
create or replace function public.mi_descuento_bienvenida()
returns numeric
language sql stable security invoker
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.pedido p
      join public.cliente c on c.id = p.cliente_id
      where c.auth_user_id = auth.uid() and p.estado <> 'cancelado'
    ) and exists (select 1 from public.cliente c where c.auth_user_id = auth.uid())
    then privado.porcentaje_bienvenida()
    else 0
  end;
$$;
revoke execute on function public.mi_descuento_bienvenida() from public, anon;
grant  execute on function public.mi_descuento_bienvenida() to authenticated;

drop function public.solicitar_pedido(bigint, text, text);

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
  v_precio    numeric;
  v_costo     numeric;
  v_ciudad    text;
  v_final     numeric;
  v_descuento numeric := 0;
  v_id        bigint;
begin
  select id, ciudad into v_cliente, v_ciudad
  from public.cliente where auth_user_id = auth.uid();
  if v_cliente is null then
    raise exception 'Inicia sesión con tu cuenta para apartar un perfume'
      using errcode = '42501';
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

revoke execute on function public.solicitar_pedido(bigint, text, text, text) from public, anon;
grant  execute on function public.solicitar_pedido(bigint, text, text, text) to authenticated;

create or replace view public.pedido_detalle
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
  ), '[]'::json)                    as historial,
  pd.descuento,
  pd.direccion_envio
from public.pedido pd
left join public.pedido_nota_interna ni on ni.pedido_id = pd.id
left join public.cliente      cl on cl.id = pd.cliente_id
left join public.presentacion pr on pr.id = pd.presentacion_id
left join public.perfume      pe on pe.id = pr.perfume_id
left join public.marca        ma on ma.id = pe.marca_id;
