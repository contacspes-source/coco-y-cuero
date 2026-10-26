import { describe, expect, test } from "vitest";
import type { PerfumeEditable } from "../compartido/tipos";
import { normalizar, validarPerfume } from "../panel/negocio/validacion";

const valido = (): PerfumeEditable => ({
  marca: "Marca Uno",
  nombre: "Perfume Uno",
  tipo: "EDP",
  generoId: 1,
  categoriaId: 1,
  imagenUrl: null,
  publicado: true,
  notas: [],
  presentaciones: [{ ml: 100, precioVenta: 1000, costo: 500 }],
});

const campos = (p: PerfumeEditable) => validarPerfume(p).map((x) => x.campo);

describe("validarPerfume", () => {
  test("un perfume completo no tiene problemas", () => {
    expect(validarPerfume(valido())).toEqual([]);
  });

  test("sin costo también es válido (se registra después)", () => {
    const p = valido();
    p.presentaciones[0]!.costo = null;
    expect(validarPerfume(p)).toEqual([]);
  });

  test("marca y nombre obligatorios, aunque sean solo espacios", () => {
    expect(campos({ ...valido(), marca: "   ", nombre: "a" })).toEqual(["marca", "nombre"]);
  });

  test("tipo fuera de la lista", () => {
    expect(campos({ ...valido(), tipo: "Agua" as never })).toEqual(["tipo"]);
  });

  test("género y categoría deben elegirse", () => {
    expect(campos({ ...valido(), generoId: 0, categoriaId: 0 })).toEqual(["genero", "categoria"]);
  });

  test("al menos una presentación", () => {
    expect(campos({ ...valido(), presentaciones: [] })).toEqual(["presentaciones"]);
  });

  test("precio debajo del costo se marca en el precio", () => {
    const p = valido();
    p.presentaciones[0] = { ml: 100, precioVenta: 400, costo: 500 };
    const [problema] = validarPerfume(p);
    expect(problema?.campo).toBe("presentacion.0.precio");
    expect(problema?.mensaje).toContain("pérdida");
  });

  test("precio igual al costo se permite (la base también lo permite)", () => {
    const p = valido();
    p.presentaciones[0] = { ml: 100, precioVenta: 500, costo: 500 };
    expect(validarPerfume(p)).toEqual([]);
  });

  test("ml repetidos señalan la segunda presentación", () => {
    const p = valido();
    p.presentaciones.push({ ml: 100, precioVenta: 1200, costo: null });
    expect(campos(p)).toEqual(["presentacion.1.ml"]);
  });

  test.each([0, -5, 2.5, 5000, Number.NaN])("ml inválidos (%d)", (ml) => {
    const p = valido();
    p.presentaciones[0]!.ml = ml;
    expect(campos(p)).toEqual(["presentacion.0.ml"]);
  });

  test.each([0, -1, Number.NaN, 300_000])("precios inválidos (%d)", (precio) => {
    const p = valido();
    p.presentaciones[0] = { ml: 100, precioVenta: precio, costo: null };
    expect(campos(p)).toEqual(["presentacion.0.precio"]);
  });

  test("costo cero o negativo", () => {
    const p = valido();
    p.presentaciones[0]!.costo = 0;
    expect(campos(p)).toEqual(["presentacion.0.costo"]);
  });
});

describe("normalizar", () => {
  test("limpia espacios, ordena presentaciones y quita notas repetidas", () => {
    const p = normalizar({
      ...valido(),
      marca: "  Lattafa   Perfumes ",
      nombre: " Asad\tBourbon ",
      imagenUrl: "   ",
      notas: [5, 2, 5],
      presentaciones: [
        { ml: 100, precioVenta: 1000, costo: null },
        { ml: 30, precioVenta: 500, costo: null },
      ],
    });
    expect(p.marca).toBe("Lattafa Perfumes");
    expect(p.nombre).toBe("Asad Bourbon");
    expect(p.imagenUrl).toBeNull();
    expect(p.notas).toEqual([2, 5]);
    expect(p.presentaciones.map((x) => x.ml)).toEqual([30, 100]);
  });
});
