/**
 * Reportes del negocio (incremento 5): periodos, comparaciones,
 * indicadores derivados y exportación a CSV. Todo lo puro se prueba en
 * pruebas/reportes.test.ts; los números base los calcula la base de
 * datos (reporte_ventas), aquí solo se interpretan.
 */
import type { Reporte, ResumenVentas } from "../../compartido/tipos";
import type { RepositorioReportes } from "../datos/contratos";
import { RepositorioReportesSupabase } from "../datos/repositorio-reportes";
import { ErrorDeValidacion, type ProblemaDeCampo } from "./errores";

// ------------------------------------------------------------------
// Periodos
// ------------------------------------------------------------------

export type Periodo = "mes" | "mes-pasado" | "90-dias" | "anio" | "personalizado";

export const PERIODOS: { clave: Periodo; nombre: string }[] = [
  { clave: "mes", nombre: "Este mes" },
  { clave: "mes-pasado", nombre: "Mes pasado" },
  { clave: "90-dias", nombre: "Últimos 90 días" },
  { clave: "anio", nombre: "Este año" },
  { clave: "personalizado", nombre: "Personalizado" },
];

export interface Rango {
  desde: string;
  hasta: string;
}

const dos = (x: number) => String(x).padStart(2, "0");

/** Fecha local del navegador (el negocio está en México) como "AAAA-MM-DD". */
export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function desdeISO(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a!, m! - 1, d!);
}

export function rangoDe(periodo: Exclude<Periodo, "personalizado">, hoy: Date): Rango {
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (periodo) {
    case "mes":
      return { desde: fechaISO(new Date(a, m, 1)), hasta: fechaISO(hoy) };
    case "mes-pasado":
      return { desde: fechaISO(new Date(a, m - 1, 1)), hasta: fechaISO(new Date(a, m, 0)) };
    case "90-dias":
      return { desde: fechaISO(new Date(a, m, hoy.getDate() - 89)), hasta: fechaISO(hoy) };
    case "anio":
      return { desde: fechaISO(new Date(a, 0, 1)), hasta: fechaISO(hoy) };
  }
}

/** Días que abarca el rango, contando ambos extremos. */
export function diasDe(r: Rango): number {
  return Math.round((desdeISO(r.hasta).getTime() - desdeISO(r.desde).getTime()) / 86_400_000) + 1;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function validarRango(r: Rango, hoy: Date): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (!FECHA.test(r.desde)) p.push({ campo: "desde", mensaje: "Elige la fecha de inicio." });
  if (!FECHA.test(r.hasta)) p.push({ campo: "hasta", mensaje: "Elige la fecha final." });
  if (p.length) return p;
  if (r.hasta < r.desde) p.push({ campo: "hasta", mensaje: "La fecha final va después de la inicial." });
  else if (r.desde > fechaISO(hoy)) p.push({ campo: "desde", mensaje: "Ese periodo todavía no empieza." });
  else if (diasDe(r) > 3660) p.push({ campo: "desde", mensaje: "Elige un periodo de 10 años o menos." });
  return p;
}

const mesCorto = new Intl.DateTimeFormat("es-MX", { month: "short" });
const fechaLarga = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** "2026-10" → "oct" (y "oct 25" si no es del año de referencia). */
export function nombreMes(mes: string, anioDeReferencia?: number): string {
  const [a, m] = mes.split("-").map(Number);
  const nombre = mesCorto.format(new Date(a!, m! - 1, 1)).replace(".", "");
  return anioDeReferencia !== undefined && a !== anioDeReferencia ? `${nombre} ${String(a).slice(2)}` : nombre;
}

/** "1 oct 2026 – 26 oct 2026" */
export function etiquetaRango(r: Rango): string {
  if (r.desde === r.hasta) return fechaLarga.format(desdeISO(r.desde));
  return `${fechaLarga.format(desdeISO(r.desde))} – ${fechaLarga.format(desdeISO(r.hasta))}`;
}

// ------------------------------------------------------------------
// Indicadores
// ------------------------------------------------------------------

/** Cambio relativo contra el periodo anterior. null si antes era 0 (no hay base). */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (actual - anterior) / Math.abs(anterior);
}

export const margenPorcentaje = (r: Pick<ResumenVentas, "ingresos" | "margen">): number | null =>
  r.ingresos > 0 ? r.margen / r.ingresos : null;

export const ticketPromedio = (r: Pick<ResumenVentas, "ingresos" | "ventas">): number | null =>
  r.ventas > 0 ? r.ingresos / r.ventas : null;

/**
 * De los pedidos que entraron en el periodo: cuántos ya se cerraron
 * (entregados) y cuántos se perdieron (cancelados). Los que siguen en
 * curso no cuentan en contra.
 */
