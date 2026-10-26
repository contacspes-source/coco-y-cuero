-- =============================================================
-- 002 · Clientes, proveedores y pedidos
-- La cuenta de acceso (auth.users) se separa del expediente.
-- El número de cliente lo genera una secuencia, nunca la app.
-- =============================================================

create table public.canal_origen (
  id      smallint generated always as identity primary key,
  nombre  text not null unique
);

create sequence public.numero_cliente_seq start with 1001;

create table public.cliente (
  id              bigint generated always as identity primary key,
  auth_user_id    uuid unique references auth.users (id) on delete set null,
  numero_cliente  integer not null unique default nextval('public.numero_cliente_seq'),
  nombre          text not null check (length(trim(nombre)) > 1),
  telefono        text check (telefono ~ '^[0-9]{10}$'),
  direccion       text,
  ciudad          text,
  canal_id        smallint references public.canal_origen (id),
  rol             text not null default 'cliente' check (rol in ('admin','cliente')),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

alter sequence public.numero_cliente_seq owned by public.cliente.numero_cliente;

create table public.proveedor (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  contacto   text,
  creado_en  timestamptz not null default now()
);

create table public.costo_proveedor (
  id               bigint generated always as identity primary key,
  presentacion_id  bigint not null references public.presentacion (id) on delete cascade,
  proveedor_id     bigint not null references public.proveedor (id) on delete restrict,
  costo            numeric(10,2) not null check (costo >= 0),
  vigente_desde    date not null default current_date,
  unique (presentacion_id, proveedor_id, vigente_desde)
);

create table public.pedido (
  id               bigint generated always as identity primary key,
  cliente_id       bigint not null references public.cliente (id) on delete restrict,
  presentacion_id  bigint not null references public.presentacion (id) on delete restrict,
  estado           text not null default 'consultado'
                   check (estado in ('consultado','apartado','comprado','entregado','cancelado')),
  anticipo         numeric(10,2) not null default 0 check (anticipo >= 0),
  precio_pactado   numeric(10,2) not null check (precio_pactado >= 0),
  ciudad_entrega   text,
  notas            text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint anticipo_no_mayor_al_precio check (anticipo <= precio_pactado)
);

create trigger cliente_actualizado
  before update on public.cliente
  for each row execute function public.tocar_actualizado_en();

create trigger pedido_actualizado
  before update on public.pedido
  for each row execute function public.tocar_actualizado_en();

-- Reglas de transición de estado (RF-16): no se puede saltar de
-- consultado a entregado, ni revivir un pedido cancelado o entregado.
create or replace function public.validar_transicion_pedido()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if old.estado = new.estado then
    return new;
  end if;

  if old.estado in ('entregado','cancelado') then
    raise exception 'El pedido % ya está % y no puede cambiar de estado', old.id, old.estado;
  end if;

  if not (
       (old.estado = 'consultado' and new.estado in ('apartado','cancelado'))
    or (old.estado = 'apartado'   and new.estado in ('comprado','cancelado'))
    or (old.estado = 'comprado'   and new.estado in ('entregado','cancelado'))
  ) then
    raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
  end if;

  return new;
end;
$$;

create trigger pedido_transicion
  before update of estado on public.pedido
  for each row execute function public.validar_transicion_pedido();

create index pedido_cliente_idx      on public.pedido (cliente_id);
create index pedido_presentacion_idx on public.pedido (presentacion_id);
create index pedido_estado_idx       on public.pedido (estado);
create index pedido_creado_idx       on public.pedido (creado_en);
create index costo_prov_pres_idx     on public.costo_proveedor (presentacion_id);
create index costo_prov_prov_idx     on public.costo_proveedor (proveedor_id);
create index cliente_canal_idx       on public.cliente (canal_id);

comment on column public.pedido.precio_pactado is 'Precio al momento del pedido. No cambia aunque el catálogo suba de precio.';
comment on column public.cliente.auth_user_id  is 'Enlace 1:1 con auth.users. Nunca se duplica el correo ni la contraseña aquí.';
