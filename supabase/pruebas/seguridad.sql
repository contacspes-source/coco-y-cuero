-- =============================================================
-- Pruebas de seguridad · Coco & Cuero
--
-- Cómo correrlas: pega todo este archivo en el editor SQL de
-- Supabase y ejecútalo. Todo corre dentro de una transacción que
-- termina en ROLLBACK, así que NO deja datos de prueba.
--
-- Resultado esperado: las 49 filas con estado = 'OK'.
-- Si alguna dice 'FALLA', no publiques el cambio que hiciste.
--
-- Córrelas cada vez que toques una política RLS, un GRANT o una
-- función de seguridad. Un cambio de seguridad sin re-probar es
-- justo como se cuelan los errores.
-- =============================================================

begin;
create temp table _p (n int, prueba text, esperado text, obtenido text) on commit drop;

-- Tres cuentas de prueba. Ana intenta colarse como admin en sus metadatos.
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','ana@prueba.mx',
  '{"nombre":"Ana Prueba","telefono":"+52 33 1234 5678","canal":"Instagram","rol":"admin"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','beto@prueba.mx','{"nombre":"Beto Prueba"}'),
 ('cccccccc-0000-0000-0000-000000000003','jorge@prueba.mx','{"nombre":"Jorge Admin"}');

-- Promover al admin se hace desde el editor SQL, como manda el diseño.
update public.cliente set rol = 'admin' where auth_user_id = 'cccccccc-0000-0000-0000-000000000003';

-- Un pedido de Beto.
insert into public.pedido (cliente_id, presentacion_id, precio_pactado)
select c.id, (select id from public.presentacion limit 1), 2000
from public.cliente c where c.auth_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

