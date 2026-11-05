import { describe, expect, test } from "vitest";
import type { PerfumePublico } from "../compartido/tipos";
import {
  SIN_FILTROS,
  claveDeMarca,
  claveDeTipo,
  conteos,
  cuantosExtra,
  enRango,
  esEstuche,
  escribirFiltros,
  filtrar,
  filtrosActivos,
  hayFiltros,
  leerFiltros,
  marcasDe,
  quitarFiltro,
  type Filtros,
} from "../sitio/negocio/catalogo";

function p(parcial: Partial<PerfumePublico> & { id: number }): PerfumePublico {
  return {
    marca: "Marca",
    nombre: `Perfume ${parcial.id}`,
    tipo: "EDP",
    genero: "caballero",
    categoria: "disenador",
    imagenUrl: null,
    descripcion: null,
    presentaciones: [{ id: null, ml: 100, precio: 1000 }],
    notas: [],
    ...parcial,
  };
}

const precio = (n: number) => [{ id: null, ml: 100, precio: n }];

const lista: PerfumePublico[] = [
  p({ id: 1, marca: "Paco Rabanne", nombre: "Invictus Estuche 3 piezas", tipo: "EDT", presentaciones: precio(2499) }),
  p({ id: 2, marca: "Paco Rabanne", nombre: "Lady Million", tipo: "EDP", genero: "dama", presentaciones: precio(2449) }),
  p({ id: 3, marca: "Rasasi", nombre: "Hawas Fire", tipo: "EDP", genero: "unisex", categoria: "arabes", presentaciones: precio(1499) }),
  p({ id: 4, marca: "Odyssey (Armaf)", nombre: "Spectra Rainbow Edition", tipo: "EDP", genero: "unisex", categoria: "arabes", presentaciones: precio(749) }),
  p({ id: 5, marca: "Christian Dior", nombre: "Sauvage Parfum", tipo: "Parfum", presentaciones: precio(5449) }),
  p({ id: 6, marca: "Khadlaj", nombre: "Island", tipo: "Extrait", genero: "unisex", categoria: "arabes", presentaciones: precio(1249) }),
  p({ id: 7, marca: "Versace", nombre: "Eros", tipo: "EDP", presentaciones: [{ id: null, ml: 100, precio: 1999 }, { id: null, ml: 200, precio: 2699 }] }),
];

const ids = (f: Partial<Filtros>) => filtrar(lista, { ...SIN_FILTROS, ...f }).map((x) => x.id);

describe("datos derivados", () => {
  test("estuche se deduce del nombre, sin importar mayúsculas ni acentos", () => {
    expect(esEstuche(lista[0]!)).toBe(true);
    expect(esEstuche(p({ id: 9, nombre: "Bad Boy ESTUCHE Navidad" }))).toBe(true);
    expect(esEstuche(lista[1]!)).toBe(false);
    // "Estucheado" o palabras parecidas no cuentan
    expect(esEstuche(p({ id: 10, nombre: "Estucheado" }))).toBe(false);
  });
  test("clave de marca y de concentración", () => {
    expect(claveDeMarca("Odyssey (Armaf)")).toBe("odyssey-armaf");
    expect(claveDeMarca("Dolce & Gabbana")).toBe("dolce-gabbana");
    expect(claveDeTipo("Parfum")).toBe("parfum");
    expect(claveDeTipo("Extrait")).toBe("extrait");
  });
  test("rango de precio: el límite de arriba no se incluye", () => {
    expect(enRango(p({ id: 1, presentaciones: precio(999) }), "hasta-1000")).toBe(true);
    expect(enRango(p({ id: 1, presentaciones: precio(1000) }), "hasta-1000")).toBe(false);
    expect(enRango(p({ id: 1, presentaciones: precio(1000) }), "1000-2000")).toBe(true);
    expect(enRango(p({ id: 1, presentaciones: precio(9999) }), "3000-mas")).toBe(true);
    expect(enRango(lista[0]!, "rango-inventado")).toBe(true);
  });
  test("un perfume con varias presentaciones entra si cualquiera cae en el rango", () => {
    expect(ids({ precio: "1000-2000" })).toContain(7);
    expect(ids({ precio: "2000-3000" })).toContain(7);
  });
  test("marcas de la A a la Z y sin repetir", () =>
    expect(marcasDe(lista).map((m) => m.nombre)).toEqual([
      "Christian Dior",
      "Khadlaj",
      "Odyssey (Armaf)",
      "Paco Rabanne",
      "Rasasi",
      "Versace",
    ]));
});

