-- =============================================================
-- 012 · La vista pública incluye el id de cada presentación
-- Lo necesita "Apartar" en el sitio: solicitar_pedido recibe el id
-- de la presentación. No expone nada nuevo (el id ya es público por
-- la tabla presentacion).
-- =============================================================

drop view public.catalogo_publico;
create view public.catalogo_publico
with (security_invoker = true) as
select
  p.id,
  m.nombre                 as marca,
  p.nombre,
  p.tipo,
  g.clave                  as genero,
  c.clave                  as categoria,
  p.imagen_url,
  p.descripcion,
  coalesce((
    select json_agg(json_build_object('id', pr.id, 'ml', pr.ml, 'precio', pr.precio_venta) order by pr.ml)
    from public.presentacion pr
    where pr.perfume_id = p.id
  ), '[]'::json)           as presentaciones,
  coalesce((
    select json_agg(json_build_object('nota', n.nombre, 'familia', f.nombre) order by n.nombre)
    from public.perfume_nota pn
    join public.nota n on n.id = pn.nota_id
    left join public.familia_olfativa f on f.id = n.familia_id
    where pn.perfume_id = p.id
  ), '[]'::json)           as notas,
  p.actualizado_en
from public.perfume p
join public.marca     m on m.id = p.marca_id
join public.genero    g on g.id = p.genero_id
join public.categoria c on c.id = p.categoria_id
where p.publicado;

comment on view public.catalogo_publico is
  'Catálogo que ve el sitio público: solo perfumes publicados, sin costos.';
revoke all on public.catalogo_publico from anon, authenticated;
grant select on public.catalogo_publico to anon, authenticated;
