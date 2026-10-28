import { describe, expect, test } from "vitest";
import { CATALOGO_UPSTREAM, manejar, type Dependencias, type Entorno } from "../worker/manejador";

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
