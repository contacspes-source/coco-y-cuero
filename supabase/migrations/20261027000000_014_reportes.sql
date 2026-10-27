-- =============================================================
-- 014 · Reportes (incremento 5)
--
-- * pedido_costo: lo que REALMENTE pagaste por cada pedido. Se llena
--   solo con el costo de catálogo al marcar "comprado" y lo puedes
--   corregir desde el panel (p. ej. si lo compraste en Mercado Libre).
--   Solo el admin lo ve: el cliente nunca conoce tu costo.
-- * reporte_ventas(desde, hasta): todo el módulo de reportes en una
--   sola llamada, calculado en la base y solo para administradores.
-- * Endurecimiento: quita TRUNCATE/TRIGGER/REFERENCES a anon y
--   authenticated (TRUNCATE no pasa por RLS). La API de Supabase no
--   permite ejecutarlos, pero no hay razón para que existan.
-- =============================================================

-- ------------------------------------------------- costo real
create table public.pedido_costo (
  pedido_id      bigint primary key references public.pedido (id) on delete cascade,
  costo          numeric(10,2) not null check (costo >= 0),
  origen         text not null default 'catalogo' check (origen in ('catalogo','manual')),
  actualizado_en timestamptz not null default now()
);
comment on table public.pedido_costo is 'Costo real por pedido. Solo admin.';

alter table public.pedido_costo enable row level security;
create policy pedido_costo_solo_admin on public.pedido_costo
  for all to authenticated
  using (privado.es_admin()) with check (privado.es_admin());
revoke all on public.pedido_costo from anon, authenticated;
grant select, insert, update, delete on public.pedido_costo to authenticated;

-- Al pasar a comprado (o entregado sin haber pasado por comprado) se
-- guarda el costo de catálogo de ese momento, si aún no hay uno.
create or replace function privado.fijar_costo_pedido()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v numeric;
begin
  if new.estado in ('comprado','entregado') and new.estado is distinct from old.estado then
    v := privado.costo_vigente(new.presentacion_id);
    if v is not null then
      insert into public.pedido_costo (pedido_id, costo, origen)
      values (new.id, v, 'catalogo')
      on conflict (pedido_id) do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function privado.fijar_costo_pedido() from public, anon, authenticated;

create trigger pedido_fija_costo
  after update of estado on public.pedido
  for each row execute function privado.fijar_costo_pedido();

-- pedidos que ya estaban comprados o entregados
insert into public.pedido_costo (pedido_id, costo, origen)
select p.id, privado.costo_vigente(p.presentacion_id), 'catalogo'
from public.pedido p
where p.estado in ('comprado','entregado')
  and privado.costo_vigente(p.presentacion_id) is not null
on conflict (pedido_id) do nothing;

-- La vista del panel muestra el costo. Es security_invoker: para un
-- cliente la RLS de pedido_costo devuelve null.
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
  pc.origen                         as costo_origen
from public.pedido pd
left join public.pedido_nota_interna ni on ni.pedido_id = pd.id
left join public.pedido_costo pc on pc.pedido_id = pd.id
left join public.cliente      cl on cl.id = pd.cliente_id
left join public.presentacion pr on pr.id = pd.presentacion_id
left join public.perfume      pe on pe.id = pr.perfume_id
left join public.marca        ma on ma.id = pe.marca_id;

