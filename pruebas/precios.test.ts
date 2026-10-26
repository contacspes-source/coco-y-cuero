import { describe, expect, test } from "vitest";
import {
  AJUSTES,
  aplicarPorcentaje,
  ganancia,
  margen,
  precioSugerido,
  redondearADecenas,
  semaforo,
} from "../panel/negocio/precios";

// Los costos de estas pruebas son inventados a propósito: el repositorio
// puede ser público y los costos reales del proveedor no deben verse.

describe("redondearADecenas", () => {
  test.each([
    [1234, 1230],
    [1235, 1240], // las mitades suben
    [1239.9, 1240],
    [5, 10],
    [4.99, 0],
    [0, 0],
  ])("%d → %d", (entrada, esperado) => {
    expect(redondearADecenas(entrada)).toBe(esperado);
  });

  test("no sufre por errores de punto flotante", () => {
    // una multiplicación puede dar 1044.9999999999999 cuando la cuenta
    // exacta es 1045; debe redondear igual que 1045
    expect(redondearADecenas(1044.9999999999999)).toBe(1050);
  });
});

describe("precioSugerido", () => {
  test("árabes: costo × 1.10 × 1.90", () => {
    expect(precioSugerido(500, "arabes")).toBe(1050); // 1045 → 1050
  });

  test("diseñador: costo × 1.10 × 1.60", () => {
    expect(precioSugerido(1000, "disenador")).toBe(1760);
  });

  test("nicho usa por ahora el multiplicador de diseñador", () => {
    expect(precioSugerido(1000, "nicho")).toBe(precioSugerido(1000, "disenador"));
  });

  test("con Liverpool: 15 % abajo de su precio", () => {
    // base = 1100; piso = 1375; Liverpool × 0.85 = 2550
    expect(precioSugerido(1000, "disenador", 3000)).toBe(2550);
  });

  test("con Liverpool muy barato: no baja del piso de margen mínimo", () => {
    // Liverpool × 0.85 = 1020, pero el piso es 1100 × 1.25 = 1375
    expect(precioSugerido(1000, "disenador", 1200)).toBe(1380);
  });

  test("respeta ajustes distintos", () => {
    const ajustes = { ...AJUSTES, multiplicador: { ...AJUSTES.multiplicador, arabes: 2 } };
    expect(precioSugerido(500, "arabes", null, ajustes)).toBe(1100);
  });

  test.each([0, -10, Number.NaN])("rechaza costo inválido (%d)", (costo) => {
    expect(() => precioSugerido(costo, "arabes")).toThrow(RangeError);
  });

  test("el sugerido siempre deja margen sano para cualquier costo", () => {
    for (let costo = 50; costo <= 5000; costo += 37) {
      for (const cat of ["arabes", "nicho", "disenador"] as const) {
        expect(semaforo(precioSugerido(costo, cat), costo)).toBe("sano");
      }
    }
  });
});

describe("margen y ganancia", () => {
  test("margen sobre el precio, igual que la vista margen_actual", () => {
    expect(margen(1000, 600)).toBeCloseTo(0.4);
  });
  test("sin costo no hay margen", () => {
    expect(margen(1000, null)).toBeNull();
    expect(ganancia(1000, null)).toBeNull();
  });
  test("precio cero no divide entre cero", () => {
    expect(margen(0, 100)).toBeNull();
  });
  test("ganancia en pesos", () => {
    expect(ganancia(1000, 600)).toBe(400);
  });
});

describe("semáforo", () => {
  test.each([
    [1000, null, "sin-costo"],
    [900, 1000, "perdida"],
    [1000, 1000, "bajo"], // 0 % de margen todavía no es pérdida
    [1000, 850, "bajo"], // 15 %
    [1000, 800, "justo"], // 20 % exacto
    [1000, 700, "justo"], // 30 %
    [1000, 650, "sano"], // 35 % exacto
    [1000, 400, "sano"],
  ] as const)("precio %d con costo %s → %s", (precio, costo, esperado) => {
    expect(semaforo(precio, costo)).toBe(esperado);
  });

  test("20 % de margen equivale al piso del Excel (base × 1.25 sin colchón)", () => {
    expect(margen(1250, 1000)).toBeCloseTo(0.2);
  });
});

describe("aplicarPorcentaje", () => {
  test("sube y redondea", () => expect(aplicarPorcentaje(1050, 10)).toBe(1160)); // 1155
  test("baja y redondea", () => expect(aplicarPorcentaje(1000, -5)).toBe(950));
  test("cero no cambia", () => expect(aplicarPorcentaje(1230, 0)).toBe(1230));
});
