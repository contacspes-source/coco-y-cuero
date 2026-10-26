-- =============================================================
-- 010 · Vista pública del catálogo (incremento 3)
--
-- El sitio público lee de aquí y de nada más. Un renglón por
-- perfume publicado, con sus presentaciones y notas ya armadas,
-- así el navegador hace UNA sola petición.
--
-- security_invoker: la vista corre con los permisos de quien
-- pregunta, así que las políticas RLS de las tablas siguen
-- mandando. Aun así, la vista no tiene ninguna columna de costo:
-- aunque alguien la consulte como administrador, no hay nada que
-- filtrar.
-- =============================================================

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
  coalesce((
    select json_agg(json_build_object('ml', pr.ml, 'precio', pr.precio_venta) order by pr.ml)
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