-- ------------------------------------------------- reporte
-- Una venta cuenta el día en que se marcó "entregado" (hora de México).
-- Si un pedido entregado no tiene costo guardado, se usa el costo de
-- catálogo actual y se reporta como "estimado".
create or replace function privado.ventas_entregadas(p_desde date, p_hasta date)
returns table (
  pedido_id bigint, cliente_id bigint, presentacion_id bigint, fecha date,
  precio numeric, descuento numeric, costo numeric, costo_estimado boolean, ciudad text
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.cliente_id, p.presentacion_id, f.fecha,
         p.precio_pactado, p.descuento,
         coalesce(pc.costo, privado.costo_vigente(p.presentacion_id), 0),
         pc.costo is null,
         coalesce(nullif(trim(p.ciudad_entrega), ''), 'Sin ciudad')
  from public.pedido p
  cross join lateral (
    select (max(e.creado_en) at time zone 'America/Mexico_City')::date as fecha
    from public.pedido_evento e
    where e.pedido_id = p.id and e.estado = 'entregado'
  ) f
  left join public.pedido_costo pc on pc.pedido_id = p.id
  where p.estado = 'entregado'
    and f.fecha between p_desde and p_hasta;
$$;
revoke execute on function privado.ventas_entregadas(date, date) from public, anon, authenticated;

create or replace function privado.resumen_ventas(p_desde date, p_hasta date)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ventas',          count(*),
    'ingresos',        coalesce(sum(v.precio), 0),
    'costo',           coalesce(sum(v.costo), 0),
    'margen',          coalesce(sum(v.precio - v.costo), 0),
    'descuentos',      coalesce(sum(v.descuento), 0),
    'costo_estimado',  count(*) filter (where v.costo_estimado)
  )
  from privado.ventas_entregadas(p_desde, p_hasta) v;
$$;
revoke execute on function privado.resumen_ventas(date, date) from public, anon, authenticated;

