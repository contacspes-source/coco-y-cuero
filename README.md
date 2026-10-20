# Coco y Cuero

Catálogo web de perfumes árabes, de nicho y de diseñador. Sitio estático (HTML, CSS y JavaScript sin dependencias) servido en Cloudflare Pages.

## Estructura

```
cocoycuero/
├── index.html            Página única: hero, catálogo, cómo funciona, autenticidad
├── assets/
│   ├── styles.css        Estilos y tokens de color
│   └── app.js            Carga el catálogo, filtros, búsqueda y enlaces de WhatsApp
└── data/
    └── perfumes.json     EL CATÁLOGO. Es el único archivo que editas día a día.
```

## Antes de publicar

1. Abre `assets/app.js` y cambia el bloque `CONFIG`:
   - `whatsapp`: tu número con lada de país, sin `+` ni espacios (México: `521` + 10 dígitos).
   - `instagram` y `facebook`: las URLs reales de tus perfiles.
2. Abre `index.html` y pega el código del píxel de Meta donde dice `PÍXEL DE META`.

## Agregar perfumes

Edita `data/perfumes.json`. Cada perfume es un objeto:

```json
{
  "id": "sauvage-dior",
  "nombre": "Sauvage",
  "marca": "Dior",
  "categoria": "disenador",
  "notas": "Bergamota, pimienta, ambroxan",
  "imagen": "",
  "disponible": true,
  "tamanos": [
    { "ml": 10, "precio": 350 },
    { "ml": 100, "precio": 2490 }
  ]
}
```

- `categoria` solo acepta: `arabes`, `nicho` o `disenador`.
- `imagen`: déjala vacía y se dibuja un recuadro con las iniciales. Cuando tengas foto propia, guárdala en `assets/img/` y pon `"assets/img/sauvage.jpg"`.
- `precio` va en pesos, sin signo ni comas.

Cuida la sintaxis: coma entre objetos, sin coma después del último. Si el catálogo no carga, casi siempre es una coma de más.

## Ver el sitio en local

```bash
python3 -m http.server 8000
```

Luego abre http://localhost:8000. Hace falta un servidor porque `fetch` no lee archivos locales directamente.

## Publicar

Cada `git push` a la rama `main` despliega automáticamente en Cloudflare Pages.

```bash
git add .
git commit -m "Agrego 5 perfumes al catálogo"
git push
```
