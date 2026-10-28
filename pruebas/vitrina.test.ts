import { describe, expect, test } from "vitest";
import type { PerfumePublico } from "../compartido/tipos";
import {
  SIN_FILTROS,
  filtrosActivos,
  muestras,
  quitarFiltro,
  semillaDelDia,
  sugerenciasDeBusqueda,
  vitrina,
  iniciarRotacion,
  siguienteCambio,
} from "../sitio/negocio/catalogo";

const nota = (n: string, familia: string | null) => ({ nota: n, familia });
function p(x: Partial<PerfumePublico> & { id: number }): PerfumePublico {
  return {
    marca: "Lattafa",
    nombre: `Perfume ${x.id}`,
    tipo: "EDP",
    genero: "caballero",
    categoria: "arabes",
    imagenUrl: `assets/img/p${x.id}.jpg`,
    descripcion: null,
    presentaciones: [{ id: x.id, ml: 100, precio: 1000 }],
    notas: [],
    ...x,
  };
}

const catalogo = [
  ...Array.from({ length: 10 }, (_, i) => p({ id: i + 1, marca: "Lattafa" })),
  p({ id: 11, marca: "Versace", categoria: "disenador" }),
  p({ id: 12, marca: "Carolina Herrera", categoria: "disenador", genero: "dama" }),
  p({ id: 13, marca: "Rasasi", genero: "unisex" }),
  p({ id: 14, marca: "Armaf", imagenUrl: null }),
];

describe("vitrina", () => {
  test("solo perfumes con foto", () => {
    expect(vitrina(catalogo, 20, 1).some((x) => x.imagenUrl === null)).toBe(false);
  });
  test("mezcla tipos y marcas antes de repetir", () => {
    const v = vitrina(catalogo, 4, 7);
    expect(new Set(v.map((x) => x.marca)).size).toBe(4);
  });
  test("no repite perfumes", () => {
    const v = vitrina(catalogo, 13, 3);
    expect(new Set(v.map((x) => x.id)).size).toBe(v.length);
    expect(v.length).toBe(13);
  });
  test("el mismo día sale lo mismo; otro día cambia", () => {
    const hoy = semillaDelDia(new Date(2026, 9, 27));
    expect(vitrina(catalogo, 7, hoy).map((x) => x.id)).toEqual(vitrina(catalogo, 7, hoy).map((x) => x.id));
    const otros = [1, 2, 3, 4, 5].map((d) => vitrina(catalogo, 7, semillaDelDia(new Date(2026, 9, 27 + d))).map((x) => x.id).join());
    expect(new Set(otros).size).toBeGreaterThan(1);
  });
  test("semilla distinta cada día del año", () => {
    expect(semillaDelDia(new Date(2026, 0, 1))).not.toBe(semillaDelDia(new Date(2026, 0, 2)));
    expect(semillaDelDia(new Date(2026, 0, 1))).not.toBe(semillaDelDia(new Date(2027, 0, 1)));
  });
  test("catálogo sin fotos: vitrina vacía", () => expect(vitrina([p({ id: 1, imagenUrl: null })], 7, 1)).toEqual([]));
  test("muestras por criterio", () => {
    const m = muestras(catalogo, (x) => x.genero === "dama", 3, 5);
    expect(m.map((x) => x.id)).toEqual([12]);
  });
});

describe("sugerencias del buscador", () => {
  test("las notas más comunes y la marca con más perfumes", () => {
    const lista = [
      p({ id: 1, notas: [nota("Vainilla", "Dulce"), nota("ámbar", "Ámbar y cuero")] }),
      p({ id: 2, notas: [nota("vainilla", "Dulce"), nota("cítrico", "Fresco")] }),
      p({ id: 3, marca: "Versace", notas: [nota("vainilla", "Dulce"), nota("ámbar", "Ámbar y cuero")] }),
    ];
    expect(sugerenciasDeBusqueda(lista, 4)).toEqual(["vainilla", "ámbar", "cítrico", "Lattafa"]);
  });
  test("sin notas, al menos la marca", () => expect(sugerenciasDeBusqueda([p({ id: 1 })], 4)).toEqual(["Lattafa"]));
});

describe("filtros activos", () => {
  const f = { ...SIN_FILTROS, genero: "dama", categoria: "arabes" as const, aromas: ["dulce", "floral"], texto: " vainilla " };
  test("uno por filtro, con su nombre", () =>
    expect(filtrosActivos(f).map((x) => x.etiqueta)).toEqual(["Dama", "Árabes", "Dulce", "Floral", "“vainilla”"]));
  test("quitar uno deja los demás", () => {
    const chips = filtrosActivos(f);
    expect(quitarFiltro(f, chips[2]!).aromas).toEqual(["floral"]);
    expect(quitarFiltro(f, chips[0]!).genero).toBeNull();
    expect(quitarFiltro(f, chips[4]!).texto).toBe("");
    expect(quitarFiltro(f, chips[1]!)).toMatchObject({ categoria: null, genero: "dama" });
  });
  test("sin filtros no hay chips", () => expect(filtrosActivos(SIN_FILTROS)).toEqual([]));
});

describe("vitrina que rota", () => {
  const muchos = Array.from({ length: 12 }, (_, i) => p({ id: i + 1, marca: `M${i % 5}` }));

  test("arranca con 7 y el resto en fila, sin repetir", () => {
    const r = iniciarRotacion(muchos, 7, 3);
    expect(r.mostrados).toHaveLength(7);
    expect(r.cola).toHaveLength(5);
    expect(new Set([...r.mostrados, ...r.cola]).size).toBe(12);
  });

  test("nunca muestra el mismo perfume dos veces a la vez", () => {
    let r = iniciarRotacion(muchos, 7, 3);
    for (let i = 0; i < 40; i++) {
      const c = siguienteCambio(r)!;
      r = c.rotacion;
      expect(new Set(r.mostrados).size).toBe(7);
      expect(r.mostrados[c.lugar]).toBe(c.entra);
    }
  });

  test("todos pasan por la vitrina antes de repetir", () => {
    let r = iniciarRotacion(muchos, 7, 3);
    const vistos = new Set(r.mostrados);
    for (let i = 0; i < 5; i++) {
      const c = siguienteCambio(r)!;
      vistos.add(c.entra);
      r = c.rotacion;
    }
    expect(vistos.size).toBe(12);
  });

  test("cambia lugares salteados, no en fila", () => {
    let r = iniciarRotacion(muchos, 7, 3);
    const lugares: number[] = [];
    for (let i = 0; i < 7; i++) {
      const c = siguienteCambio(r)!;
      lugares.push(c.lugar);
      r = c.rotacion;
    }
    expect(lugares).toEqual([2, 5, 0, 4, 1, 6, 3]);
  });

  test("con pocos perfumes no rota", () => {
    expect(siguienteCambio(iniciarRotacion(muchos.slice(0, 5), 7, 3))).toBeNull();
  });
});
