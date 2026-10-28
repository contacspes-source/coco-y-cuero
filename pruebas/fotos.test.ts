import { describe, expect, test } from "vitest";
import { MARGEN, encuadre, recuadroDelProducto, tieneFondoBlanco } from "../panel/negocio/fotos";

/** Imagen blanca de ancho×alto con un rectángulo oscuro (el "producto"). */
function imagen(ancho: number, alto: number, prod?: { x: number; y: number; w: number; h: number }, fondo = 255) {
  const d = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const dentro = prod && x >= prod.x && x < prod.x + prod.w && y >= prod.y && y < prod.y + prod.h;
      const v = dentro ? 40 : fondo;
      d.set([v, v, v, 255], i);
    }
  return d;
}

describe("detectar el producto", () => {
  test("encuentra el frasco en una foto con mucho blanco", () => {
    const d = imagen(200, 100, { x: 120, y: 20, w: 50, h: 60 });
    expect(recuadroDelProducto(d, 200, 100)).toEqual({ x: 120, y: 20, ancho: 50, alto: 60 });
  });
  test("ignora motas sueltas", () => {
    const d = imagen(200, 200, { x: 50, y: 50, w: 100, h: 100 });
    d.set([0, 0, 0, 255], (5 * 200 + 5) * 4); // una mota en la esquina
    expect(recuadroDelProducto(d, 200, 200)).toEqual({ x: 50, y: 50, ancho: 100, alto: 100 });
  });
  test("lo casi blanco (compresión JPG) cuenta como fondo", () => {
    const d = imagen(50, 50, { x: 10, y: 10, w: 20, h: 20 }, 248);
    expect(recuadroDelProducto(d, 50, 50)).toEqual({ x: 10, y: 10, ancho: 20, alto: 20 });
  });
  test("lo transparente cuenta como fondo", () => {
    const d = imagen(20, 20, { x: 5, y: 5, w: 4, h: 4 });
    for (let i = 0; i < d.length; i += 4) if (d[i] === 255) d[i + 3] = 0, (d[i] = 0), (d[i + 1] = 0), (d[i + 2] = 0);
    expect(recuadroDelProducto(d, 20, 20)).toEqual({ x: 5, y: 5, ancho: 4, alto: 4 });
  });
  test("imagen toda blanca: no hay producto", () => expect(recuadroDelProducto(imagen(30, 30), 30, 30)).toBeNull());
});

describe("fondo", () => {
  test("blanco", () => expect(tieneFondoBlanco(imagen(100, 100, { x: 30, y: 30, w: 40, h: 40 }), 100, 100)).toBe(true));
  test("producto pegado a un borde sigue siendo fondo blanco", () =>
    expect(tieneFondoBlanco(imagen(100, 100, { x: 0, y: 20, w: 30, h: 50 }), 100, 100)).toBe(true));
  test("foto con fondo de color se deja como viene", () => expect(tieneFondoBlanco(imagen(100, 100, undefined, 120), 100, 100)).toBe(false));
});

describe("encuadre", () => {
  test("producto alto: centrado con el mismo margen", () => {
    const { lado, destino } = encuadre({ x: 0, y: 0, ancho: 400, alto: 840 }, 1200);
    expect(lado).toBe(1000); // 840 / (1 - 2·0.08)
    expect(destino.alto).toBe(840);
    expect(destino.y).toBe(80);
    expect(destino.x).toBe(Math.round((1000 - destino.ancho) / 2));
  });
  test("foto grande se reduce a 1200", () => {
    const { lado, destino } = encuadre({ x: 10, y: 10, ancho: 3000, alto: 2000 }, 1200);
    expect(lado).toBe(1200);
    expect(destino.ancho).toBe(Math.round(1200 * (1 - 2 * MARGEN)));
    expect(destino.x).toBe(destino.y - (destino.y - destino.x)); // centrado horizontal exacto
    expect(destino.x).toBe(Math.round((1200 - destino.ancho) / 2));
    expect(destino.y).toBe(Math.round((1200 - destino.alto) / 2));
  });
  test("nunca se sale del cuadro", () => {
    for (const [w, h] of [[1, 1], [37, 900], [900, 37], [5000, 5000]] as const) {
      const { lado, destino } = encuadre({ x: 0, y: 0, ancho: w, alto: h }, 1200);
      expect(destino.x).toBeGreaterThanOrEqual(0);
      expect(destino.y).toBeGreaterThanOrEqual(0);
      expect(destino.x + destino.ancho).toBeLessThanOrEqual(lado);
      expect(destino.y + destino.alto).toBeLessThanOrEqual(lado);
    }
  });
});
