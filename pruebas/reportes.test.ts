import { describe, expect, test } from "vitest";
import type { Reporte } from "../compartido/tipos";
import { aReporte } from "../panel/datos/repositorio-reportes";
import type { RepositorioReportes } from "../panel/datos/contratos";
import {
  ServicioReportes,
  aCsv,
  cierre,
  compacto,
  diasDe,
  etiquetaRango,
  margenPorcentaje,
  marcasDelEje,
  nombreMes,
  proporciones,
  rangoDe,
  ticketPromedio,
  validarRango,
  variacion,
} from "../panel/negocio/reportes";
import { ErrorDeValidacion } from "../panel/negocio/errores";

const hoy = new Date(2026, 9, 26); // 26 oct 2026

describe("periodos", () => {
  test("este mes", () => expect(rangoDe("mes", hoy)).toEqual({ desde: "2026-10-01", hasta: "2026-10-26" }));
  test("mes pasado", () => expect(rangoDe("mes-pasado", hoy)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" }));
  test("mes pasado en enero cruza de año", () =>
    expect(rangoDe("mes-pasado", new Date(2027, 0, 15))).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" }));
  test("mes pasado desde marzo respeta febrero", () =>
    expect(rangoDe("mes-pasado", new Date(2028, 2, 3))).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" }));
  test("90 días cuenta hoy", () => {
    const r = rangoDe("90-dias", hoy);
    expect(r).toEqual({ desde: "2026-07-29", hasta: "2026-10-26" });
    expect(diasDe(r)).toBe(90);
  });
  test("este año", () => expect(rangoDe("anio", hoy)).toEqual({ desde: "2026-01-01", hasta: "2026-10-26" }));
  test("un solo día", () => expect(diasDe({ desde: "2026-10-26", hasta: "2026-10-26" })).toBe(1));
  test("cruza el cambio de horario sin perder días", () => expect(diasDe({ desde: "2026-03-01", hasta: "2026-04-30" })).toBe(61));
});

describe("validar rango", () => {
  const campos = (desde: string, hasta: string) => validarRango({ desde, hasta }, hoy).map((p) => p.campo);
  test("correcto", () => expect(campos("2026-10-01", "2026-10-26")).toEqual([]));
  test("vacío", () => expect(campos("", "")).toEqual(["desde", "hasta"]));
  test("al revés", () => expect(campos("2026-10-20", "2026-10-01")).toEqual(["hasta"]));
  test("en el futuro", () => expect(campos("2026-11-01", "2026-11-30")).toEqual(["desde"]));
  test("demasiado largo", () => expect(campos("2010-01-01", "2026-10-26")).toEqual(["desde"]));
});

describe("indicadores", () => {
  test("variación", () => {
    expect(variacion(1200, 1000)).toBeCloseTo(0.2);
    expect(variacion(800, 1000)).toBeCloseTo(-0.2);
    expect(variacion(500, 0)).toBeNull();
  });
  test("margen y ticket", () => {
    expect(margenPorcentaje({ ingresos: 2000, margen: 700 })).toBeCloseTo(0.35);
    expect(margenPorcentaje({ ingresos: 0, margen: 0 })).toBeNull();
    expect(ticketPromedio({ ingresos: 3000, ventas: 2 })).toBe(1500);
    expect(ticketPromedio({ ingresos: 0, ventas: 0 })).toBeNull();
  });
  test("cierre del embudo", () => {
    const c = cierre({ creados: 10, consultado: 2, apartado: 1, comprado: 1, entregado: 4, cancelado: 2 });
    expect(c).toEqual({ entregados: 0.4, cancelados: 0.2, enCurso: 4 });
    expect(cierre({ creados: 0, consultado: 0, apartado: 0, comprado: 0, entregado: 0, cancelado: 0 }).entregados).toBeNull();
  });
  test("proporciones para las barras", () => {
    expect(proporciones([50, 100, 0])).toEqual([0.5, 1, 0]);
    expect(proporciones([0, 0])).toEqual([0, 0]);
    expect(proporciones([-20, 40])).toEqual([0, 1]);
  });
  test.each([
    [0, [0]],
    [950, [0, 250, 500, 750, 1000]],
    [3800, [0, 1000, 2000, 3000, 4000]],
    [12400, [0, 5000, 10000, 15000]],
  ])("eje con máximo %d", (max, marcas) => expect(marcasDelEje(max)).toEqual(marcas));
  test.each([
    [850, "850"],
    [1250, "1.3K"],
    [12400, "12K"],
    [1_250_000, "1.3M"],
  ])("compacto %d", (v, t) => expect(compacto(v)).toBe(t));
  test("nombres de mes", () => {
    expect(nombreMes("2026-10")).toBe("oct");
    expect(nombreMes("2025-11", 2026)).toBe("nov 25");
  });
  test("etiqueta del rango", () => expect(etiquetaRango({ desde: "2026-10-01", hasta: "2026-10-26" })).toMatch(/1 oct.*2026 – 26 oct.*2026/));
});

const crudo = {
  desde: "2026-10-01",
  hasta: "2026-10-26",
  resumen: { ventas: 2, ingresos: 2620.0, costo: 1380.0, margen: 1240.0, descuentos: 130, costo_estimado: 1 },
  anterior: { ventas: 1, ingresos: 1000, costo: 600, margen: 400, descuentos: 0, costo_estimado: 0 },
  por_mes: [{ mes: "2026-10", ventas: 2, ingresos: 2620, margen: 1240 }],
  top_perfumes: [{ perfume_id: 5, marca: "Lattafa", perfume: 'Asad, "Bourbon"', ventas: 2, ingresos: 2620, margen: 1240 }],
  por_categoria: [{ nombre: "Árabes", ventas: 2, ingresos: 2620, margen: 1240 }],
  por_genero: [],
  por_ciudad: [{ nombre: "Zamora", ventas: 2, ingresos: 2620 }],
  por_canal: [{ nombre: "=HYPERLINK(1)", clientes_nuevos: 3, ventas: 2, ingresos: 2620 }],
  clientes: { nuevos: 3, compradores: 2, recurrentes: 0 },
  embudo: { creados: 4, consultado: 1, apartado: 0, comprado: 1, entregado: 2, cancelado: 0 },
  pendiente: { en_curso: 2, por_cobrar: 650, anticipos: 650, invertido: 690 },
};

describe("traducción del reporte", () => {
  test("de la base al panel", () => {
    const r = aReporte(crudo);
    expect(r.resumen).toEqual({ ventas: 2, ingresos: 2620, costo: 1380, margen: 1240, descuentos: 130, costoEstimado: 1 });
    expect(r.topPerfumes[0]).toEqual({ perfumeId: 5, marca: "Lattafa", nombre: 'Asad, "Bourbon"', ventas: 2, ingresos: 2620, margen: 1240 });
    expect(r.porCiudad[0]!.margen).toBeNull();
    expect(r.pendiente).toEqual({ enCurso: 2, porCobrar: 650, anticipos: 650, invertido: 690 });
  });
  test("tolera secciones vacías", () => {
    const r = aReporte({ desde: "2026-10-01", hasta: "2026-10-26" });
    expect(r.porMes).toEqual([]);
    expect(r.resumen.ventas).toBe(0);
  });
});

describe("CSV", () => {
  const csv = aCsv(aReporte(crudo));
  test("abre bien en Excel (BOM y saltos de Windows)", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
  });
  test("escapa comas y comillas", () => expect(csv).toContain('"Asad, ""Bourbon"""'));
  test("neutraliza fórmulas", () => expect(csv).toContain("'=HYPERLINK(1)"));
  test("trae el resumen", () => expect(csv).toContain("Ganancia,1240,400"));
});

describe("ServicioReportes", () => {
  const pedidos: [string, string][] = [];
  const repo: RepositorioReportes = {
    reporte: async (d, h) => {
      pedidos.push([d, h]);
      return aReporte({ ...crudo, desde: d, hasta: h }) as Reporte;
    },
  };
  const s = new ServicioReportes(repo, () => hoy);

  test("los periodos fijos se calculan con el día de hoy", () =>
    expect(s.rango("mes-pasado")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" }));
  test("un rango inválido no llega a la base", async () => {
    await expect(s.obtener({ desde: "2026-10-20", hasta: "2026-10-01" })).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(() => s.rango("personalizado", { desde: "x", hasta: "" })).toThrow(ErrorDeValidacion);
    expect(pedidos).toEqual([]);
  });
  test("pide el reporte del rango", async () => {
    const r = await s.obtener({ desde: "2026-10-01", hasta: "2026-10-26" });
    expect(pedidos).toEqual([["2026-10-01", "2026-10-26"]]);
    expect(r.desde).toBe("2026-10-01");
  });
});
