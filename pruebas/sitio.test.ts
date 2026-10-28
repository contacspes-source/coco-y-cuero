import { describe, expect, test } from "vitest";
import type { PerfumePublico } from "../compartido/tipos";
import {
  SIN_FILTROS,
  claveDeFamilia,
  conteos,
  escribirFiltros,
  familiaPrincipal,
  familiasDe,
  filtrar,
  hayFiltros,
  leerFiltros,
  mensajeWhatsApp,
  precioDesde,
  textoNotas,
  type Filtros,
} from "../sitio/negocio/catalogo";
import { CatalogoNoDisponible, FuenteCatalogo, URL_EN_VIVO, URL_PROPIA, URL_RESPALDO, aPerfume } from "../sitio/datos/fuente-catalogo";

const nota = (n: string, familia: string | null) => ({ nota: n, familia });

function p(parcial: Partial<PerfumePublico> & { id: number }): PerfumePublico {
  return {
    marca: "Marca",
    nombre: `Perfume ${parcial.id}`,
    tipo: "EDP",
    genero: "caballero",
    categoria: "arabes",
    imagenUrl: null,
    descripcion: null,
    presentaciones: [{ id: null, ml: 100, precio: 1000 }],
    notas: [],
    ...parcial,
  };
}

const lista: PerfumePublico[] = [
  p({ id: 1, marca: "Lattafa", nombre: "Asad", genero: "caballero", categoria: "arabes", presentaciones: [{ id: null, ml: 100, precio: 870 }], notas: [nota("vainilla", "Dulce y gourmand"), nota("ámbar", "Ámbar y cuero"), nota("cacao", "Ámbar y cuero")] }),
  p({ id: 2, marca: "Lattafa", nombre: "Yara", genero: "dama", categoria: "arabes", presentaciones: [{ id: null, ml: 100, precio: 1200 }], notas: [nota("floral", "Floral"), nota("dulce", "Dulce y gourmand")] }),
  p({ id: 3, marca: "Carolina Herrera", nombre: "Good Girl", genero: "dama", categoria: "disenador", presentaciones: [{ id: null, ml: 80, precio: 2920 }] }),
  p({ id: 4, marca: "Versace", nombre: "Eros", genero: "caballero", categoria: "disenador", presentaciones: [{ id: null, ml: 50, precio: 1500 }, { id: null, ml: 100, precio: 2000 }], notas: [nota("madera", "Amaderado")] }),
  p({ id: 5, marca: "Rasasi", nombre: "Hawas Elixir", genero: "unisex", categoria: "arabes", presentaciones: [{ id: null, ml: 100, precio: 1790 }], notas: [nota("cítrico", "Fresco y cítrico")] }),
];

const ids = (f: Partial<Filtros>) => filtrar(lista, { ...SIN_FILTROS, ...f }).map((x) => x.id);

describe("jerarquía género → categoría", () => {
  test("sin filtros, todo en el orden de la base", () => expect(ids({})).toEqual([1, 2, 3, 4, 5]));
  test("solo dama", () => expect(ids({ genero: "dama" })).toEqual([2, 3]));
  test("dama y luego árabes", () => expect(ids({ genero: "dama", categoria: "arabes" })).toEqual([2]));
  test("categoría sin género", () => expect(ids({ categoria: "disenador" })).toEqual([3, 4]));
  test("combinación sin resultados", () => expect(ids({ genero: "unisex", categoria: "nicho" })).toEqual([]));
});

describe("aromas", () => {
  test("una familia", () => expect(ids({ aromas: ["dulce"] })).toEqual([1, 2]));
  test("varias familias suman (o), no restan", () => expect(ids({ aromas: ["floral", "fresco"] })).toEqual([2, 5]));
  test("con género", () => expect(ids({ genero: "caballero", aromas: ["dulce"] })).toEqual([1]));
  test("un perfume sin notas no aparece al filtrar por aroma", () => expect(ids({ aromas: ["amaderado"] })).toEqual([4]));
});

