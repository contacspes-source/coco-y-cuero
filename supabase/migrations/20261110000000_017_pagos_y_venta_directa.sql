-- =============================================================
-- 017 · Pagos con historial, descuentos desde el panel y venta directa
--
-- 1. pedido_pago: cada cobro (monto, forma de pago, fecha, nota).
--    pedido.anticipo deja de capturarse a mano: es la SUMA de sus
--    pagos y lo mantiene la base. El saldo sigue siendo
--    precio_pactado - anticipo, así que reportes y "Mi cuenta" no
--    cambian.
-- 2. registrar_pago / eliminar_pago: solo admin. Un pago no puede
--    pasar del saldo. Si el pedido estaba "Solicitado", al recibir el
--    primer pago pasa a "Apartado".
-- 3. crear_pedido_admin: alta desde el panel en una sola transacción,
--    con descuento, pago inicial y la opción de venta directa (nace
--    "Entregado" y pagado completo).
-- 4. La vista pedido_detalle trae la lista de pagos (solo la ve el
--    admin: la RLS de pedido_pago no deja leer al cliente).
--
-- Pruebas: supabase/pruebas/seguridad.sql (87 a 101).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tabla de pagos
-- -------------------------------------------------------------
create table public.pedido_pago (
  id         bigint generated always as identity primary key,
  pedido_id  bigint not null references public.pedido (id) on delete cascade,
  monto      numeric(10,2) not null check (monto > 0),
  forma      text not null check (forma in ('efectivo','transferencia','tarjeta','deposito','otro')),
  nota       text check (nota is null or length(nota) <= 200),
  pagado_en  timestamptz not null default now(),
  creado_en  timestamptz not null default now()
);
comment on table public.pedido_pago is 'Cobros de cada pedido. pedido.anticipo es su suma. Solo admin.';
create index pedido_pago_pedido_idx on public.pedido_pago (pedido_id);

alter table public.pedido_pago enable row level security;
create policy pedido_pago_solo_admin on public.pedido_pago
  for all to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
revoke all on public.pedido_pago from anon, authenticated;
-- leer sí (el panel arma la lista); escribir solo por las funciones
grant select on public.pedido_pago to authenticated;

-- Lo que ya estaba capturado como anticipo se conserva como un pago.
insert into public.pedido_pago (pedido_id, monto, forma, nota, pagado_en)
select id, anticipo, 'otro', 'Anticipo registrado antes del historial de pagos', actualizado_en
from public.pedido
where anticipo > 0;

-- -------------------------------------------------------------
-- anticipo = suma de pagos
-- -------------------------------------------------------------
create or replace function privado.sincronizar_pagado()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_pedido bigint := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedido p
     set anticipo = coalesce((select sum(pp.monto) from public.pedido_pago pp where pp.pedido_id = v_pedido), 0)
   where p.id = v_pedido;
  return null;
end;
$$;
revoke execute on function privado.sincronizar_pagado() from public, anon, authenticated;

create trigger pedido_pago_sincroniza
  after insert or update or delete on public.pedido_pago
  for each row execute function privado.sincronizar_pagado();

-- Desde la API nadie escribe el anticipo directo: se registra un pago.
-- (Las funciones de arriba corren como dueño y sí pueden; el editor
-- SQL también, para correcciones a mano.)
create or replace function privado.proteger_anticipo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' and new.anticipo <> 0
          or tg_op = 'UPDATE' and new.anticipo is distinct from old.anticipo) then
    raise exception 'El anticipo ya no se captura a mano: registra el cobro en Pagos'
      using errcode = '42501', hint = 'usar_pagos';
  end if;
  return new;
end;
$$;
revoke execute on function privado.proteger_anticipo() from public, anon, authenticated;

create trigger pedido_protege_anticipo
  before insert or update of anticipo on public.pedido
  for each row execute function privado.proteger_anticipo();

