-- =============================================================
-- 005 · Semilla
-- Catálogos base y los 53 perfumes del proveedor de Guadalajara.
-- Precios = los publicados hoy en el sitio (diseñador ×1.60, árabes ×1.90
-- sobre costo con colchón de 10%). Costos = capturas del proveedor.
-- =============================================================

insert into public.genero (clave, nombre, orden) values
  ('caballero','Caballero',1), ('dama','Dama',2), ('unisex','Unisex',3);

insert into public.categoria (clave, nombre, orden) values
  ('arabes','Árabes',1), ('nicho','Nicho',2), ('disenador','Diseñador',3);

insert into public.canal_origen (nombre) values
  ('Instagram'), ('Facebook'), ('TikTok'), ('Recomendación'),
  ('Anuncio pagado'), ('Google'), ('Otro');

insert into public.familia_olfativa (nombre) values
  ('Ámbar y cuero'), ('Dulce y gourmand'), ('Floral'), ('Amaderado'), ('Fresco y cítrico');

insert into public.nota (nombre, familia_id)
select v.nota, f.id
from (values
  ('ámbar','Ámbar y cuero'),
  ('tabaco','Ámbar y cuero'),
  ('oriental','Ámbar y cuero'),
  ('cacao','Ámbar y cuero'),
  ('atalcado','Ámbar y cuero'),
  ('vainilla','Dulce y gourmand'),
  ('dulce','Dulce y gourmand'),
  ('caramelo','Dulce y gourmand'),
  ('coco','Dulce y gourmand'),
  ('floral','Floral'),
  ('flor blanca','Floral'),
  ('lavanda','Floral'),
  ('amaderado','Amaderado'),
  ('madera','Amaderado'),
  ('musgoso','Amaderado'),
  ('aromático','Amaderado'),
  ('picante','Amaderado'),
  ('cítrico','Fresco y cítrico'),
  ('acuático','Fresco y cítrico'),
  ('marino','Fresco y cítrico'),
  ('frutal','Fresco y cítrico'),
  ('afrutado','Fresco y cítrico')
) as v(nota, familia)
join public.familia_olfativa f on f.nombre = v.familia;

insert into public.marca (nombre, origen) values
  ('Afnan','Emiratos Árabes Unidos'), ('Armaf','Emiratos Árabes Unidos'), ('Bharara','Estados Unidos'), ('Carolina Herrera','España'), ('Dolce & Gabbana','Italia'), ('Hugo Boss','Alemania'), ('Jean Paul Gaultier','Francia'), ('Lattafa','Emiratos Árabes Unidos'), ('Nautica','Estados Unidos'), ('Odyssey (Armaf)','Emiratos Árabes Unidos'), ('Paco Rabanne','Francia'), ('Rasasi','Emiratos Árabes Unidos'), ('Stallion','Emiratos Árabes Unidos'), ('Versace','Italia');

insert into public.proveedor (nombre, contacto) values
  ('Proveedor GDL', 'Distribuidor mayorista en Guadalajara');

create temp table _semilla (
  marca text, nombre text, tipo text, ml smallint, genero text, categoria text,
  imagen text, precio numeric, costo numeric, notas text
) on commit drop;

