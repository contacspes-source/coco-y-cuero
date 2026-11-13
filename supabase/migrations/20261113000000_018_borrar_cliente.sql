-- =============================================================
-- 018 · Borrar un cliente para siempre
--
-- Dar de baja (016) solo lo esconde; su cuenta de acceso sigue y el
-- correo queda ocupado. Esto lo borra de verdad, junto con su cuenta,
-- para que ese correo se pueda volver a registrar.
--
-- Reglas (dos pasos, como borrar perfumes):
--   · solo admin
--   · solo un cliente que YA está dado de baja
--   · nunca un administrador
--   · sin pedidos: si tiene, se queda de baja para no perder el
--     historial de ventas ni descuadrar los reportes
--
-- Pruebas: supabase/pruebas/seguridad.sql (102 a 108).
-- =============================================================

create or replace function public.borrar_cliente(p_cliente_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_activo boolean;
  v_rol    text;
  v_cuenta uuid;
begin
  if not privado.es_admin() then
    raise exception 'Solo un administrador puede borrar clientes' using errcode = '42501';
  end if;
  select activo, rol, auth_user_id into v_activo, v_rol, v_cuenta
  from public.cliente where id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente % no existe', p_cliente_id using errcode = 'P0002';
  end if;
  if v_rol = 'admin' then
    raise exception 'No se puede borrar a un administrador' using errcode = 'P0001';
  end if;
  if v_activo then
    raise exception 'Primero da de baja al cliente; luego lo puedes borrar' using errcode = 'P0001', hint = 'primero_baja';
  end if;
  if exists (select 1 from public.pedido where cliente_id = p_cliente_id) then
    raise exception 'Este cliente tiene pedidos: se queda de baja para conservar tu historial de ventas'
      using errcode = 'P0001', hint = 'tiene_pedidos';
  end if;

  delete from public.cliente where id = p_cliente_id;
  -- su cuenta de acceso (sesiones e identidades se van con ella)
  if v_cuenta is not null then
    delete from auth.users where id = v_cuenta;
  end if;
end;
$$;

revoke execute on function public.borrar_cliente(bigint) from public, anon;
grant  execute on function public.borrar_cliente(bigint) to authenticated;
