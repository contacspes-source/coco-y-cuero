-- =============================================================
-- 003 · El costo sale de presentacion
-- presentacion la lee el sitio público; si el costo viviera ahí,
-- cualquier visitante vería el margen. Administrador y cliente
-- comparten el rol "authenticated", así que una columna no se
-- puede ocultar a uno y mostrar al otro: la única forma segura
-- es que el costo viva en una tabla que solo el admin lee.
-- =============================================================

alter table public.presentacion drop constraint precio_no_menor_al_costo;
alter table public.presentacion drop column costo;

-- costo vigente = el más reciente por presentación
create or replace function public.costo_vigente(p_presentacion_id bigint)
returns numeric
language sql stable
set search_path = ''
as $$
  select cp.costo
  from public.costo_proveedor cp
  where cp.presentacion_id = p_presentacion_id
  order by cp.vigente_desde desc, cp.id desc
  limit 1;
$$;

-- Regla de negocio: el precio de venta nunca queda por debajo del
-- costo vigente. Se valida al fijar el precio. Un costo que sube por
-- encima del precio NO se rechaza (es un hecho del proveedor): se
-- registra y aparece en rojo en el panel.
create or replace function public.validar_precio_vs_costo()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  v_costo numeric;
begin
  v_costo := public.costo_vigente(new.id);
  if v_costo is not null and new.precio_venta < v_costo then
    raise exception 'El precio de venta (%) queda por debajo del costo vigente (%)',
      new.precio_venta, v_costo;
  end if;
  return new;
end;
$$;

create trigger presentacion_precio_valido
  before update of precio_venta on public.presentacion
  for each row execute function public.validar_precio_vs_costo();

comment on table public.costo_proveedor is
  'Única fuente de costos. Solo el administrador la lee. El costo vigente es el registro más reciente.';
