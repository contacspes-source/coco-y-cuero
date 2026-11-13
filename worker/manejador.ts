/**
 * Lógica del Worker de cocoycuero.com (index.ts solo la conecta).
 *
 * Casi todo el sitio son archivos estáticos que Cloudflare sirve solo
 * (este código ni se ejecuta). Solo pasan por aquí tres rutas:
 *
 *   /api/catalogo   → la vista catalogo_publico de Supabase
 *   /fotos/<archivo> → las fotos del bucket "perfumes"
 *   /p/<nombre>     → la tienda, con la vista previa de ese perfume
 *                      (foto, nombre y precio) para WhatsApp y redes.
 *                      También acepta los enlaces viejos /p/<id>-…
 *
 * ¿Por qué? Algunas redes (escuelas, oficinas, bloqueadores de anuncios
 * o filtros de DNS) bloquean *.supabase.co. Pidiendo todo a nuestro
 * propio dominio, el catálogo y las fotos cargan igual en esas redes.
 * De paso, Cloudflare guarda copia unos segundos y responde más rápido.
 *
 * Solo lee cosas públicas con la llave publicable (que ya es pública);
 * nunca escribe ni usa llaves secretas.
 */
import { BUCKET_FOTOS, SUPABASE_LLAVE_PUBLICABLE, SUPABASE_URL } from "../compartido/config";
import { esRutaDePerfume, nombresDeEnlace, perfumeDeRuta, rutaDePerfume } from "../compartido/texto";

export interface Entorno {
  ASSETS: { fetch(peticion: Request): Promise<Response> };
}
export interface Contexto {
  waitUntil(promesa: Promise<unknown>): void;
}
export interface Cache {
  match(peticion: Request): Promise<Response | undefined>;
  put(peticion: Request, respuesta: Response): Promise<void>;
}

export const CATALOGO_UPSTREAM = `${SUPABASE_URL}/rest/v1/catalogo_publico?select=*&order=id`;
const FOTOS_UPSTREAM = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;
/** Solo nombres de archivo simples: nada de "../" ni subcarpetas. */
const NOMBRE_DE_FOTO = /^[a-z0-9][a-z0-9._-]{0,180}\.(webp|jpe?g|png)$/i;

const json = (cuerpo: unknown, estado: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra },
  });

/** Partes que se pueden reemplazar en las pruebas. */
export interface Dependencias {
  pedir: (url: string, init?: RequestInit) => Promise<Response>;
  cache: Cache | null;
}

export async function manejar(peticion: Request, entorno: Entorno, ctx: Contexto, dep: Dependencias): Promise<Response> {
  const url = new URL(peticion.url);
  const esLectura = peticion.method === "GET" || peticion.method === "HEAD";

  if (url.pathname === "/api/catalogo") {
    if (!esLectura) return json({ error: "Método no permitido" }, 405, { Allow: "GET, HEAD" });
    return catalogo(peticion, ctx, dep);
  }
  if (url.pathname.startsWith("/fotos/")) {
    if (!esLectura) return json({ error: "Método no permitido" }, 405, { Allow: "GET, HEAD" });
    const nombre = decodeURIComponent(url.pathname.slice("/fotos/".length));
    if (!NOMBRE_DE_FOTO.test(nombre)) return json({ error: "Foto no válida" }, 400);
    return foto(peticion, nombre, ctx, dep);
  }
  if (url.pathname.startsWith("/p/")) {
    if (!esLectura) return json({ error: "Método no permitido" }, 405, { Allow: "GET, HEAD" });
    if (!esRutaDePerfume(url.pathname)) return Response.redirect(`${url.origin}/`, 302);
    return paginaDePerfume(peticion, entorno, ctx, dep);
  }
  return entorno.ASSETS.fetch(peticion);
}

// ------------------------------------------------------------ /p/<id>
/** Lo que se mete en atributos y en <title>: nunca HTML crudo de la base. */
export const escaparHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const pesosMx = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

interface FichaPublica {
  id: number;
  marca: string | null;
  nombre: string;
  tipo: string | null;
  imagen_url: string | null;
  presentaciones: { ml: number; precio: number | string }[] | null;
}

