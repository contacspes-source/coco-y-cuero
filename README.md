# Coco & Cuero

Sitio de venta de perfumes árabes, de nicho y de diseñador, y su panel administrativo.

| | |
| --- | --- |
| Sitio | https://cocoycuero.com |
| Panel | https://cocoycuero.com/panel/ |
| Base de datos | Supabase (`supabase/README.md`) |
| Hospedaje | Cloudflare Workers, se publica solo en cada `git push` a `main` |

## Estructura

```
├── sitio/                       SITIO PÚBLICO (lee la vista catalogo_publico)
│   ├── presentacion/            página, tarjetas, filtros
│   ├── negocio/                 género → categoría, aromas, búsqueda, orden, filtros en la URL
│   └── datos/                   catálogo en vivo, con respaldo si Supabase no responde
├── publico/assets/img/          fotos, logos y favicon (se copian tal cual)
├── panel/                       PANEL ADMINISTRATIVO
│   ├── presentacion/            pantallas: login, catálogo, formulario, precios
│   ├── negocio/                 reglas: motor de precios, validación, casos de uso
│   └── datos/                   repositorios: el único lugar que habla con Supabase
├── compartido/                  tipos del dominio y configuración pública
├── pruebas/                     pruebas automáticas (npm test)
├── supabase/                    migraciones SQL y pruebas de seguridad
├── scripts/finalizar.mjs        encabezados y respaldo del catálogo en dist/
├── _headers                     encabezados de seguridad de Cloudflare
└── .github/workflows/           integración continua
```

## Arquitectura en capas

```
presentacion  →  negocio  →  datos  →  Supabase
        ↘          ↓          ↙
              compartido
```

Aplica igual al sitio y al panel. Cada capa solo usa la de abajo, y el sitio y el panel no comparten código entre sí, solo `compartido/`. Las pantallas nunca hablan directo con Supabase; las reglas de negocio no saben qué es HTML. `pruebas/arquitectura.test.ts` revisa los `import` de cada archivo y falla si alguien rompe la regla.

La seguridad no depende del panel: aunque alguien abra la consola del navegador, la base de datos (RLS) es la que decide qué puede leer y escribir cada cuenta.

## Trabajar en tu computadora

Requiere Node.js 22 o más nuevo.

```bash
npm install          # una sola vez
npm run dev          # sitio en http://localhost:5174/
npm run dev:panel    # panel en http://localhost:5173/panel/
npm test             # 133 pruebas
npm run build        # revisa tipos, compila y arma dist/
```

## Publicar

`git push` a `main`. Cloudflare corre `npm run build` y publica la carpeta `dist/`. Si la compilación o los tipos fallan, no se publica nada y el sitio anterior sigue en línea.

## Calidad

- **TypeScript estricto**: errores de tipos frenan la compilación.
- **133 pruebas automáticas**: motor de precios, validación, filtros del panel y del sitio, ajuste masivo, catálogo con la base caída, casos de uso con repositorios falsos y regla de capas.
- **37 pruebas de seguridad en la base** (`supabase/pruebas/seguridad.sql`).
- **GitHub Actions** corre todo en cada push; si algo falla, el commit sale en rojo.

## Agregar o cambiar perfumes

Desde el panel (`/panel/`). El sitio los muestra en cuanto guardas: ya no hay que editar archivos ni publicar.

## Enlaces para anuncios

Los filtros viven en la dirección, así que un anuncio puede llevar directo a una sección:

| Para | Enlace |
| --- | --- |
| Perfumes árabes de dama | `cocoycuero.com/?genero=dama&categoria=arabes#catalogo` |
| Caballero, aroma amaderado | `cocoycuero.com/?genero=caballero&aroma=amaderado#catalogo` |
| Dulces y florales | `cocoycuero.com/?aroma=dulce,floral#catalogo` |
| Diseñador, del más barato al más caro | `cocoycuero.com/?categoria=disenador&orden=precio-menor#catalogo` |

Valores: `genero` = caballero, dama, unisex · `categoria` = arabes, nicho, disenador · `aroma` = cuero, dulce, floral, amaderado, fresco · `orden` = precio-menor, precio-mayor, nombre · `q` = búsqueda libre. Se pueden agregar parámetros `utm_` sin problema.
