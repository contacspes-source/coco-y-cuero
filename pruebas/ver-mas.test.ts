import { describe, expect, test } from "vitest";
import { POR_PAGINA, porPartes, textoVerMas } from "../sitio/negocio/catalogo";

const lista = Array.from({ length: 60 }, (_, i) => i + 1);

describe("catálogo por partes (Ver más)", () => {
  test("de entrada muestra POR_PAGINA y dice cuántos faltan", () => {
    const { visibles, faltan } = porPartes(lista, POR_PAGINA);
    expect(visibles).toEqual(lista.slice(0, POR_PAGINA));
    expect(faltan).toBe(60 - POR_PAGINA);
  });

  test("con un tope mayor que la lista muestra todo y no falta nada", () => {
    expect(porPartes(lista, 100)).toEqual({ visibles: lista, faltan: 0 });
  });

  test("lista vacía o tope inválido no truena", () => {
    expect(porPartes([], POR_PAGINA)).toEqual({ visibles: [], faltan: 0 });
    expect(porPartes(lista, -5)).toEqual({ visibles: [], faltan: 60 });
    expect(porPartes(lista, 2.9).visibles).toEqual([1, 2]);
  });

  test("el texto del botón cambia al final", () => {
    expect(textoVerMas(36)).toBe(`Ver ${POR_PAGINA} más`);
    expect(textoVerMas(POR_PAGINA)).toBe(`Ver los últimos ${POR_PAGINA}`);
    expect(textoVerMas(7)).toBe("Ver los últimos 7");
    expect(textoVerMas(1)).toBe("Ver el último perfume");
  });
});