/** URL absoluta de la foto para la vista previa (por nuestro dominio). */
export function fotoAbsoluta(origen: string, imagen: string | null): string | null {
  if (!imagen) return null;
  const m = /\/storage\/v1\/object\/public\/[^/]+\/([^/?#]+)$/.exec(imagen);
  if (m) return `${origen}/fotos/${m[1]}`;
  if (/^https?:\/\//.test(imagen)) return imagen;
  return `${origen}/${imagen.replace(/^\/+/, "")}`;
}

/** Cambia título, descripción, imagen y URL de la página por los del perfume. */
export function conVistaPrevia(html: string, f: FichaPublica, origen: string, ruta: string): string {
  const precios = (f.presentaciones ?? []).map((x) => Number(x.precio)).filter((n) => n > 0);
  const desde = precios.length ? Math.min(...precios) : null;
  const titulo = [f.nombre, f.marca].filter(Boolean).join(" · ");
  const desc = [
    f.tipo,
    (f.presentaciones ?? []).map((x) => `${x.ml} ml`).join(" / "),
    desde !== null ? `desde ${pesosMx(desde)}` : null,
    "100 % original · Coco & Cuero",
  ]
    .filter(Boolean)
    .join(" · ");
  const e = escaparHtml;
  const foto = fotoAbsoluta(origen, f.imagen_url);
  const metas = [
    `<meta property="og:title" content="${e(titulo)}">`,
    `<meta property="og:description" content="${e(desc)}">`,
    ...(foto ? [`<meta property="og:image" content="${e(foto)}">`] : []),
    `<meta property="og:url" content="${e(origen + ruta)}">`,
    `<meta property="og:type" content="product">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="${e(origen + ruta)}">`,
  ].join("\n");
  return html
    .replace(/<meta\s+property="og:(?:title|description|image|url|type)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${e(desc)}">`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${e(titulo)} · Coco &amp; Cuero</title>`)
    .replace(/<\/head>/i, `${metas}\n</head>`);
}

async function paginaDePerfume(peticion: Request, entorno: Entorno, ctx: Contexto, dep: Dependencias): Promise<Response> {
  const url = new URL(peticion.url);
  const tienda = () => entorno.ASSETS.fetch(new Request(`${url.origin}/`, { headers: peticion.headers }));
  const guardada = await desdeCache(peticion, dep);
  if (guardada) return guardada;

  // Para saber qué perfume es "lattafa-asad" hace falta la lista publicada
  // (los nombres repetidos se distinguen con el tipo, igual que en la tienda).
  let ficha: FichaPublica | undefined;
  let ruta = url.pathname;
  try {
    const r = await dep.pedir(
      `${SUPABASE_URL}/rest/v1/catalogo_publico?select=id,marca,nombre,tipo,imagen_url,presentaciones&order=id`,
      { headers: { apikey: SUPABASE_LLAVE_PUBLICABLE, Accept: "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    if (r.ok) {
      const lista = (await r.json()) as FichaPublica[];
      const nombres = nombresDeEnlace(lista);
      const id = perfumeDeRuta(url.pathname, nombres);
      ficha = lista.find((x) => x.id === id);
      if (ficha) ruta = rutaDePerfume(nombres.get(ficha.id)!);
    }
  } catch {
    // sin base: se sirve la tienda normal y el sitio abre el perfume solo
  }
  const base = await tienda();
  if (!ficha || !base.ok) return base;

  const html = conVistaPrevia(await base.text(), ficha, url.origin, ruta);
  const respuesta = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
  guardar(peticion, respuesta, ctx, dep);
  return respuesta;
}

async function desdeCache(peticion: Request, dep: Dependencias) {
  try {
    return (await dep.cache?.match(new Request(peticion.url))) ?? null;
  } catch {
    return null;
  }
}

function guardar(peticion: Request, respuesta: Response, ctx: Contexto, dep: Dependencias) {
  if (!dep.cache) return;
  ctx.waitUntil(dep.cache.put(new Request(peticion.url), respuesta.clone()).catch(() => {}));
}

async function catalogo(peticion: Request, ctx: Contexto, dep: Dependencias): Promise<Response> {
  const guardada = await desdeCache(peticion, dep);
  if (guardada) return guardada;
  try {
    const r = await dep.pedir(CATALOGO_UPSTREAM, {
      headers: { apikey: SUPABASE_LLAVE_PUBLICABLE, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return json({ error: `Supabase respondió ${r.status}` }, 502);
    const filas = await r.json();
    if (!Array.isArray(filas)) return json({ error: "Respuesta inesperada" }, 502);
    // 60 s en Cloudflare: si cambias un precio, tarda máximo un minuto en verse
    const respuesta = json(filas, 200, { "Cache-Control": "public, max-age=30, s-maxage=60" });
    guardar(peticion, respuesta, ctx, dep);
    return respuesta;
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Sin conexión con la base" }, 502);
  }
}

async function foto(peticion: Request, nombre: string, ctx: Contexto, dep: Dependencias): Promise<Response> {
  const guardada = await desdeCache(peticion, dep);
  if (guardada) return guardada;
  try {
    const r = await dep.pedir(FOTOS_UPSTREAM + encodeURIComponent(nombre), { signal: AbortSignal.timeout(10000) });
    const tipo = r.headers.get("Content-Type") ?? "";
    if (!r.ok || !tipo.startsWith("image/")) return new Response("Foto no encontrada", { status: 404 });
    // cada foto tiene nombre único: se puede guardar un año
    const respuesta = new Response(r.body, {
      status: 200,
      headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
    guardar(peticion, respuesta, ctx, dep);
    return respuesta;
  } catch {
    return new Response("Foto no disponible", { status: 502 });
  }
}