-- -------------------------------------------------------------
-- 2. Registrar y borrar pagos
-- -------------------------------------------------------------
create or replace function public.registrar_pago(
  p_pedido_id bigint,
  p_monto     numeric,
  p_forma     text,
  p_nota      text default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_saldo  numeric;
  v_id     bigint;
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador registra pagos' using errcode = '42501';
  end if;
  select estado, precio_pactado - anticipo into v_estado, v_saldo
  from public.pedido where id = p_pedido_id for update;
  if v_estado is null then
    raise exception 'El pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;
  if v_estado = 'cancelado' then
    raise exception 'El pedido está cancelado: no se le pueden registrar pagos' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El pago debe ser mayor que cero' using errcode = 'P0001', hint = 'monto';
  end if;
  if p_monto > v_saldo then
    raise exception 'El pago ($%) es mayor que lo que falta por pagar ($%)', p_monto, v_saldo
      using errcode = 'P0001', hint = 'monto';
  end if;

  insert into public.pedido_pago (pedido_id, monto, forma, nota)
  values (p_pedido_id, p_monto, p_forma, nullif(left(trim(p_nota), 200), ''))
  returning id into v_id;

  -- con el primer pago, la solicitud queda apartada
  if v_estado = 'consultado' then
    update public.pedido set estado = 'apartado' where id = p_pedido_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.eliminar_pago(p_pago_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador borra pagos' using errcode = '42501';
  end if;
  delete from public.pedido_pago where id = p_pago_id;
  if not found then
    raise exception 'El pago % no existe', p_pago_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.registrar_pago(bigint, numeric, text, text) from public, anon;
revoke execute on function public.eliminar_pago(bigint)                     from public, anon;
grant  execute on function public.registrar_pago(bigint, numeric, text, text) to authenticated;
grant  execute on function public.eliminar_pago(bigint)                     to authenticated;

-- -------------------------------------------------------------
-- 3. Alta de pedido desde el panel
-- -------------------------------------------------------------
create or replace function public.crear_pedido_admin(
  p_cliente_id      bigint,
  p_presentacion_id bigint,
  p_precio_lista    numeric,
  p_descuento       numeric default 0,
  p_pago            numeric default 0,
  p_forma           text    default null,
  p_entregado       boolean default false,
  p_ciudad          text    default null,
  p_notas           text    default null,
  p_nota_interna    text    default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_final  numeric := coalesce(p_precio_lista, 0) - coalesce(p_descuento, 0);
  v_pago   numeric := coalesce(p_pago, 0);
  v_estado text;
  v_id     bigint;
  v_costo  numeric;
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador registra pedidos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cliente where id = p_cliente_id and activo) then
    raise exception 'Ese cliente no existe o está dado de baja' using errcode = 'P0001', hint = 'cliente';
  end if;
  if not exists (select 1 from public.presentacion where id = p_presentacion_id) then
    raise exception 'Ese perfume ya no existe' using errcode = 'P0001', hint = 'presentacion';
  end if;
  if coalesce(p_descuento, 0) < 0 then
    raise exception 'El descuento no puede ser negativo' using errcode = 'P0001', hint = 'descuento';
  end if;
  if v_final <= 0 then
    raise exception 'El precio final debe ser mayor que cero' using errcode = 'P0001', hint = 'precio';
  end if;
  if v_pago < 0 or v_pago > v_final then
    raise exception 'El pago debe estar entre $0 y el precio final ($%)', v_final using errcode = 'P0001', hint = 'pago';
  end if;
  if v_pago > 0 and p_forma is null then
    raise exception 'Elige la forma de pago' using errcode = 'P0001', hint = 'forma';
  end if;
  if coalesce(p_entregado, false) and v_pago <> v_final then
    raise exception 'Una venta entregada en el momento debe quedar pagada completa' using errcode = 'P0001', hint = 'pago';
  end if;

  v_estado := case
    when coalesce(p_entregado, false) then 'entregado'
    when v_pago > 0 then 'apartado'
    else 'consultado'
  end;

  insert into public.pedido (cliente_id, presentacion_id, estado, anticipo, precio_pactado, descuento, ciudad_entrega, notas)
  values (p_cliente_id, p_presentacion_id, v_estado, 0, v_final, coalesce(p_descuento, 0),
          nullif(left(trim(p_ciudad), 60), ''), nullif(left(trim(p_notas), 500), ''))
  returning id into v_id;

  if v_pago > 0 then
    insert into public.pedido_pago (pedido_id, monto, forma) values (v_id, v_pago, p_forma);
  end if;

  -- la venta directa no pasa por "comprado": se fija aquí su costo
  if v_estado = 'entregado' then
    v_costo := privado.costo_vigente(p_presentacion_id);
    if v_costo is not null then
      insert into public.pedido_costo (pedido_id, costo, origen) values (v_id, v_costo, 'catalogo')
      on conflict (pedido_id) do nothing;
    end if;
  end if;

  if nullif(trim(p_nota_interna), '') is not null then
    insert into public.pedido_nota_interna (pedido_id, nota) values (v_id, left(trim(p_nota_interna), 1000));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.crear_pedido_admin(bigint, bigint, numeric, numeric, numeric, text, boolean, text, text, text) from public, anon;
grant  execute on function public.crear_pedido_admin(bigint, bigint, numeric, numeric, numeric, text, boolean, text, text, text) to authenticated;

-- -------------------------------------------------------------
-- 4. La vista del panel trae los pagos
-- -------------------------------------------------------------
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
  pd.direccion_envio,
  pc.costo                          as costo_real,
  pc.origen                         as costo_origen,
  coalesce((
    select json_agg(json_build_object('id', pp.id, 'monto', pp.monto, 'forma', pp.forma,
                                      'nota', pp.nota, 'fecha', pp.pagado_en) order by pp.pagado_en, pp.id)
    from public.pedido_pago pp
    where pp.pedido_id = pd.id
  ), '[]'::json)                    as pagos
from public.pedido pd
left join public.pedido_nota_interna ni on ni.pedido_id = pd.id
left join public.pedido_costo pc on pc.pedido_id = pd.id
left join public.cliente      cl on cl.id = pd.cliente_id
left join public.presentacion pr on pr.id = pd.presentacion_id
left join public.perfume      pe on pe.id = pr.perfume_id
left join public.marca        ma on ma.id = pe.marca_id;
