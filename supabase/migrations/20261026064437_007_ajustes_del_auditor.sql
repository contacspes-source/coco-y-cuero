-- =============================================================
-- 007 · Ajustes señalados por el auditor de Supabase
-- =============================================================

-- 1. Funciones auxiliares fuera de la API pública.
-- Las políticas guardan la función por su OID, así que moverla de
-- esquema no rompe ninguna política ni la vista de margen.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

alter function public.es_admin()            set schema privado;
alter function public.costo_vigente(bigint) set schema privado;

revoke execute on function privado.costo_vigente(bigint) from public, anon;
grant  execute on function privado.costo_vigente(bigint) to authenticated;

-- el trigger de precio llama a costo_vigente por nombre calificado
create or replace function public.validar_precio_vs_costo()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  v_costo numeric;
begin
  v_costo := privado.costo_vigente(new.id);
  if v_costo is not null and new.precio_venta < v_costo then
    raise exception 'El precio de venta (%) queda por debajo del costo vigente (%)',
      new.precio_venta, v_costo;
  end if;
  return new;
end;
$$;

-- 2. Índice que faltaba para la navegación por categoría.
create index perfume_categoria_idx on public.perfume (categoria_id);

-- 3. Una sola política de lectura por tabla y rol. Las de escritura
-- del admin pasan de FOR ALL a insert, update y delete por separado.
do $$
declare t text;
begin
  foreach t in array array[
    'genero','categoria','marca','familia_olfativa','nota','canal_origen',
    'perfume','presentacion','perfume_nota']
  loop
    execute format('drop policy "admin escribe" on public.%I', t);
    execute format('create policy "admin inserta" on public.%I for insert to authenticated with check ((select privado.es_admin()))', t);
    execute format('create policy "admin modifica" on public.%I for update to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()))', t);
    execute format('create policy "admin borra" on public.%I for delete to authenticated using ((select privado.es_admin()))', t);
  end loop;
end $$;

drop policy "admin gestiona pedidos" on public.pedido;
create policy "admin registra pedidos" on public.pedido
  for insert to authenticated with check ((select privado.es_admin()));
create policy "admin modifica pedidos" on public.pedido
  for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admin borra pedidos" on public.pedido
  for delete to authenticated using ((select privado.es_admin()));