insert into _semilla values
  ('Afnan','9pm','EDP',100,'caballero','arabes','assets/img/afnan-9pm.jpg',1050,503,'Vainilla, ámbar, afrutado'),
  ('Afnan','9pm Elixir Parfum Intense','EDP',100,'caballero','arabes','assets/img/afnan-9pm-elixir-parfum-intense.jpg',1350,646,''),
  ('Lattafa','Asad','EDP',100,'caballero','arabes','assets/img/lattafa-asad.jpg',870,414,'Vainilla, amaderado, ámbar'),
  ('Lattafa','Asad Zanzibar','EDP',100,'caballero','arabes','assets/img/lattafa-asad-zanzibar.jpg',900,429,'Atalcado, vainilla, lavanda'),
  ('Lattafa','Asad Bourbon','EDP',100,'caballero','arabes','assets/img/lattafa-asad-bourbon.jpg',1310,626,'Vainilla, cacao, aromático'),
  ('Lattafa','Asad Elixir','EDP',100,'caballero','arabes','assets/img/lattafa-asad-elixir.jpg',1530,732,''),
  ('Bharara','King Rellenable','EDP',100,'caballero','arabes','assets/img/bharara-king-rellenable.jpg',2000,959,'Frutal, cítrico, vainilla'),
  ('Armaf','Club de Nuit Intense Man','EDT',105,'caballero','arabes','assets/img/armaf-club-de-nuit-intense-man.jpg',1370,656,'Cítrico, frutal, amaderado'),
  ('Rasasi','Hawas for Him','EDP',100,'caballero','arabes','assets/img/rasasi-hawas-for-him.jpg',1300,621,'Cítrico, acuático, frutal'),
  ('Rasasi','Hawas Black','EDP',100,'caballero','arabes','assets/img/rasasi-hawas-black.jpg',1420,681,'Amaderado, cítrico, frutal'),
  ('Rasasi','Hawas Ice','EDP',100,'caballero','arabes','assets/img/rasasi-hawas-ice.jpg',1850,883,'Frutal, dulce, floral'),
  ('Rasasi','Hawas Tropical','EDP',100,'caballero','arabes','assets/img/rasasi-hawas-tropical.jpg',1850,883,''),
  ('Rasasi','Hawas Elixir','EDP',100,'unisex','arabes','assets/img/rasasi-hawas-elixir.jpg',1790,858,''),
  ('Lattafa','His Confession','EDP',100,'caballero','arabes','assets/img/lattafa-his-confession.jpg',1530,732,''),
  ('Lattafa','Khamrah Dukhan','EDP',100,'unisex','arabes','assets/img/lattafa-khamrah-dukhan.jpg',1030,494,'Ámbar, dulce, tabaco'),
  ('Lattafa','Khamrah Waha','EDP',100,'unisex','arabes','assets/img/lattafa-khamrah-waha.jpg',2000,959,''),
  ('Lattafa','Haya','EDP',100,'dama','arabes','assets/img/lattafa-haya.jpg',1210,580,'Floral, frutal, dulce'),
  ('Lattafa','Yara','EDP',100,'dama','arabes','assets/img/lattafa-yara.jpg',1200,575,''),
  ('Lattafa','Yara Elixir','EDP',100,'dama','arabes','assets/img/lattafa-yara-elixir.jpg',1530,732,''),
  ('Lattafa','Yara Candy','EDP',100,'dama','arabes','assets/img/lattafa-yara-candy.jpg',1000,479,'Vainilla, frutal, flor blanca'),
  ('Odyssey (Armaf)','Mandarin Sky','EDP',100,'caballero','arabes','assets/img/odyssey-armaf-mandarin-sky.jpg',1390,665,'Cítrico, caramelo, dulce'),
  ('Odyssey (Armaf)','Mandarin Sky Elixir Limited Edition','EDP',100,'unisex','arabes','assets/img/odyssey-armaf-mandarin-sky-elixir-limited-edition.jpg',1680,802,''),
  ('Odyssey (Armaf)','Mandarin Sky Vintage Edition','EDP',100,'unisex','arabes','assets/img/odyssey-armaf-mandarin-sky-vintage-edition.jpg',1390,666,''),
  ('Odyssey (Armaf)','Go Mango Tropical Collection','EDP',100,'unisex','arabes','assets/img/odyssey-armaf-go-mango-tropical-collection.jpg',1290,615,''),
  ('Odyssey (Armaf)','Marshmallow Gourmand Edition','EDP',100,'unisex','arabes','assets/img/odyssey-armaf-marshmallow-gourmand-edition.jpg',1160,555,''),
  ('Stallion','Stallion 53 (incluye travel 20 ml)','EDP',100,'unisex','arabes','assets/img/stallion-stallion-53-incluye-travel-20-ml.jpg',1040,499,''),
  ('Carolina Herrera','Good Girl','EDP',80,'dama','disenador','assets/img/carolina-herrera-good-girl.jpg',2920,1657,''),
  ('Carolina Herrera','Good Girl Blush','EDP',80,'dama','disenador','assets/img/carolina-herrera-good-girl-blush.jpg',3300,1875,'Floral, vainilla, cítrico'),
  ('Carolina Herrera','Good Girl Blush Elixir','EDP',80,'dama','disenador','assets/img/carolina-herrera-good-girl-blush-elixir.jpg',3440,1954,'Vainilla, amaderado, floral'),
  ('Carolina Herrera','Good Girl Very Elixir','EDP',80,'dama','disenador','assets/img/carolina-herrera-good-girl-very-elixir.jpg',3450,1963,''),
  ('Hugo Boss','Boss Bottled Infinite','EDP',100,'caballero','disenador','assets/img/hugo-boss-boss-bottled-infinite.jpg',1550,883,'Aromático, madera'),
  ('Hugo Boss','Boss Bottled Night','EDT',100,'caballero','disenador','assets/img/hugo-boss-boss-bottled-night.jpg',1100,626,'Aromático, madera'),
  ('Hugo Boss','Boss Bottled Unlimited','EDT',100,'caballero','disenador','assets/img/hugo-boss-boss-bottled-unlimited.jpg',1150,656,'Aromático, picante'),
  ('Dolce & Gabbana','Dolce Garden','EDP',75,'dama','disenador','assets/img/dolce-gabbana-dolce-garden.jpg',1530,868,'Floral, frutal'),
  ('Paco Rabanne','Invictus','EDT',100,'caballero','disenador','assets/img/paco-rabanne-invictus.jpg',2320,1318,'Cítrico, madera'),
  ('Paco Rabanne','Invictus Victory','EDP',100,'caballero','disenador','assets/img/paco-rabanne-invictus-victory.jpg',2720,1543,'Acuático, cítrico, madera'),
  ('Paco Rabanne','Invictus Parfum','EDP',100,'caballero','disenador','assets/img/paco-rabanne-invictus-parfum.jpg',2740,1558,'Aromático, marino, atalcado'),
  ('Paco Rabanne','One Million','EDT',100,'caballero','disenador','assets/img/paco-rabanne-one-million.jpg',2330,1322,'Madera, picante'),
  ('Jean Paul Gaultier','Le Male','EDT',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-male.jpg',2400,1365,'Musgoso, oriental'),
  ('Jean Paul Gaultier','Le Male Elixir','Parfum',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-male-elixir.jpg',3290,1868,'Vainilla, dulce, ámbar'),
  ('Jean Paul Gaultier','Le Beau','EDT',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-beau.jpg',2750,1565,'Aromático'),
  ('Jean Paul Gaultier','Le Beau Le Parfum','EDP',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-beau-le-parfum.jpg',2980,2120,'Madera, vainilla'),
  ('Jean Paul Gaultier','Le Beau Narcisse','EDP',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-beau-narcisse.jpg',3110,1767,''),
  ('Jean Paul Gaultier','Le Beau Paradise Garden','EDP',125,'caballero','disenador','assets/img/jean-paul-gaultier-le-beau-paradise-garden.jpg',2940,1672,'Coco, dulce, vainilla'),
  ('Jean Paul Gaultier','Divine','EDP',100,'dama','disenador','assets/img/jean-paul-gaultier-divine.jpg',3320,1845,'Dulce, acuático'),
  ('Jean Paul Gaultier','Scandal','EDP',100,'caballero','disenador','assets/img/jean-paul-gaultier-scandal.jpg',2740,1558,'Aromático, vainilla, amaderado'),
  ('Jean Paul Gaultier','Scandal Intense','EDP',100,'caballero','disenador','assets/img/jean-paul-gaultier-scandal-intense.jpg',2780,1578,''),
  ('Jean Paul Gaultier','Scandal Absolu','EDP',100,'caballero','disenador','assets/img/jean-paul-gaultier-scandal-absolu.jpg',3000,1707,'Amaderado, frutal, dulce'),
  ('Versace','Eros','EDP',100,'caballero','disenador','assets/img/versace-eros.jpg',2000,1136,'Aromático, madera'),
  ('Versace','Pour Homme Dylan Blue','EDT',100,'caballero','disenador','assets/img/versace-pour-homme-dylan-blue.jpg',1670,948,'Aromático, cítrico'),
  ('Versace','Pour Homme','EDT',100,'caballero','disenador','assets/img/versace-pour-homme.jpg',1660,944,'Aromático, cítrico'),
  ('Versace','Bright Crystal','EDT',90,'dama','disenador','assets/img/versace-bright-crystal.jpg',1770,1005,'Floral, frutal'),
  ('Nautica','Voyage','EDT',100,'caballero','disenador','assets/img/nautica-voyage.jpg',390,221,'Acuático, madera');

insert into public.perfume (marca_id, genero_id, categoria_id, nombre, tipo, imagen_url)
select m.id, g.id, c.id, s.nombre, s.tipo, s.imagen
from _semilla s
join public.marca     m on m.nombre = s.marca
join public.genero    g on g.clave  = s.genero
join public.categoria c on c.clave  = s.categoria;

insert into public.presentacion (perfume_id, ml, precio_venta)
select pe.id, s.ml, s.precio
from _semilla s
join public.marca   m  on m.nombre = s.marca
join public.perfume pe on pe.marca_id = m.id and pe.nombre = s.nombre and pe.tipo = s.tipo;

insert into public.costo_proveedor (presentacion_id, proveedor_id, costo)
select pr.id, pv.id, s.costo
from _semilla s
join public.marca        m  on m.nombre = s.marca
join public.perfume      pe on pe.marca_id = m.id and pe.nombre = s.nombre and pe.tipo = s.tipo
join public.presentacion pr on pr.perfume_id = pe.id and pr.ml = s.ml
cross join (select id from public.proveedor where nombre = 'Proveedor GDL') pv;

insert into public.perfume_nota (perfume_id, nota_id)
select distinct pe.id, n.id
from _semilla s
join public.marca   m  on m.nombre = s.marca
join public.perfume pe on pe.marca_id = m.id and pe.nombre = s.nombre and pe.tipo = s.tipo
cross join lateral unnest(string_to_array(s.notas, ',')) as t(nota)
join public.nota n on n.nombre = lower(trim(t.nota))
where trim(t.nota) <> '';
