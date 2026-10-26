-- =============================================================
-- 008 · Lo que necesita el panel administrativo (incremento 2)
--
-- 1. Almacenamiento de fotos: un bucket público de solo lectura;
--    solo el administrador sube, reemplaza o borra.
-- 2. La regla "precio >= costo" pasa a revisarse al final de la
--    transacción. Antes se revisaba en cada UPDATE, lo que impedía
--    bajar costo y precio a la vez (el precio nuevo chocaba con el
--    costo viejo) y no revisaba nada cuando subía el costo.
-- 3. Dos funciones que guardan en UNA transacción: o se guarda todo
--    el perfume (datos, presentaciones, costos, notas) o nada.
--    Son SECURITY INVOKER: corren con los permisos de quien llama,
--    así que las políticas RLS siguen decidiendo quién puede escribir.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Fotos de producto
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfumes', 'perfumes', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Público = cualquiera puede ABRIR una foto por su URL.
-- Listar, subir, reemplazar y borrar es solo del administrador.
create policy "admin lista fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'perfumes' and (select privado.es_admin()));

create policy "admin sube fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'perfumes' and (select privado.es_admin()));

create policy "admin reemplaza fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'perfumes' and (select privado.es_admin()))
  with check (bucket_id = 'perfumes' and (select privado.es_admin()));

create policy "admin borra fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'perfumes' and (select privado.es_admin()));

-- -------------------------------------------------------------
-- 2. Precio contra costo, revisado al confirmar la transacción
-- -------------------------------------------------------------
drop trigger presentacion_precio_valido on public.presentacion;
drop function public.validar_precio_vs_costo();

create or replace function privado.revisar_margen(p_presentacion_id bigint)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_precio numeric;
  v_costo  numeric;
  v_nombre text;
begin
  -- se leen los valores YA confirmados, no los de NEW: entre el
  -- cambio y el final de la transacción pudieron cambiar otra vez
  select pr.precio_venta, privado.costo_vigente(pr.id),
         m.nombre || ' ' || pe.nombre || ' ' || pr.ml || ' ml'
    into v_precio, v_costo, v_nombre
  from public.presentacion pr
  join public.perfume pe on pe.id = pr.perfume_id
  join public.marca   m  on m.id  = pe.marca_id
  where pr.id = p_presentacion_id;

  if v_costo is not null and v_precio < v_costo then
    raise exception 'El precio de % ($%) quedaría por debajo de su costo ($%)',
      v_nombre, v_precio, v_costo
      using errcode = 'P0001', hint = 'precio_bajo_costo';
  end if;
end;
$$;

create or replace function privado.al_cambiar_precio()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  perform privado.revisar_margen(new.id);
  return null;
end;
$$;

create or replace function privado.al_cambiar_costo()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  perform privado.revisar_margen(new.presentacion_id);
  return null;
end;
$$;

create constraint trigger presentacion_precio_valido
  after insert or update of precio_venta on public.presentacion
  deferrable initially deferred
  for each row execute function privado.al_cambiar_precio();

create constraint trigger costo_no_supera_precio
  after insert or update of costo on public.costo_proveedor
  deferrable initially deferred
  for each row execute function privado.al_cambiar_costo();

revoke execute on function privado.revisar_margen(bigint)  from public, anon;
revoke execute on function privado.al_cambiar_precio()      from public, anon;
revoke execute on function privado.al_cambiar_costo()       from public, anon;
grant  execute on function privado.revisar_margen(bigint)  to authenticated, service_role;
grant  execute on function privado.al_cambiar_precio()      to authenticated, service_role;
grant  execute on function privado.al_cambiar_costo()       to authenticated, service_role;
grant  usage   on schema privado to service_role;
grant  execute on function privado.costo_vigente(bigint)   to service_role;
grant  execute on function privado.es_admin()              to service_role;