describe("búsqueda", () => {
  test("por marca", () => expect(ids({ texto: "lattafa" })).toEqual([1, 2]));
  test("por nota, sin acentos", () => expect(ids({ texto: "ambar" })).toEqual([1]));
  test("por familia", () => expect(ids({ texto: "gourmand" })).toEqual([1, 2]));
  test("varias palabras deben coincidir todas", () => expect(ids({ texto: "lattafa yara" })).toEqual([2]));
});

describe("orden", () => {
  test("precio menor a mayor usa el precio 'desde'", () => expect(ids({ orden: "precio-menor" })).toEqual([1, 2, 4, 5, 3]));
  test("precio mayor a menor (también con el precio 'desde')", () => expect(ids({ orden: "precio-mayor" })).toEqual([3, 5, 4, 2, 1]));
  test("por nombre (marca y perfume)", () => expect(ids({ orden: "nombre" })).toEqual([3, 1, 2, 5, 4]));
  test("ordenar no altera la lista original", () => {
    filtrar(lista, { ...SIN_FILTROS, orden: "precio-mayor" });
    expect(lista.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("conteos", () => {
  test("cada opción cuenta respetando los demás filtros", () => {
    const c = conteos(lista, { ...SIN_FILTROS, genero: "dama" });
    expect(c.generos).toEqual({ todos: 5, caballero: 2, dama: 2, unisex: 1 });
    expect(c.categorias).toEqual({ todas: 2, arabes: 1, nicho: 0, disenador: 1 });
    expect(c.aromas.floral).toBe(1);
    expect(c.aromas.amaderado).toBe(0);
  });
});

describe("filtros en la URL", () => {
  test("ida y vuelta", () => {
    const f: Filtros = { genero: "dama", categoria: "arabes", aromas: ["floral", "dulce"], texto: "yara", orden: "precio-menor" };
    expect(leerFiltros(escribirFiltros(f))).toEqual(f);
  });
  test("sin filtros no ensucia la URL", () => expect(escribirFiltros(SIN_FILTROS)).toBe(""));
  test("una URL de anuncio", () =>
    expect(leerFiltros("?genero=dama&categoria=arabes&utm_source=meta")).toMatchObject({ genero: "dama", categoria: "arabes" }));
  test("valores inventados se ignoran", () =>
    expect(leerFiltros("?genero=otro&categoria=x&aroma=floral,nada&orden=raro")).toEqual({
      ...SIN_FILTROS,
      aromas: ["floral"],
    }));
  test("hayFiltros ignora el orden", () => {
    expect(hayFiltros({ ...SIN_FILTROS, orden: "nombre" })).toBe(false);
    expect(hayFiltros({ ...SIN_FILTROS, texto: " asad " })).toBe(true);
  });
});

describe("datos de la tarjeta", () => {
  test("familia principal = la más repetida", () => expect(familiaPrincipal(lista[0]!)).toBe("cuero"));
  test("en empate gana la más intensa (orden de FAMILIAS)", () => expect(familiaPrincipal(lista[1]!)).toBe("dulce"));
  test("sin notas no hay familia", () => expect(familiaPrincipal(lista[2]!)).toBeNull());
  test("familias sin repetir", () => expect(familiasDe(lista[0]!)).toEqual(["dulce", "cuero"]));
  test("una familia nueva en la base recibe clave propia", () => expect(claveDeFamilia("Especiado y cálido")).toBe("especiado-y-calido"));
  test("precio desde", () => expect(precioDesde(lista[3]!)).toBe(1500));
  test("sin presentaciones no hay precio", () => expect(precioDesde(p({ id: 9, presentaciones: [] }))).toBeNull());
  test("notas con mayúscula inicial", () => expect(textoNotas(lista[0]!)).toBe("Vainilla, ámbar, cacao"));
  test("mensaje de WhatsApp con tamaños", () =>
    expect(mensajeWhatsApp(lista[3]!)).toBe("Hola, me interesa Eros de Versace (50 ml o 100 ml). ¿Lo tienen disponible?"));
});

// ------------------------------------------------------------------
// Capa de datos con una red falsa
// ------------------------------------------------------------------
const fila = { id: 1, marca: "Lattafa", nombre: "Asad", tipo: "EDP", genero: "caballero", categoria: "arabes", imagen_url: "assets/img/x.jpg", presentaciones: [{ ml: 100, precio: "870" }], notas: [] };
const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

describe("FuenteCatalogo", () => {
  test("primero lo pide a nuestro propio dominio", async () => {
    const pedidas: string[] = [];
    const f = new FuenteCatalogo(async (url) => (pedidas.push(url), respuesta([fila])));
    const r = await f.cargar();
    expect(r.origen).toBe("en-vivo");
    expect(r.perfumes[0]?.presentaciones[0]?.precio).toBe(870); // el numeric llega como texto
    expect(pedidas).toEqual([URL_PROPIA]);
  });

  test("si la red bloquea nuestro dominio /api, va directo a Supabase", async () => {
    const pedidas: string[] = [];
    const f = new FuenteCatalogo(async (url) => {
      pedidas.push(url);
      if (url === URL_PROPIA) throw new TypeError("Load failed");
      return respuesta([fila]);
    });
    expect((await f.cargar()).origen).toBe("en-vivo");
    expect(pedidas).toEqual([URL_PROPIA, URL_EN_VIVO]);
  });

  test("si bloquean supabase.co, el catálogo llega por nuestro dominio", async () => {
    const f = new FuenteCatalogo(async (url) => {
      if (url.includes("supabase.co")) throw new TypeError("Load failed");
      return url === URL_PROPIA ? respuesta([fila]) : respuesta({}, 404);
    });
    expect((await f.cargar()).origen).toBe("en-vivo");
  });

  test("una página HTML en lugar del catálogo no cuenta", async () => {
    const f = new FuenteCatalogo(async (url) =>
      url === URL_RESPALDO ? respuesta([fila]) : new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    expect((await f.cargar()).origen).toBe("respaldo");
  });

  test("un catálogo vacío en vivo se considera falla", async () => {
    const f = new FuenteCatalogo(async (url) => (url === URL_RESPALDO ? respuesta([fila]) : respuesta([])));
    expect((await f.cargar()).origen).toBe("respaldo");
  });

  test("si la base falla, usa el respaldo", async () => {
    const f = new FuenteCatalogo(async (url) => (url === URL_RESPALDO ? respuesta([fila]) : respuesta({ message: "caído" }, 503)));
    expect((await f.cargar()).origen).toBe("respaldo");
  });

  test("si la red no existe, también usa el respaldo", async () => {
    const f = new FuenteCatalogo(async (url) => {
      if (url === URL_RESPALDO) return respuesta([fila]);
      throw new TypeError("Failed to fetch");
    });
    expect((await f.cargar()).origen).toBe("respaldo");
  });

  test("si fallan todos, avisa con un error claro y dice qué falló", async () => {
    const f = new FuenteCatalogo(async () => respuesta({}, 500));
    const e = await f.cargar().catch((x) => x);
    expect(e).toBeInstanceOf(CatalogoNoDisponible);
    expect(e.detalles).toHaveLength(3);
    expect(e.detalles[0]).toBe("/api/catalogo: HTTP 500");
  });

  test("descarta renglones rotos y precios en cero", () => {
    expect(aPerfume({ ...fila, nombre: "" })).toBeNull();
    expect(aPerfume({ ...fila, presentaciones: [{ ml: 100, precio: 0 }] })?.presentaciones).toEqual([]);
    expect(aPerfume({ ...fila, notas: null })?.notas).toEqual([]);
  });
});
