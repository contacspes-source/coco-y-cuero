import { describe, expect, test } from "vitest";
import { CATALOGO_UPSTREAM, conVistaPrevia, escaparHtml, fotoAbsoluta, manejar, type Dependencias, type Entorno } from "../worker/manejador";
import { nombresDeEnlace, perfumeDeRuta, rutaDePerfume } from "../compartido/texto";

const assets: Entorno = { ASSETS: { fetch: async (r: Request) => new Response(`archivo ${new URL(r.url).pathname}`) } };
const ctx = { esperas: [] as Promise<unknown>[], waitUntil(p: Promise<unknown>) { this.esperas.push(p); } };

function cacheFalsa() {
  const m = new Map<string, Response>();
  return {
    m,
    async match(r: Request) { return m.get(r.url)?.clone(); },
    async put(r: Request, res: Response) { m.set(r.url, res); },
  };
}

function dep(pedir: Dependencias["pedir"], cache = cacheFalsa()): Dependencias & { cache: ReturnType<typeof cacheFalsa> } {
  return { pedir, cache };
}

const pedir = (ruta: string, init?: RequestInit) => new Request(`https://cocoycuero.com${ruta}`, init);

describe("worker: catálogo por nuestro dominio", () => {
  test("lee la vista pública con la llave publicable y la guarda en caché", async () => {
    const llamadas: [string, RequestInit | undefined][] = [];
    const d = dep(async (u, i) => (llamadas.push([u, i]), new Response(JSON.stringify([{ id: 1 }]), { status: 200 })));
    const r = await manejar(pedir("/api/catalogo"), assets, ctx, d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ id: 1 }]);
    expect(r.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(llamadas[0]![0]).toBe(CATALOGO_UPSTREAM);
    expect((llamadas[0]![1]!.headers as Record<string, string>).apikey).toMatch(/^sb_publishable_/);
    await Promise.all(ctx.esperas);
    // la segunda vez sale de la caché, sin ir a Supabase
    const r2 = await manejar(pedir("/api/catalogo"), assets, ctx, d);
    expect(await r2.json()).toEqual([{ id: 1 }]);
    expect(llamadas).toHaveLength(1);
  });

  test("si Supabase falla, responde 502 para que el sitio use su respaldo", async () => {
    const r = await manejar(pedir("/api/catalogo"), assets, ctx, dep(async () => new Response("caído", { status: 503 })));
    expect(r.status).toBe(502);
    const r2 = await manejar(pedir("/api/catalogo"), assets, ctx, dep(async () => { throw new TypeError("fetch failed"); }));
    expect(r2.status).toBe(502);
  });

  test("no acepta escrituras", async () => {
    const r = await manejar(pedir("/api/catalogo", { method: "POST", body: "{}" }), assets, ctx, dep(async () => new Response("[]")));
    expect(r.status).toBe(405);
  });
});

describe("worker: fotos por nuestro dominio", () => {
  const imagen = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/webp" } });

  test("trae la foto del bucket público y la guarda un año", async () => {
    const urls: string[] = [];
    const r = await manejar(pedir("/fotos/lattafa-asad-mvpg0ib8.webp"), assets, ctx, dep(async (u) => (urls.push(u), imagen())));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/webp");
    expect(r.headers.get("Cache-Control")).toContain("immutable");
    expect(urls[0]).toMatch(/\/storage\/v1\/object\/public\/perfumes\/lattafa-asad-mvpg0ib8\.webp$/);
  });

  test.each(["/fotos/../secreto.webp", "/fotos/%2e%2e%2fsecreto.webp", "/fotos/carpeta/x.webp", "/fotos/script.js", "/fotos/"])(
    "rechaza %s",
    async (ruta) => {
      const urls: string[] = [];
      const r = await manejar(pedir(ruta), assets, ctx, dep(async (u) => (urls.push(u), imagen())));
      // nunca va a Supabase; "/fotos/../x" el navegador ya lo vuelve "/x" (archivo normal)
      expect(urls).toEqual([]);
      if (r.status === 200) expect(await r.text()).toMatch(/^archivo /);
      else expect(r.status).toBe(400);
    },
  );

  test("si lo que llega no es imagen, 404", async () => {
    const r = await manejar(pedir("/fotos/x.webp"), assets, ctx, dep(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })));
    expect(r.status).toBe(404);
  });
});

describe("worker: todo lo demás", () => {
  test("se sirve tal cual desde dist/", async () => {
    const r = await manejar(pedir("/terminos.html"), assets, ctx, dep(async () => { throw new Error("no debería pedir nada"); }));
    expect(await r.text()).toBe("archivo /terminos.html");
  });
});

describe("fotos del sitio por nuestro dominio", async () => {
  const { urlDeFoto, urlDirectaDeFoto, usarFotosPorNuestroDominio } = await import("../compartido/texto");
  const supa = "https://hsdthxlymeldxcoolmar.supabase.co/storage/v1/object/public/perfumes/lattafa-asad-mvpg0ib8.webp";

  test("en el sitio, las fotos de Supabase pasan por /fotos/", () => {
    usarFotosPorNuestroDominio(true);
    expect(urlDeFoto(supa)).toBe("/fotos/lattafa-asad-mvpg0ib8.webp");
    expect(urlDeFoto("assets/img/lattafa-yara.jpg")).toBe("/assets/img/lattafa-yara.jpg");
    expect(urlDeFoto("https://otro.com/x.jpg")).toBe("https://otro.com/x.jpg");
    usarFotosPorNuestroDominio(false);
  });
  test("en el panel (o sin activar) se quedan directas", () => expect(urlDeFoto(supa)).toBe(supa));
  test("si /fotos/ falla, hay camino de regreso a Supabase", () =>
    expect(urlDirectaDeFoto("https://cocoycuero.com/fotos/lattafa-asad-mvpg0ib8.webp", "https://hsdthxlymeldxcoolmar.supabase.co")).toBe(supa));
});

