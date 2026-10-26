-- =============================================================
-- 001 · Catálogo
-- Género y categoría forman la jerarquía de navegación (RF-13).
-- El precio vive en la presentación, no en el perfume.
-- =============================================================

-- marca de tiempo automática en cada tabla (RNF-08)
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create table public.genero (
  id           smallint generated always as identity primary key,
  clave        text not null unique check (clave ~ '^[a-z]+$'),
  nombre       text not null,
  orden        smallint not null default 0
);

create table public.categoria (
  id           smallint generated always as identity primary key,
  clave        text not null unique check (clave ~ '^[a-z]+$'),
  nombre       text not null,
  orden        smallint not null default 0
);

create table public.marca (
  id           bigint generated always as identity primary key,
  nombre       text not null unique,
  origen       text,
  creado_en    timestamptz not null default now()
);

create table public.familia_olfativa (
  id           smallint generated always as identity primary key,
  nombre       text not null unique
);

create table public.nota (
  id           bigint generated always as identity primary key,
  familia_id   smallint references public.familia_olfativa (id) on delete set null,
  nombre       text not null unique
);

create table public.perfume (
  id             bigint generated always as identity primary key,
  marca_id       bigint   not null references public.marca (id),
  genero_id      smallint not null references public.genero (id),
  categoria_id   smallint not null references public.categoria (id),
  nombre         text not null,
  tipo           text not null check (tipo in ('EDT','EDP','Parfum','Extrait','Colonia')),
  imagen_url     text,
  publicado      boolean not null default true,   -- baja lógica (RF-09)
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, nombre, tipo)
);

create table public.perfume_nota (
  perfume_id   bigint not null references public.perfume (id) on delete cascade,
  nota_id      bigint not null references public.nota (id) on delete restrict,
  piramide     text check (piramide in ('salida','corazon','fondo')),
  primary key (perfume_id, nota_id)
);

create table public.presentacion (
  id             bigint generated always as identity primary key,
  perfume_id     bigint not null references public.perfume (id) on delete cascade,
  ml             smallint not null check (ml > 0),
  costo          numeric(10,2) not null check (costo >= 0),
  precio_venta   numeric(10,2) not null check (precio_venta >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (perfume_id, ml),
  -- regla de negocio: nunca vender por debajo del costo
  constraint precio_no_menor_al_costo check (precio_venta >= costo)
);

create trigger perfume_actualizado
  before update on public.perfume
  for each row execute function public.tocar_actualizado_en();

create trigger presentacion_actualizada
  before update on public.presentacion
  for each row execute function public.tocar_actualizado_en();

-- índices para las consultas del catálogo público
create index perfume_navegacion_idx on public.perfume (genero_id, categoria_id) where publicado;
create index perfume_marca_idx      on public.perfume (marca_id);
create index presentacion_perfume_idx on public.presentacion (perfume_id);
create index perfume_nota_nota_idx  on public.perfume_nota (nota_id);
create index nota_familia_idx       on public.nota (familia_id);

comment on table  public.presentacion is 'El precio vive aquí: un perfume puede venderse en varias presentaciones.';
comment on column public.perfume.publicado is 'Baja lógica. false = oculto del sitio, conserva el historial de pedidos.';
