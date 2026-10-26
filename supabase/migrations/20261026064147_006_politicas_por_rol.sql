-- =============================================================
-- 006 · Corrección encontrada en pruebas
-- Las políticas de lectura del catálogo evaluaban es_admin() también
-- para el rol anónimo, que no tiene permiso de ejecutarla: el sitio
-- público habría recibido "permission denied" en lugar del catálogo.
-- Se separa una política por rol. Además el anónimo ya no evalúa
-- una función por cada fila, que es más rápido.
-- =============================================================

drop policy "lectura de publicados" on public.perfume;
drop policy "lectura de publicados" on public.presentacion;
drop policy "lectura de publicados" on public.perfume_nota;

-- Visitante sin cuenta: solo lo publicado
create policy "anon lee publicados" on public.perfume
  for select to anon
  using (publicado);

create policy "anon lee publicados" on public.presentacion
  for select to anon
  using (exists (select 1 from public.perfume p
                 where p.id = presentacion.perfume_id and p.publicado));

create policy "anon lee publicados" on public.perfume_nota
  for select to anon
  using (exists (select 1 from public.perfume p
                 where p.id = perfume_nota.perfume_id and p.publicado));

-- Con cuenta: lo publicado; el admin además ve lo dado de baja
create policy "autenticado lee publicados" on public.perfume
  for select to authenticated
  using (publicado or (select public.es_admin()));

create policy "autenticado lee publicados" on public.presentacion
  for select to authenticated
  using (exists (select 1 from public.perfume p
                 where p.id = presentacion.perfume_id
                   and (p.publicado or (select public.es_admin()))));

create policy "autenticado lee publicados" on public.perfume_nota
  for select to authenticated
  using (exists (select 1 from public.perfume p
                 where p.id = perfume_nota.perfume_id
                   and (p.publicado or (select public.es_admin()))));