export function cierre(e: Reporte["embudo"]): { entregados: number | null; cancelados: number | null; enCurso: number } {
  const enCurso = e.consultado + e.apartado + e.comprado;
  return {
    entregados: e.creados ? e.entregado / e.creados : null,
    cancelados: e.creados ? e.cancelado / e.creados : null,
    enCurso,
  };
}

/** Proporción de cada fila contra la mayor, para las barras de las tablas. */
export function proporciones(valores: number[]): number[] {
  const max = Math.max(0, ...valores);
  return valores.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** Escala "bonita" para el eje: 0, 1 000, 2 000… con 4 marcas como máximo. */
export function marcasDelEje(maximo: number, cuantas = 4): number[] {
  if (maximo <= 0) return [0];
  const crudo = maximo / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= crudo)!;
  const marcas: number[] = [];
  for (let v = 0; v < maximo + paso; v += paso) {
    marcas.push(v);
    if (v >= maximo) break;
  }
  return marcas;
}

/** 12 400 → "12.4K"; 1 250 000 → "1.3M". Para ejes, no para totales. */
export function compacto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}

// ------------------------------------------------------------------
// Exportar a CSV (se abre en Excel o Google Sheets)
// ------------------------------------------------------------------

function celda(v: string | number | null): string {
  if (v === null) return "";
  const t = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
  // comillas si hace falta y neutraliza fórmulas (=, +, -, @) en texto
  const seguro = typeof v === "string" && /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

const renglon = (...c: (string | number | null)[]) => c.map(celda).join(",");

export function aCsv(r: Reporte): string {
  const lineas: string[] = [];
  const seccion = (titulo: string) => {
    if (lineas.length) lineas.push("");
    lineas.push(renglon(titulo));
  };
  lineas.push(renglon("Coco & Cuero · Reporte de ventas", `${r.desde} a ${r.hasta}`));

  seccion("Resumen");
  lineas.push(renglon("Indicador", "Este periodo", "Periodo anterior"));
  lineas.push(renglon("Ventas entregadas", r.resumen.ventas, r.anterior.ventas));
  lineas.push(renglon("Ingresos", r.resumen.ingresos, r.anterior.ingresos));
  lineas.push(renglon("Costo", r.resumen.costo, r.anterior.costo));
  lineas.push(renglon("Ganancia", r.resumen.margen, r.anterior.margen));
  lineas.push(renglon("Descuentos de bienvenida", r.resumen.descuentos, r.anterior.descuentos));
  lineas.push(renglon("Clientes nuevos", r.clientes.nuevos, null));

  seccion("Ventas por mes");
  lineas.push(renglon("Mes", "Ventas", "Ingresos", "Ganancia"));
  for (const m of r.porMes) lineas.push(renglon(m.mes, m.ventas, m.ingresos, m.margen));

  seccion("Más vendidos");
  lineas.push(renglon("Marca", "Perfume", "Ventas", "Ingresos", "Ganancia"));
  for (const t of r.topPerfumes) lineas.push(renglon(t.marca, t.nombre, t.ventas, t.ingresos, t.margen));

  for (const [titulo, filas] of [
    ["Por categoría", r.porCategoria],
    ["Por género", r.porGenero],
    ["Por ciudad", r.porCiudad],
  ] as const) {
    seccion(titulo);
    lineas.push(renglon("Nombre", "Ventas", "Ingresos", "Ganancia"));
    for (const f of filas) lineas.push(renglon(f.nombre, f.ventas, f.ingresos, f.margen));
  }

  seccion("Cómo nos conocen");
  lineas.push(renglon("Canal", "Clientes nuevos", "Ventas", "Ingresos"));
  for (const c of r.porCanal) lineas.push(renglon(c.nombre, c.clientesNuevos, c.ventas, c.ingresos));

  // BOM para que Excel lea bien los acentos
  return `﻿${lineas.join("\r\n")}\r\n`;
}

export const nombreDeArchivo = (r: Rango) => `coco-y-cuero-ventas-${r.desde}-a-${r.hasta}.csv`;

// ------------------------------------------------------------------
// Caso de uso
// ------------------------------------------------------------------

export class ServicioReportes {
  constructor(
    private readonly repo: RepositorioReportes,
    private readonly hoy: () => Date = () => new Date(),
  ) {}

  rango(periodo: Periodo, personalizado?: Rango): Rango {
    if (periodo === "personalizado") {
      if (!personalizado) return rangoDe("mes", this.hoy());
      const problemas = validarRango(personalizado, this.hoy());
      if (problemas.length) throw new ErrorDeValidacion(problemas);
      return personalizado;
    }
    return rangoDe(periodo, this.hoy());
  }

  obtener(r: Rango): Promise<Reporte> {
    const problemas = validarRango(r, this.hoy());
    if (problemas.length) return Promise.reject(new ErrorDeValidacion(problemas));
    return this.repo.reporte(r.desde, r.hasta);
  }
}

export function crearServicioReportes() {
  return new ServicioReportes(new RepositorioReportesSupabase());
}
