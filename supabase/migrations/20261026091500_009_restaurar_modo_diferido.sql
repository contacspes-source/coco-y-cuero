-- =============================================================
-- 009 · Corrección encontrada en pruebas de la 008
-- guardar_perfume y actualizar_precios forzaban la revisión de
-- precio contra costo con SET CONSTRAINTS ... IMMEDIATE, pero no
-- regresaban al modo diferido. En una transacción con varias
-- operaciones, las siguientes se revisaban renglón por renglón y
-- volvía a ser imposible bajar costo y precio a la vez.
-- Ahora: se revisa lo pendiente y se vuelve a diferir.
-- =============================================================

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
  set constraints public.presentacion_precio_valido, public.costo_no_supera_precio deferred;

  return v_id;
end;
$$;

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
  set constraints public.presentacion_precio_valido deferred;
  return v_n;
end;
$$;
