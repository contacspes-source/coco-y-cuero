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
npm test             # 300 pruebas
npm run build        # revisa tipos, compila y arma dist/
```

## Publicar

`git push` a `main`. Cloudflare corre `npm run build` y publica la carpeta `dist/`. Si la compilación o los tipos fallan, no se publica nada y el sitio anterior sigue en línea.

## Calidad

- **TypeScript estricto**: errores de tipos frenan la compilación.
- **300 pruebas automáticas**: motor de precios, validación, filtros, ajuste masivo, catálogo con la base caída, estados de pedido, registro de clientes, detalle del perfume, periodos y CSV de reportes, casos de uso con repositorios falsos y regla de capas.
- **66 pruebas de seguridad en la base** (`supabase/pruebas/seguridad.sql`).
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

## Ventas: cómo fluye un pedido

```
Cliente aparta en la página ─┐
                             ├─► Solicitado ─► Apartado ─► Comprado ─► Entregado
Tú lo registras en el panel ─┘        (anticipo)   (ya lo tienes)  (saldo cobrado)
                                  └──────────── Cancelado ─────────┘
```

- **Panel → Pedidos**: lo pendiente arriba (por confirmar, por comprar, por entregar, por cobrar). Cada pedido trae un mensaje de WhatsApp ya redactado según su estado.
- **Panel → Clientes**: número de cliente, cómo te conocieron (útil para saber qué anuncio funciona), pedidos y total comprado.
- **Mi cuenta (sitio)**: el cliente ve su número, sus pedidos con fechas y puede cancelar una solicitud mientras no la hayas apartado.

## Reportes (Panel → Reportes)

| Qué ves | De dónde sale |
| --- | --- |
| Ventas, ganancia, ticket promedio | Pedidos **entregados** en el periodo (cuenta el día en que lo marcaste entregado) |
| Comparación ▲▼ | El periodo anterior del mismo largo (p. ej. del 1 al 26 de octubre se compara con los 26 días anteriores) |
| Ganancia | Precio pactado menos el **costo real** del pedido. Se toma solo del catálogo al marcar "Comprado"; corrígelo en la ficha si pagaste otra cantidad |
| Cómo te conocen | El "¿Cómo nos conociste?" de cada cliente nuevo y lo que compraron |
| Pedidos que entraron | Los creados en el periodo y en qué estado están hoy |
| Hoy | Pedidos en curso, anticipos, lo que falta cobrar y lo invertido en perfumes ya comprados |

"Descargar CSV" baja todo el reporte para abrirlo en Excel o Google Sheets.

## Textos que puedes cambiar sin tocar la lógica

| Qué | Dónde |
| --- | --- |
| Pasos de compra, formas de pago, entregas, garantía, ciudades | `sitio/negocio/tienda.ts` |
| Porcentaje de anticipo sugerido (hoy 50 %) | `PORCENTAJE_ANTICIPO` en `panel/negocio/ventas.ts` |
| Mensajes de WhatsApp por estado del pedido | `mensajeParaCliente` en `panel/negocio/ventas.ts` |
| Teléfono, Instagram y Facebook | `sitio/presentacion/config.ts` |
| Descripción de cada perfume | Panel → Catálogo → Editar |
| Diapositivas de la portada (textos, orden) y franja de beneficios | `sitio/negocio/portada.ts` |
| Términos y condiciones de compra | `sitio/terminos.html` (cambia también la fecha de "Última actualización") |
| Porcentaje de bienvenida (hoy 10 %) | `DESCUENTO_BIENVENIDA` en `sitio/negocio/tienda.ts` **y** `privado.porcentaje_bienvenida()` en la base: deben coincidir |

## Por qué existe `worker/`

Algunas redes (escuelas, oficinas, bloqueadores de anuncios, filtros de DNS) bloquean `*.supabase.co`. Para que el catálogo y las fotos carguen igual, el sitio los pide a su propio dominio:

| Ruta | Qué hace |
| --- | --- |
| `/api/catalogo` | Lee la vista `catalogo_publico` (guarda copia 60 s en Cloudflare) |
| `/fotos/<archivo>` | Trae la foto del bucket `perfumes` (copia por un año; cada foto tiene nombre único) |

Todo lo demás lo sirve Cloudflare directo desde `dist/`, sin ejecutar el Worker. Si algo falla, el sitio intenta Supabase directo y luego `catalogo-respaldo.json`; si nada responde, muestra "Reintentar" y abajo, en letra chica, qué falló (útil si alguien te manda captura).
