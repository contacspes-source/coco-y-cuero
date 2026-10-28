/**
 * Encuadre de las fotos de producto. Las fotos que se bajan de internet
 * vienen con márgenes disparejos: unas con mucho blanco y otras con la
 * caja pegada al borde, que en la tarjeta del sitio se ve "recortada".
 * Aquí se calcula, sin DOM, dónde está el producto y cómo centrarlo en
 * un cuadro con el mismo margen para todas. Se prueba en
 * pruebas/fotos.test.ts.
 */

export interface Recuadro {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Qué tan blanco tiene que ser un píxel para contar como fondo. */
export const UMBRAL_FONDO = 242;
/** Margen alrededor del producto, como fracción del lado del cuadro. */
export const MARGEN = 0.08;

const esFondo = (d: Uint8ClampedArray, i: number, umbral: number) =>
  d[i + 3]! < 16 || (d[i]! >= umbral && d[i + 1]! >= umbral && d[i + 2]! >= umbral);

/**
 * ¿La foto tiene fondo blanco (o transparente)? Se revisa el contorno:
 * si al menos la mitad es fondo, se puede recortar y reencuadrar sin que se
 * note. Una foto con fondo de color se deja como viene.
 */
export function tieneFondoBlanco(d: Uint8ClampedArray, ancho: number, alto: number, umbral = UMBRAL_FONDO): boolean {
  let total = 0;
  let blancos = 0;
  const revisar = (x: number, y: number) => {
    total++;
    if (esFondo(d, (y * ancho + x) * 4, umbral)) blancos++;
  };
  for (let x = 0; x < ancho; x++) {
    revisar(x, 0);
    revisar(x, alto - 1);
  }
  for (let y = 1; y < alto - 1; y++) {
    revisar(0, y);
    revisar(ancho - 1, y);
  }
  return total > 0 && blancos / total >= 0.5;
}

/**
 * El rectángulo más chico que contiene todo lo que no es fondo. Ignora
 * motas sueltas: una fila o columna cuenta solo si tiene al menos
 * `minimo` píxeles de producto. null si la imagen está vacía.
 */
export function recuadroDelProducto(
  d: Uint8ClampedArray,
  ancho: number,
  alto: number,
  umbral = UMBRAL_FONDO,
  minimo = Math.max(2, Math.round(Math.min(ancho, alto) * 0.006)),
): Recuadro | null {
  const filas = new Uint32Array(alto);
  const columnas = new Uint32Array(ancho);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!esFondo(d, (y * ancho + x) * 4, umbral)) {
        filas[y]!++;
        columnas[x]!++;
      }
    }
  }
  const primero = (a: Uint32Array) => a.findIndex((v) => v >= minimo);
  const ultimo = (a: Uint32Array) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i]! >= minimo) return i;
    return -1;
  };
  const y0 = primero(filas);
  const x0 = primero(columnas);
  if (y0 < 0 || x0 < 0) return null;
  const y1 = ultimo(filas);
  const x1 = ultimo(columnas);
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

/**
 * Cuadro final: el producto centrado, escalado para que su lado mayor
 * ocupe (1 − 2·margen) del cuadro. Devuelve el lado del cuadro y dónde
 * dibujar el producto dentro de él.
 */
export function encuadre(producto: Recuadro, ladoMaximo: number, margen = MARGEN): { lado: number; destino: Recuadro } {
  const mayor = Math.max(producto.ancho, producto.alto);
  // no se agranda una foto chica: el cuadro sale de su tamaño real
  const lado = Math.min(ladoMaximo, Math.round(mayor / (1 - 2 * margen)));
  const escala = (lado * (1 - 2 * margen)) / mayor;
  const ancho = Math.round(producto.ancho * escala);
  const alto = Math.round(producto.alto * escala);
  return {
    lado,
    destino: { x: Math.round((lado - ancho) / 2), y: Math.round((lado - alto) / 2), ancho, alto },
  };
}
