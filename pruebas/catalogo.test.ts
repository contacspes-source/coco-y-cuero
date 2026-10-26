import { describe, expect, test } from "vitest";
import {
  FILTROS_INICIALES,
  aEditable,
  cambiosDe,
  filtrarPerfumes,
  hayCambios,
  planearAjuste,
  resumir,
  semaforoDe,
  sinAcentos,
  slug,
} from "../panel/negocio/catalogo";
import { CATALOGOS, perfume } from "./fabrica";

describe("filtrarPerfumes", () => {
  const lista = [
    perfume({ id: 1, marca: "Lattafa", nombre: "Ámbar Real", generoId: 1, categoriaId: 1 }),
    perfume({ id: 2, marca: "Dior", nombre: "Sauvage", generoId: 1, categoriaId: 3, publicado: false }),
    perfume({ id: 3, marca: "Lattafa", nombre: "Yara", generoId: 2, categoriaId: 1, imagenUrl: null }),
    perfume({
      id: 4,
      marca: "Rasasi",
      nombre: "Hawas",
      presentaciones: [{ id: 40, ml: 100, precioVenta: 1000, costo: 900 }],
    }),
    perfume({
      id: 5,
      marca: "Armaf",
      nombre: "Club",
      presentaciones: [{ id: 50, ml: 100, precioVenta: 1000, costo: null }],
    }),
  ];
  const ids = (f: Partial<typeof FILTROS_INICIALES>) =>
    filtrarPerfumes(lista, { ...FILTROS_INICIALES, ...f }).map((p) => p.id);

  test("sin filtros devuelve todo", () => expect(ids({})).toEqual([1, 2, 3, 4, 5]));
  test("búsqueda ignora acentos y mayúsculas", () => expect(ids({ texto: "AMBAR" })).toEqual([1]));
  test("búsqueda por varias palabras en marca y nombre", () => expect(ids({ texto: "lattafa yara" })).toEqual([3]));
  test("por género", () => expect(ids({ generoId: 2 })).toEqual([3]));
  test("por categoría", () => expect(ids({ categoriaId: 3 })).toEqual([2]));
  test("solo publicados", () => expect(ids({ estado: "publicados" })).toEqual([1, 3, 4, 5]));
  test("solo de baja", () => expect(ids({ estado: "baja" })).toEqual([2]));
  test("margen bajo", () => expect(ids({ alerta: "margen-bajo" })).toEqual([4]));
  test("sin costo", () => expect(ids({ alerta: "sin-costo" })).toEqual([5]));
  test("sin foto", () => expect(ids({ alerta: "sin-foto" })).toEqual([3]));
  test("se combinan", () => expect(ids({ texto: "lattafa", generoId: 1 })).toEqual([1]));
});

describe("semaforoDe", () => {
  test("toma la peor presentación", () => {
    const p = perfume({
      presentaciones: [
        { id: 1, ml: 30, precioVenta: 1000, costo: 300 },
        { id: 2, ml: 100, precioVenta: 1000, costo: 900 },
      ],
    });
    expect(semaforoDe(p)).toBe("bajo");
  });
});

describe("resumir", () => {
  test("cuenta y promedia", () => {
    const r = resumir([
      perfume({ presentaciones: [{ id: 1, ml: 100, precioVenta: 1000, costo: 500 }] }), // 50 %
      perfume({ publicado: false, presentaciones: [{ id: 2, ml: 100, precioVenta: 1000, costo: 900 }] }), // 10 %
      perfume({ imagenUrl: null, presentaciones: [{ id: 3, ml: 100, precioVenta: 1000, costo: null }] }),
    ]);
    expect(r).toMatchObject({ total: 3, publicados: 2, deBaja: 1, conMargenBajo: 1, sinCosto: 1, sinFoto: 1 });
    expect(r.margenPromedio).toBeCloseTo(0.3);
  });

  test("catálogo vacío", () => {
    expect(resumir([]).margenPromedio).toBeNull();
  });
});

describe("planearAjuste", () => {
  const lista = [
    perfume({ id: 1, categoriaId: 1, presentaciones: [{ id: 10, ml: 100, precioVenta: 1000, costo: 500 }] }),
    perfume({ id: 2, categoriaId: 3, presentaciones: [{ id: 20, ml: 100, precioVenta: 1000, costo: 960 }] }),
    perfume({ id: 3, categoriaId: 1, publicado: false, presentaciones: [{ id: 30, ml: 100, precioVenta: 900, costo: null }] }),
  ];
  const todos = { categoriaId: null, generoId: null, soloPublicados: false };

  test("subir 10 % a todo", () => {
    const r = planearAjuste(lista, CATALOGOS, todos, { modo: "porcentaje", porcentaje: 10 });
    expect(r.map((x) => [x.presentacionId, x.despues, x.estado])).toEqual([
      [10, 1100, "cambia"],
      [20, 1100, "cambia"],
      [30, 990, "cambia"],
    ]);
  });

  test("bajar 10 % rechaza el que quedaría con pérdida y no lo manda", () => {
    const r = planearAjuste(lista, CATALOGOS, todos, { modo: "porcentaje", porcentaje: -10 });
    expect(r.find((x) => x.presentacionId === 20)).toMatchObject({ despues: 900, estado: "rechazado" });
    expect(cambiosDe(r).map((c) => c.presentacionId)).toEqual([10, 30]);
  });

  test("recalcular con la fórmula usa la categoría de cada perfume", () => {
    const r = planearAjuste(lista, CATALOGOS, todos, { modo: "formula" });
    expect(r.find((x) => x.presentacionId === 10)?.despues).toBe(1050); // 500 × 1.1 × 1.9
    expect(r.find((x) => x.presentacionId === 20)?.despues).toBe(1690); // 960 × 1.1 × 1.6 = 1689.6
  });

  test("la fórmula no puede calcular sin costo", () => {
    const r = planearAjuste(lista, CATALOGOS, todos, { modo: "formula" });
    expect(r.find((x) => x.presentacionId === 30)?.estado).toBe("rechazado");
  });

  test("respeta el alcance", () => {
    const r = planearAjuste(lista, CATALOGOS, { categoriaId: 1, generoId: null, soloPublicados: true }, {
      modo: "porcentaje",
      porcentaje: 5,
    });
    expect(r.map((x) => x.presentacionId)).toEqual([10]);
  });

  test("0 % no cambia nada", () => {
    const r = planearAjuste(lista, CATALOGOS, todos, { modo: "porcentaje", porcentaje: 0 });
    expect(cambiosDe(r)).toEqual([]);
  });
});

describe("formulario", () => {
  test("aEditable copia sin compartir referencias", () => {
    const p = perfume();
    const e = aEditable(p);
    e.presentaciones[0]!.precioVenta = 1;
    expect(p.presentaciones[0]!.precioVenta).toBe(1000);
  });

  test("hayCambios detecta una edición", () => {
    const e = aEditable(perfume());
    expect(hayCambios(e, structuredClone(e))).toBe(false);
    expect(hayCambios(e, { ...e, nombre: "Otro" })).toBe(true);
  });
});

describe("texto", () => {
  test("sinAcentos", () => expect(sinAcentos("Ámbar ÑANDÚ")).toBe("ambar nandu"));
  test("slug", () => expect(slug("Odyssey (Armaf)", "Mandarin Sky")).toBe("odyssey-armaf-mandarin-sky"));
  test("slug vacío", () => expect(slug("¡¡!!")).toBe("perfume"));
});