-- -------------------------------------------------------------
-- 3a. Guardar un perfume completo
--
-- Recibe un JSON así (id ausente = alta nueva):
-- {
--   "id": 12,
--   "marca": "Lattafa",                 -- se crea si no existe
--   "genero_id": 1, "categoria_id": 1,
--   "nombre": "Asad", "tipo": "EDP",
--   "imagen_url": "https://…", "publicado": true,
--   "presentaciones": [ {"id": 30, "ml": 100, "precio_venta": 1290, "costo": 620} ],
--   "notas": [3, 7, 9]
-- }
-- Devuelve el id del perfume.
-- -------------------------------------------------------------
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

  -- marca: se reutiliza si ya existe (sin importar mayúsculas)
  select id into v_marca_id from public.marca where lower(nombre) = lower(v_marca);
  if v_marca_id is null then
    insert into public.marca (nombre) values (v_marca) returning id into v_marca_id;
  end if;

  if v_id is null then
    insert into public.perfume (marca_id, genero_id, categoria_id, nombre, tipo, imagen_url, publicado)
    values (v_marca_id,
            (p_datos->>'genero_id')::smallint,
            (p_datos->>'categoria_id')::smallint,
            v_nombre,
            p_datos->>'tipo',
            nullif(p_datos->>'imagen_url', ''),
            coalesce((p_datos->>'publicado')::boolean, true))
    returning id into v_id;
  else
    update public.perfume set
      marca_id     = v_marca_id,
      genero_id    = (p_datos->>'genero_id')::smallint,
      categoria_id = (p_datos->>'categoria_id')::smallint,
      nombre       = v_nombre,
      tipo         = p_datos->>'tipo',
      imagen_url   = nullif(p_datos->>'imagen_url', ''),
      publicado    = coalesce((p_datos->>'publicado')::boolean, publicado)
    where id = v_id;
    if not found then
      raise exception 'El perfume % no existe', v_id using errcode = 'P0002';
    end if;
  end if;

  -- proveedor: el indicado, o el único/primero registrado
  v_proveedor := coalesce(nullif(p_datos->>'proveedor_id', '')::bigint,
                          (select min(id) from public.proveedor));

  -- presentaciones: se actualizan las que traen id, se crean las nuevas
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

    -- costo: solo se registra si cambió; así queda el historial
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

  -- presentaciones que ya no vienen: se borran, salvo que tengan pedidos
  begin
    delete from public.presentacion
     where perfume_id = v_id and not (id = any (v_conservar));
  exception when foreign_key_violation then
    raise exception 'No se puede quitar una presentación que ya tiene pedidos. Da de baja el perfume en su lugar.'
      using errcode = 'P0001', hint = 'presentacion_con_pedidos';
  end;

  -- notas olfativas: se reemplaza el conjunto
  if jsonb_typeof(p_datos->'notas') = 'array' then
    delete from public.perfume_nota where perfume_id = v_id;
    insert into public.perfume_nota (perfume_id, nota_id)
    select v_id, (n #>> '{}')::bigint
    from jsonb_array_elements(p_datos->'notas') n
    on conflict do nothing;
  end if;

  -- la regla precio >= costo se revisa ya, para dar el error aquí
  -- con un mensaje claro y no al confirmar
  set constraints public.presentacion_precio_valido, public.costo_no_supera_precio immediate;

  return v_id;
end;
$$;

-- -------------------------------------------------------------
-- 3b. Cambiar varios precios a la vez (ajuste masivo)
-- Recibe: [ {"presentacion_id": 30, "precio_venta": 1290}, … ]
-- Devuelve cuántos precios cambió.
-- -------------------------------------------------------------
create or replace function public.actualizar_precios(p_cambios jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede cambiar precios'
      using errcode = '42501';
  end if;

  update public.presentacion pr
     set precio_venta = c.precio_venta
    from jsonb_to_recordset(p_cambios) as c(presentacion_id bigint, precio_venta numeric)
   where pr.id = c.presentacion_id
     and pr.precio_venta is distinct from c.precio_venta;
  get diagnostics v_n = row_count;

  set constraints public.presentacion_precio_valido immediate;
  return v_n;
end;
$$;

revoke execute on function public.guardar_perfume(jsonb)    from public, anon;
revoke execute on function public.actualizar_precios(jsonb) from public, anon;
grant  execute on function public.guardar_perfume(jsonb)    to authenticated;
grant  execute on function public.actualizar_precios(jsonb) to authenticated;