describe("filtrar con más filtros", () => {
  test("solo estuches y solo frascos", () => {
    expect(ids({ presentacion: "estuches" })).toEqual([1]);
    expect(ids({ presentacion: "frascos" })).not.toContain(1);
    expect(ids({ presentacion: "frascos" })).toHaveLength(6);
  });
  test("rango de precio", () => {
    expect(ids({ precio: "hasta-1000" })).toEqual([4]);
    expect(ids({ precio: "3000-mas" })).toEqual([5]);
  });
  test("concentraciones se combinan con 'o'", () => {
    expect(ids({ tipos: ["parfum"] })).toEqual([5]);
    expect(ids({ tipos: ["parfum", "extrait"] })).toEqual([5, 6]);
  });
  test("marca", () => expect(ids({ marca: "paco-rabanne" })).toEqual([1, 2]));
  test("se combinan entre sí y con género", () => {
    expect(ids({ marca: "paco-rabanne", genero: "dama" })).toEqual([2]);
    expect(ids({ categoria: "arabes", tipos: ["edp"], precio: "1000-2000" })).toEqual([3]);
  });
});

describe("conteos de más filtros", () => {
  test("cada grupo cuenta ignorándose a sí mismo pero respetando los demás", () => {
    const c = conteos(lista, { ...SIN_FILTROS, presentacion: "estuches", marca: "paco-rabanne" });
    // la presentación se cuenta sin su propio filtro, con la marca puesta
    expect(c.presentaciones).toEqual({ estuches: 1, frascos: 1 });
    // la marca se cuenta con el filtro de estuches puesto
    expect(c.marcas["paco-rabanne"]).toBe(1);
    expect(c.marcas["rasasi"]).toBe(0);
  });
  test("precios y concentraciones", () => {
    const c = conteos(lista, SIN_FILTROS);
    expect(c.precios).toEqual({ "hasta-1000": 1, "1000-2000": 3, "2000-3000": 3, "3000-mas": 1 });
    expect(c.tipos).toMatchObject({ edt: 1, edp: 4, parfum: 1, extrait: 1, colonia: 0 });
  });
});

describe("URL, chips y estado", () => {
  test("URL corta para un anuncio de estuches de regalo", () =>
    expect(escribirFiltros({ ...SIN_FILTROS, presentacion: "estuches", genero: "caballero" })).toBe(
      "?genero=caballero&presentacion=estuches",
    ));
  test("valores inventados se ignoran", () =>
    expect(leerFiltros("?presentacion=cajas&precio=gratis&tipo=edp,perfumito,edp&marca=../../x")).toEqual({
      ...SIN_FILTROS,
      tipos: ["edp"],
    }));
  test("ida y vuelta", () => {
    const f: Filtros = { ...SIN_FILTROS, presentacion: "frascos", precio: "3000-mas", tipos: ["edt"], marca: "versace" };
    expect(leerFiltros(escribirFiltros(f))).toEqual(f);
  });
  test("los extras cuentan como filtros", () => {
    expect(hayFiltros({ ...SIN_FILTROS, marca: "versace" })).toBe(true);
    expect(cuantosExtra({ ...SIN_FILTROS, tipos: ["edp", "edt"], precio: "hasta-1000" })).toBe(3);
    expect(cuantosExtra(SIN_FILTROS)).toBe(0);
  });
  test("chips con nombre bonito de la marca, y se quitan uno por uno", () => {
    const f: Filtros = { ...SIN_FILTROS, presentacion: "estuches", precio: "hasta-1000", tipos: ["edp", "parfum"], marca: "odyssey-armaf" };
    const chips = filtrosActivos(f, marcasDe(lista));
    expect(chips.map((c) => c.etiqueta)).toEqual(["Estuches", "Hasta $999", "EDP", "Parfum", "Odyssey (Armaf)"]);
    expect(quitarFiltro(f, chips[0]!).presentacion).toBeNull();
    expect(quitarFiltro(f, chips[1]!).precio).toBeNull();
    expect(quitarFiltro(f, chips[2]!).tipos).toEqual(["parfum"]);
    expect(quitarFiltro(f, chips[4]!).marca).toBeNull();
  });
  test("sin lista de marcas, el chip muestra la clave", () =>
    expect(filtrosActivos({ ...SIN_FILTROS, marca: "rasasi" }).map((c) => c.etiqueta)).toEqual(["rasasi"]));
});