create or replace function public.reporte_ventas(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_dias   int;
  v_mes    date;
  r        jsonb;
begin
  if not privado.es_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 3700 then
    raise exception 'El rango no puede pasar de 10 años' using errcode = '22023';
  end if;

  v_dias := p_hasta - p_desde + 1;
  v_mes  := date_trunc('month', p_hasta)::date;

  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'resumen',  privado.resumen_ventas(p_desde, p_hasta),
    'anterior', privado.resumen_ventas(p_desde - v_dias, p_desde - 1),

    -- últimos 12 meses que terminan en el mes de "hasta"
    'por_mes', (
      select jsonb_agg(jsonb_build_object(
               'mes', to_char(m.mes, 'YYYY-MM'),
               'ventas', coalesce(x.ventas, 0),
               'ingresos', coalesce(x.ingresos, 0),
               'margen', coalesce(x.margen, 0)) order by m.mes)
      from generate_series(v_mes - interval '11 months', v_mes, interval '1 month') as m(mes)
      left join lateral (
        select count(*) ventas, sum(v.precio) ingresos, sum(v.precio - v.costo) margen
        from privado.ventas_entregadas(m.mes::date, (m.mes + interval '1 month' - interval '1 day')::date) v
      ) x on true
    ),

    'top_perfumes', coalesce((
      select jsonb_agg(t order by t.ingresos desc, t.ventas desc)
      from (
        select pe.id as perfume_id, ma.nombre as marca, pe.nombre as perfume,
               count(*) as ventas, sum(v.precio) as ingresos, sum(v.precio - v.costo) as margen
        from privado.ventas_entregadas(p_desde, p_hasta) v
        join public.presentacion pr on pr.id = v.presentacion_id
        join public.perfume pe on pe.id = pr.perfume_id
        join public.marca ma on ma.id = pe.marca_id
        group by pe.id, ma.nombre, pe.nombre
        order by sum(v.precio) desc, count(*) desc
        limit 10
      ) t), '[]'::jsonb),

    'por_categoria', coalesce((
      select jsonb_agg(t order by t.ingresos desc)
      from (
        select ca.nombre, count(*) as ventas, sum(v.precio) as ingresos, sum(v.precio - v.costo) as margen
        from privado.ventas_entregadas(p_desde, p_hasta) v
        join public.presentacion pr on pr.id = v.presentacion_id
        join public.perfume pe on pe.id = pr.perfume_id
        join public.categoria ca on ca.id = pe.categoria_id
        group by ca.nombre
      ) t), '[]'::jsonb),

    'por_genero', coalesce((
      select jsonb_agg(t order by t.ingresos desc)
      from (
        select ge.nombre, count(*) as ventas, sum(v.precio) as ingresos, sum(v.precio - v.costo) as margen
        from privado.ventas_entregadas(p_desde, p_hasta) v
        join public.presentacion pr on pr.id = v.presentacion_id
        join public.perfume pe on pe.id = pr.perfume_id
        join public.genero ge on ge.id = pe.genero_id
        group by ge.nombre
      ) t), '[]'::jsonb),

    'por_ciudad', coalesce((
      select jsonb_agg(t order by t.ingresos desc)
      from (
        select v.ciudad as nombre, count(*) as ventas, sum(v.precio) as ingresos
        from privado.ventas_entregadas(p_desde, p_hasta) v
        group by v.ciudad
      ) t), '[]'::jsonb),

    -- de dónde vienen: clientes nuevos del periodo y lo que compraron
    'por_canal', coalesce((
      select jsonb_agg(t order by t.ingresos desc, t.clientes_nuevos desc)
      from (
        select coalesce(co.nombre, 'Sin dato') as nombre,
               count(distinct c.id) filter (
                 where (c.creado_en at time zone 'America/Mexico_City')::date between p_desde and p_hasta
               ) as clientes_nuevos,
               count(v.pedido_id) as ventas,
               coalesce(sum(v.precio), 0) as ingresos
        from public.cliente c
        left join public.canal_origen co on co.id = c.canal_id
        left join privado.ventas_entregadas(p_desde, p_hasta) v on v.cliente_id = c.id
        where c.rol = 'cliente'
        group by coalesce(co.nombre, 'Sin dato')
        having count(v.pedido_id) > 0
            or count(distinct c.id) filter (
                 where (c.creado_en at time zone 'America/Mexico_City')::date between p_desde and p_hasta) > 0
      ) t), '[]'::jsonb),

    'clientes', (
      select jsonb_build_object(
        'nuevos', (select count(*) from public.cliente c
                    where c.rol = 'cliente'
                      and (c.creado_en at time zone 'America/Mexico_City')::date between p_desde and p_hasta),
        'compradores', (select count(distinct v.cliente_id) from privado.ventas_entregadas(p_desde, p_hasta) v),
        'recurrentes', (
          select count(*) from (
            select v.cliente_id from privado.ventas_entregadas(p_desde, p_hasta) v
            group by v.cliente_id
            having (select count(*) from public.pedido p2
                     where p2.cliente_id = v.cliente_id and p2.estado = 'entregado') > 1
          ) x)
      )
    ),

    -- pedidos que ENTRARON en el periodo y en qué quedaron
    'embudo', (
      select jsonb_build_object(
        'creados',    count(*),
        'consultado', count(*) filter (where p.estado = 'consultado'),
        'apartado',   count(*) filter (where p.estado = 'apartado'),
        'comprado',   count(*) filter (where p.estado = 'comprado'),
        'entregado',  count(*) filter (where p.estado = 'entregado'),
        'cancelado',  count(*) filter (where p.estado = 'cancelado'))
      from public.pedido p
      where (p.creado_en at time zone 'America/Mexico_City')::date between p_desde and p_hasta
    ),

    -- foto de hoy, sin importar el periodo
    'pendiente', (
      select jsonb_build_object(
        'en_curso',   count(*) filter (where p.estado in ('consultado','apartado','comprado')),
        'por_cobrar', coalesce(sum(p.precio_pactado - p.anticipo) filter (where p.estado in ('apartado','comprado')), 0),
        'anticipos',  coalesce(sum(p.anticipo) filter (where p.estado in ('apartado','comprado')), 0),
        'invertido',  coalesce(sum(pc.costo) filter (where p.estado = 'comprado'), 0))
      from public.pedido p
      left join public.pedido_costo pc on pc.pedido_id = p.id
    )
  ) into r;
  return r;
end;
$$;
revoke execute on function public.reporte_ventas(date, date) from public, anon;
grant  execute on function public.reporte_ventas(date, date) to authenticated;

-- ------------------------------------------------- endurecimiento
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','v','p')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
