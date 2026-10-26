/**
 * Motor de precios. Funciones puras: no tocan la red ni la pantalla,
 * así que se prueban solas (pruebas/precios.test.ts).
 *
 * Es la misma fórmula del Excel "catalogo y precios":
 *   base     = costo × colchón           (el colchón cubre envío y merma)
 *   sugerido = base × multiplicador de la categoría
 *   y si hay precio de Liverpool:
 *   sugerido = máx(Liverpool × (1 − descuento), base × (1 + margen mínimo))
 *   redondeado a decenas.
 */
import type { ClaveCategoria } from "../../compartido/tipos";

export interface AjustesDePrecio {
  colchon: number;
  multiplicador: Record<ClaveCategoria, number>;
  /** sobre la base: 0.25 = la base más 25 % como piso */
  margenMinimoSobreBase: number;
  descuentoVsLiverpool: number;
}

export const AJUSTES: AjustesDePrecio = {
  colchon: 1.1,
  multiplicador: { arabes: 1.9, disenador: 1.6, nicho: 1.6 },
  margenMinimoSobreBase: 0.25,
  descuentoVsLiverpool: 0.15,
};

/** Redondea a la decena más cercana; las mitades suben (1,235 → 1,240). */
export function redondearADecenas(valor: number): number {
  return Math.round(valor / 10 + 1e-9) * 10;
}

export function precioSugerido(
  costo: number,
  categoria: ClaveCategoria,
  precioLiverpool: number | null = null,
  ajustes: AjustesDePrecio = AJUSTES,
): number {
  if (!(costo > 0)) throw new RangeError("El costo debe ser mayor que cero");
  const base = costo * ajustes.colchon;
  const precio =
    precioLiverpool && precioLiverpool > 0
      ? Math.max(precioLiverpool * (1 - ajustes.descuentoVsLiverpool), base * (1 + ajustes.margenMinimoSobreBase))
      : base * ajustes.multiplicador[categoria];
  return redondearADecenas(precio);
}

/**
 * Margen sobre el precio de venta: de cada peso que cobras, cuánto es
 * ganancia. Es la misma definición que usa la vista margen_actual.
 * Devuelve null si no hay costo o el precio es cero.
 */
export function margen(precio: number, costo: number | null): number | null {
  if (costo === null || !(precio > 0)) return null;
  return (precio - costo) / precio;
}

export function ganancia(precio: number, costo: number | null): number | null {
  return costo === null ? null : precio - costo;
}

export type Semaforo = "sin-costo" | "perdida" | "bajo" | "justo" | "sano";

/**
 * Umbrales:
 *  - perdida: precio por debajo del costo (la base lo rechaza)
 *  - bajo:    menos de 20 % de margen, que equivale a cobrar menos de
 *             costo × 1.25 (el margen mínimo del Excel)
 *  - justo:   20 % a 35 %
 *  - sano:    35 % o más
 */
export const UMBRAL_BAJO = 0.2;
export const UMBRAL_SANO = 0.35;

export function semaforo(precio: number, costo: number | null): Semaforo {
  const m = margen(precio, costo);
  if (m === null) return "sin-costo";
  if (m < 0) return "perdida";
  if (m < UMBRAL_BAJO) return "bajo";
  if (m < UMBRAL_SANO) return "justo";
  return "sano";
}

/** Aplica un cambio porcentual y redondea: +10 sube 10 %, −5 baja 5 %. */
export function aplicarPorcentaje(precio: number, porcentaje: number): number {
  return redondearADecenas(precio * (1 + porcentaje / 100));
}
