import { describe, expect, test } from "vitest";
import { DIAPOSITIVAS, diapositivasPara, direccionDeArrastre, moverIndice, partesDelTitulo } from "../sitio/negocio/portada";

describe("diapositivas de la portada", () => {
  test("la del 10 % solo a quien todavía puede usarlo", () => {
    expect(diapositivasPara(true).map((d) => d.clave)).toContain("bienvenida");
    expect(diapositivasPara(false).map((d) => d.clave)).not.toContain("bienvenida");
    expect(diapositivasPara(false)).toHaveLength(DIAPOSITIVAS.length - 1);
  });
  test("la primera dice qué es Coco & Cuero", () => expect(diapositivasPara(false)[0]!.clave).toBe("que-es"));
  test("claves únicas", () => expect(new Set(DIAPOSITIVAS.map((d) => d.clave)).size).toBe(DIAPOSITIVAS.length));
  test("ninguna menciona al proveedor", () =>
    expect(DIAPOSITIVAS.some((d) => /proveedor/i.test(`${d.titulo} ${d.texto} ${d.rotulo}`))).toBe(false));
  test("título con cursivas", () =>
    expect(partesDelTitulo("Perfumes árabes, *de nicho* y de diseñador.")).toEqual([
      { texto: "Perfumes árabes, ", cursiva: false },
      { texto: "de nicho", cursiva: true },
      { texto: " y de diseñador.", cursiva: false },
    ]));
  test("título que empieza en cursiva", () =>
    expect(partesDelTitulo("*10 %* en tu primera compra.")[0]).toEqual({ texto: "10 %", cursiva: true }));
});

describe("carrusel", () => {
  test.each([
    [0, 6, 1, 1],
    [5, 6, 1, 0],
    [0, 6, -1, 5],
    [3, 6, 0, 3],
    [0, 0, 1, 0],
  ])("de %d con %d diapositivas, paso %d → %d", (i, n, paso, r) => expect(moverIndice(i, n, paso)).toBe(r));
  test("deslizar a la izquierda va a la siguiente", () => expect(direccionDeArrastre(-90, 10)).toBe(1));
  test("deslizar a la derecha va a la anterior", () => expect(direccionDeArrastre(80, -5)).toBe(-1));
  test("un toque o scroll vertical no cambia de diapositiva", () => {
    expect(direccionDeArrastre(10, 0)).toBe(0);
    expect(direccionDeArrastre(-60, 120)).toBe(0);
  });
});
