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
├── index.html, assets/, data/   SITIO PÚBLICO (HTML estático; pasa a la base en el incremento 3)
├── panel/                       PANEL ADMINISTRATIVO
│   ├── presentacion/            pantallas: login, catálogo, formulario, precios
│   ├── negocio/                 reglas: motor de precios, validación, casos de uso
│   └── datos/                   repositorios: el único lugar que habla con Supabase
├── compartido/                  tipos del dominio y configuración pública
├── pruebas/                     pruebas automáticas (npm test)
├── supabase/                    migraciones SQL y pruebas de seguridad
├── scripts/copiar-sitio.mjs     arma dist/ con el sitio y el panel
├── _headers                     encabezados de seguridad de Cloudflare
└── .github/workflows/           integración continua
```

## Arquitectura en capas

```
presentacion  →  negocio  →  datos  →  Supabase
        ↘          ↓          ↙
              compartido
```

Cada capa solo usa la de abajo. Las pantallas nunca importan Supabase; las reglas de negocio no saben qué es HTML. `pruebas/arquitectura.test.ts` revisa los `import` de cada archivo y falla si alguien rompe la regla.

La seguridad no depende del panel: aunque alguien abra la consola del navegador, la base de datos (RLS) es la que decide qué puede leer y escribir cada cuenta.

## Trabajar en tu computadora

Requiere Node.js 22 o más nuevo.

```bash
npm install          # una sola vez
npm run dev          # panel en http://localhost:5173/panel/
npm test             # 93 pruebas
npm run build        # revisa tipos, compila y arma dist/
```

## Publicar

`git push` a `main`. Cloudflare corre `npm run build` y publica la carpeta `dist/`. Si la compilación o los tipos fallan, no se publica nada y el sitio anterior sigue en línea.

## Calidad

- **TypeScript estricto**: errores de tipos frenan la compilación.
- **93 pruebas automáticas**: motor de precios, validación, filtros, ajuste masivo, casos de uso con repositorios falsos y regla de capas.
- **34 pruebas de seguridad en la base** (`supabase/pruebas/seguridad.sql`).
- **GitHub Actions** corre todo en cada push; si algo falla, el commit sale en rojo.