insert into _p select 7,'registro ignora rol=admin','cliente',rol from public.cliente where auth_user_id='aaaaaaaa-0000-0000-0000-000000000001';
insert into _p select 8,'telefono normalizado','3312345678',telefono from public.cliente where auth_user_id='aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare v bigint; r text; total bigint; datos jsonb; costo0 numeric; pres bigint; mio bigint; i int;
begin
  select count(*) into total from public.perfume;

  -- ===== VISITANTE SIN CUENTA =====
  set local role anon;
  select count(*) into v from public.perfume;
  reset role; insert into _p values (1,'anon ve catalogo', total::text, v::text); set local role anon;
  select count(*) into v from public.presentacion;
  reset role; insert into _p values (2,'anon ve precios', total::text, v::text); set local role anon;
  begin select count(*) into v from public.costo_proveedor; r := v::text;
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (3,'anon lee costos','bloqueado',r); set local role anon;
  begin select count(*) into v from public.cliente; r := v::text;
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (4,'anon lee clientes','bloqueado',r); set local role anon;
  begin perform privado.es_admin(); r := 'EJECUTO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (5,'anon llama es_admin','bloqueado',r); set local role anon;
  update public.presentacion set precio_venta = 1 where true; get diagnostics v = row_count;
  reset role; insert into _p values (6,'anon cambia precios','0',v::text);

  -- ===== ANA, CLIENTE =====
  perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v from public.cliente;
  reset role; insert into _p values (11,'Ana ve expedientes','1',v::text); set local role authenticated;
  begin update public.cliente set rol='admin' where auth_user_id = auth.uid(); r := 'SE HIZO ADMIN';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (12,'Ana intenta hacerse admin','bloqueado',r); set local role authenticated;
  update public.cliente set nombre = 'Hackeado' where auth_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics v = row_count;
  reset role; insert into _p values (13,'Ana edita expediente ajeno','0',v::text); set local role authenticated;
  select count(*) into v from public.pedido;
  reset role; insert into _p values (14,'Ana ve pedidos ajenos','0',v::text); set local role authenticated;
  select count(*) into v from public.costo_proveedor;
  reset role; insert into _p values (15,'Ana ve costos','0',v::text); set local role authenticated;
  select count(*) into v from public.margen_actual where costo is not null;
  reset role; insert into _p values (16,'Ana ve costos via vista','0',v::text); set local role authenticated;
  begin insert into public.marca (nombre) values ('Marca pirata'); r := 'INSERTO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (17,'Ana crea una marca','bloqueado',r);

  -- ===== BETO, CLIENTE CON UN PEDIDO =====
  perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v from public.pedido;
  reset role; insert into _p values (18,'Beto ve su pedido','1',v::text);

  -- ===== JORGE, ADMINISTRADOR =====
  perform set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v from public.costo_proveedor;
  reset role; insert into _p values (19,'Admin ve costos', total::text, v::text); set local role authenticated;
  select count(*) into v from public.margen_actual where costo is not null;
  reset role; insert into _p values (20,'Admin ve margen con costo', total::text, v::text); set local role authenticated;
  begin update public.pedido set estado='entregado'; r := 'PASO DIRECTO';
  exception when raise_exception then r := 'bloqueado'; end;
  reset role; insert into _p values (21,'Pedido consultado a entregado','bloqueado',r); set local role authenticated;
  -- la regla se revisa al confirmar; aquí se fuerza a revisarla ya
  begin update public.presentacion set precio_venta = 1
        where id = (select presentacion_id from public.margen_actual order by costo desc limit 1);
        set constraints all immediate;
        set constraints all deferred;
        r := 'VENDIO CON PERDIDA';
  exception when raise_exception then r := 'bloqueado'; set constraints all deferred; end;
  reset role; insert into _p values (22,'Precio bajo el costo','bloqueado',r); set local role authenticated;
  update public.perfume set publicado = false
   where id = (select id from public.perfume order by id limit 1);
  get diagnostics v = row_count;
  reset role; insert into _p values (23,'Admin da de baja un perfume','1',v::text); set local role authenticated;
  select count(*) into v from public.perfume;
  reset role; insert into _p values (24,'Admin sigue viendo el dado de baja', total::text, v::text);

  -- ===== VISITANTE, TRAS LA BAJA =====
  set local role anon;
  select count(*) into v from public.perfume;
  reset role; insert into _p values (25,'anon ya no ve el dado de baja', (total - 1)::text, v::text);

  -- =============================================================
  -- Incremento 2 · funciones del panel y fotos
  -- =============================================================

  -- Un perfume de muestra (el primero) armado como lo manda el panel
  select jsonb_build_object(
           'id', pe.id, 'marca', m.nombre, 'genero_id', pe.genero_id,
           'categoria_id', pe.categoria_id, 'nombre', pe.nombre, 'tipo', pe.tipo,
           'imagen_url', pe.imagen_url, 'publicado', true,
           'presentaciones', jsonb_build_array(jsonb_build_object(
              'id', pr.id, 'ml', pr.ml, 'precio_venta', pr.precio_venta,
              'costo', privado.costo_vigente(pr.id))),
           'notas', '[]'::jsonb),
         privado.costo_vigente(pr.id)
    into datos, costo0
  from public.perfume pe
  join public.marca m on m.id = pe.marca_id
  join public.presentacion pr on pr.perfume_id = pe.id
  order by pe.id limit 1;

  -- ===== VISITANTE Y CLIENTE NO PUEDEN USARLAS =====
  set local role anon;
  begin perform public.guardar_perfume(datos); r := 'GUARDO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (26,'anon guarda un perfume','bloqueado',r);

  perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin perform public.guardar_perfume(datos); r := 'GUARDO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (27,'Ana guarda un perfume','bloqueado',r); set local role authenticated;
  begin perform public.actualizar_precios('[{"presentacion_id":1,"precio_venta":5}]'); r := 'CAMBIO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (28,'Ana cambia precios masivo','bloqueado',r); set local role authenticated;
  begin insert into storage.objects (bucket_id, name) values ('perfumes', 'pirata.jpg'); r := 'SUBIO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (29,'Ana sube una foto','bloqueado',r);

  -- ===== ADMINISTRADOR =====
  perform set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
  set local role authenticated;

  -- alta con marca nueva: crea la marca, el perfume, su precio y su costo
  begin
    v := public.guardar_perfume(jsonb_build_object(
      'marca','Marca de Prueba','genero_id',3,'categoria_id',2,
      'nombre','Perfume de Prueba','tipo','EDP',
      'presentaciones', jsonb_build_array(jsonb_build_object('ml',100,'precio_venta',2000,'costo',1000)),
      'notas', jsonb_build_array((select min(id) from public.nota))));
    select count(*)::text into r from public.margen_actual
     where perfume_id = v and costo = 1000 and precio_venta = 2000;
  exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role; insert into _p values (30,'Admin da de alta con costo','1',r); set local role authenticated;

  -- bajar costo y precio A LA VEZ: el precio nuevo queda debajo del
  -- costo viejo pero arriba del nuevo. Antes de la 008 era imposible.
  begin
    perform public.guardar_perfume(jsonb_set(jsonb_set(datos,
      '{presentaciones,0,costo}',        to_jsonb(round(costo0 * 0.5))),
      '{presentaciones,0,precio_venta}', to_jsonb(round(costo0 * 0.8))));
    r := 'guardado';
  exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role; insert into _p values (31,'Bajar costo y precio juntos','guardado',r); set local role authenticated;

  -- el costo vigente ya es el nuevo
  select (privado.costo_vigente((datos #>> '{presentaciones,0,id}')::bigint) = round(costo0 * 0.5))::text
    into r;
  reset role; insert into _p values (32,'Costo vigente actualizado','true',r); set local role authenticated;

  -- subir el costo por encima del precio: rechazado
  begin
    perform public.guardar_perfume(jsonb_set(datos,
      '{presentaciones,0,costo}', to_jsonb((datos #>> '{presentaciones,0,precio_venta}')::numeric + 1)));
    r := 'COSTO MAYOR QUE PRECIO';
  exception when raise_exception then r := 'bloqueado'; end;
  reset role; insert into _p values (33,'Costo por encima del precio','bloqueado',r); set local role authenticated;

  -- lo mismo, directo a la tabla sin pasar por la función
  begin
    insert into public.costo_proveedor (presentacion_id, proveedor_id, costo, vigente_desde)
    values ((datos #>> '{presentaciones,0,id}')::bigint, (select min(id) from public.proveedor),
            999999, current_date + 1);
    set constraints all immediate;
    set constraints all deferred;
    r := 'COSTO MAYOR QUE PRECIO';
  exception when raise_exception then r := 'bloqueado'; set constraints all deferred; end;
  reset role; insert into _p values (34,'Costo alto directo a la tabla','bloqueado',r); set local role authenticated;

  -- ajuste masivo de precios
  begin
    v := public.actualizar_precios((
      select jsonb_agg(jsonb_build_object('presentacion_id', presentacion_id,
                                          'precio_venta', precio_venta + 10))
      from (select presentacion_id, precio_venta from public.margen_actual
            order by presentacion_id limit 5) x));
    r := v::text;
  exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role; insert into _p values (35,'Admin sube 5 precios a la vez','5',r); set local role authenticated;

  -- ajuste masivo que dejaría uno bajo costo: no se aplica NINGUNO
  begin
    perform public.actualizar_precios((
      select jsonb_agg(jsonb_build_object('presentacion_id', presentacion_id, 'precio_venta',
               case when rn = 1 then 1 else precio_venta + 50 end))
      from (select presentacion_id, precio_venta, row_number() over (order by presentacion_id) rn
            from public.margen_actual where costo is not null order by presentacion_id limit 3) x));
    r := 'APLICO';
  exception when raise_exception then r := 'bloqueado'; end;
  reset role; insert into _p values (36,'Masivo con uno bajo costo','bloqueado',r);

  -- =============================================================
  -- Incremento 3 · vista pública del catálogo
  -- =============================================================
  select count(*) into total from public.perfume where publicado;
  set local role anon;
  select count(*) into v from public.catalogo_publico;
  reset role; insert into _p values (37,'anon lee el catálogo público', total::text, v::text);
  select string_agg(column_name, ',') into r from information_schema.columns
   where table_schema = 'public' and table_name = 'catalogo_publico';
  insert into _p values (38,'la vista pública no tiene costos','false',(r ilike '%costo%')::text);
  update public.perfume set publicado = false
   where id = (select min(id) from public.perfume where publicado);
  set local role anon;
  select count(*) into v from public.catalogo_publico;
  reset role; insert into _p values (39,'un perfume de baja sale de la vista', (total - 1)::text, v::text);

  -- =============================================================
  -- Incremento 4 · clientes y pedidos
  -- =============================================================
  select pr.id into pres from public.presentacion pr
    join public.perfume pe on pe.id = pr.perfume_id where pe.publicado order by pr.id limit 1;

  set local role anon;
  begin perform public.solicitar_pedido(pres); r := 'PIDIO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (40,'anon solicita un pedido','bloqueado',r);

  -- Beto (cliente) aparta un perfume: el precio lo pone la base
  perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
  set local role authenticated;
  mio := public.solicitar_pedido(pres, 'Zamora', 'Lo quiero para regalo');
  select (precio_pactado = (select precio_venta from public.presentacion where id = pres)
          and estado = 'consultado' and anticipo = 0)::text into r
    from public.pedido_detalle where id = mio;
  reset role; insert into _p values (41,'cliente solicita con precio real','true',r); set local role authenticated;

  begin insert into public.pedido (cliente_id, presentacion_id, precio_pactado)
        select id, pres, 1 from public.cliente where auth_user_id = auth.uid();
        r := 'INSERTO DIRECTO';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (42,'cliente inserta pedido sin la funcion','bloqueado',r); set local role authenticated;

  select count(*) into v from public.pedido_detalle;
  reset role; insert into _p values (43,'cliente ve solo sus pedidos','2',v::text);

  -- límite de solicitudes abiertas
  begin
    for i in 1..5 loop perform public.solicitar_pedido(pres); end loop;
    r := 'SIN LIMITE';
  exception when raise_exception then r := 'bloqueado'; end;
  set local role authenticated;
  reset role; insert into _p values (44,'maximo 5 solicitudes abiertas','bloqueado',r);

  -- nota interna del admin
  insert into public.pedido_nota_interna (pedido_id, nota) values (mio, 'Cliente frecuente, dar prioridad');
  set local role authenticated;
  select coalesce(nota_interna, 'oculta') into r from public.pedido_detalle where id = mio;
  reset role; insert into _p values (45,'cliente no ve la nota interna','oculta',r); set local role authenticated;
  select count(*) into v from public.pedido_nota_interna;
  reset role; insert into _p values (46,'cliente lee tabla de notas internas','0',v::text);

  -- Ana no puede cancelar el pedido de Beto
  perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin perform public.cancelar_mi_pedido(mio); r := 'CANCELO AJENO';
  exception when raise_exception then r := 'bloqueado'; end;
  reset role; insert into _p values (47,'cancelar pedido ajeno','bloqueado',r); set local role authenticated;
  begin perform public.clientes_admin(); r := 'VIO CLIENTES';
  exception when insufficient_privilege then r := 'bloqueado'; end;
  reset role; insert into _p values (48,'cliente pide lista de clientes','bloqueado',r);

  -- Beto cancela su propia solicitud; queda en el historial
  perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
  set local role authenticated;
  perform public.cancelar_mi_pedido(mio);
  select (estado || ':' || json_array_length(historial))::text into r from public.pedido_detalle where id = mio;
  reset role; insert into _p values (49,'cancela lo suyo y queda historial','cancelado:2',r);

  -- un pedido ya apartado ya no lo cancela el cliente
  update public.pedido set estado = 'apartado'
   where id = (select min(id) from public.pedido where estado = 'consultado'
                and cliente_id = (select id from public.cliente where auth_user_id = 'bbbbbbbb-0000-0000-0000-000000000002'));
  set local role authenticated;
  begin perform public.cancelar_mi_pedido((select min(id) from public.pedido where estado = 'apartado')); r := 'CANCELO APARTADO';
  exception when raise_exception then r := 'bloqueado'; end;
  reset role; insert into _p values (50,'cliente cancela un apartado','bloqueado',r);

  -- el admin ve la lista de clientes con correo
  perform set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  select correo into r from public.clientes_admin() where nombre = 'Beto Prueba';
  reset role; insert into _p values (51,'admin ve clientes con correo','beto@prueba.mx',r);
end $$;

select n, prueba, esperado, obtenido,
       case when obtenido = esperado then 'OK' else 'FALLA' end as estado
from _p order by n;

rollback;