describe("worker: /p/<id> con vista previa del perfume", () => {
  const html = `<!doctype html><html><head><title>Coco &amp; Cuero</title>
<meta name="description" content="general">
<meta property="og:title" content="Coco & Cuero · Perfumería">
<meta property="og:description" content="general">
<meta property="og:type" content="website">
</head><body>tienda</body></html>`;
  const tienda: Entorno = { ASSETS: { fetch: async () => new Response(html, { headers: { "Content-Type": "text/html" } }) } };
  const fila = {
    id: 12,
    marca: "Lattafa",
    nombre: "Asad",
    tipo: "EDP",
    imagen_url: "https://hsdthxlymeldxcoolmar.supabase.co/storage/v1/object/public/perfumes/lattafa-asad.webp",
    presentaciones: [{ ml: 100, precio: "870" }, { ml: 50, precio: 600 }],
  };

  test("el enlace lleva el nombre; los repetidos se distinguen por tipo", () => {
    const n = nombresDeEnlace([
      { id: 30, marca: "Carolina Herrera", nombre: "Bad Boy", tipo: "EDP" },
      { id: 12, marca: "Lattafa", nombre: "Asad", tipo: "EDP" },
      { id: 31, marca: "Carolina Herrera", nombre: "Bad Boy", tipo: "EDT" },
      { id: 40, marca: "Afnan", nombre: "9pm", tipo: "EDP" },
      { id: 41, marca: "Afnan", nombre: "9pm", tipo: "EDP" },
    ]);
    expect(n.get(12)).toBe("lattafa-asad");
    expect(n.get(30)).toBe("carolina-herrera-bad-boy-edp");
    expect(n.get(31)).toBe("carolina-herrera-bad-boy-edt");
    // mismo nombre y mismo tipo: el número los separa
    expect(n.get(40)).toBe("afnan-9pm-edp-40");
    expect(n.get(41)).toBe("afnan-9pm-edp-41");
    expect(rutaDePerfume(n.get(12)!)).toBe("/p/lattafa-asad");
  });

  test("de la ruta al perfume, incluidos los enlaces viejos", () => {
    const n = new Map([[12, "lattafa-asad"], [7, "afnan-9pm"]]);
    expect(perfumeDeRuta("/p/lattafa-asad", n)).toBe(12);
    expect(perfumeDeRuta("/p/12-lattafa-asad", n)).toBe(12);
    expect(perfumeDeRuta("/p/12", n)).toBe(12);
    expect(perfumeDeRuta("/p/no-existe", n)).toBeNull();
    expect(perfumeDeRuta("/p/999", n)).toBeNull();
    expect(perfumeDeRuta("/p/../panel", n)).toBeNull();
  });

  test("arma título, descripción con precio desde y la foto por nuestro dominio", async () => {
    const urls: string[] = [];
    const r = await manejar(pedir("/p/lattafa-asad"), tienda, ctx, dep(async (u) => (urls.push(u), new Response(JSON.stringify([fila])))));
    expect(r.status).toBe(200);
    expect(urls[0]).toContain("catalogo_publico?");
    const t = await r.text();
    expect(t).toContain('<meta property="og:title" content="Asad · Lattafa">');
    expect(t).toContain("desde $600");
    expect(t).toContain('content="https://cocoycuero.com/fotos/lattafa-asad.webp"');
    expect(t).toContain('<meta property="og:url" content="https://cocoycuero.com/p/lattafa-asad">');
    expect(t).toContain("<title>Asad · Lattafa · Coco &amp; Cuero</title>");
    // sin los og genéricos de la tienda
    expect(t).not.toContain("Perfumería");
    expect(t.match(/og:title/g)).toHaveLength(1);
  });

  test("un nombre con HTML no se cuela en la página", () => {
    const t = conVistaPrevia(html, { ...fila, nombre: '"><script>alert(1)</script>' }, "https://x.com", "/p/12");
    expect(t).not.toContain("<script>alert");
    expect(t).toContain("&quot;&gt;&lt;script&gt;");
    expect(escaparHtml(`<a href='x'>&`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;");
  });

  test("un enlace viejo (/p/12-…) da la vista previa con la dirección nueva", async () => {
    const r = await manejar(pedir("/p/12-lattafa-asad"), tienda, ctx, dep(async () => new Response(JSON.stringify([fila]))));
    expect(await r.text()).toContain('<link rel="canonical" href="https://cocoycuero.com/p/lattafa-asad">');
  });

  test("si el perfume no existe o la base falla, sirve la tienda normal", async () => {
    const vacio = await manejar(pedir("/p/999"), tienda, ctx, dep(async () => new Response("[]")));
    expect(await vacio.text()).toContain("og:type\" content=\"website");
    const caida = await manejar(pedir("/p/999"), tienda, ctx, dep(async () => { throw new TypeError("fetch failed"); }));
    expect(caida.status).toBe(200);
  });

  test("una ruta que no es de perfume regresa al inicio", async () => {
    const r = await manejar(pedir("/p/Hola_Mundo!"), tienda, ctx, dep(async () => new Response("[]")));
    expect([301, 302]).toContain(r.status);
  });

  test("fotos relativas y sin foto", () => {
    expect(fotoAbsoluta("https://x.com", "assets/img/a.jpg")).toBe("https://x.com/assets/img/a.jpg");
    expect(fotoAbsoluta("https://x.com", null)).toBeNull();
  });
});

