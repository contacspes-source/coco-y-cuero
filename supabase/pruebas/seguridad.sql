-- =============================================================
-- Pruebas de seguridad · Coco & Cuero
--
-- Cómo correrlas: pega todo este archivo en el editor SQL de
-- Supabase y ejecútalo. Todo corre dentro de una transacción que
-- termina en ROLLBACK, así que NO deja datos de prueba.
--
-- Resultado esperado: todas las filas con estado = 'OK'.
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
declare v bigint; r text; total bigint;
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
  begin update public.presentacion set precio_venta = 1
        where id = (select presentacion_id from public.margen_actual order by costo desc limit 1);
        r := 'VENDIO CON PERDIDA';
  exception when raise_exception then r := 'bloqueado'; end;
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
end $$;

select n, prueba, esperado, obtenido,
       case when obtenido = esperado then 'OK' else 'FALLA' end as estado
from _p order by n;

rollback;
