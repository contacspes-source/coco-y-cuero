/**
 * Prepara una foto en el navegador antes de subirla:
 * 1. Si tiene fondo blanco, quita el blanco sobrante y centra el producto
 *    en un cuadro con el mismo margen para todas (así ninguna se ve
 *    "recortada" ni perdida en blanco en la tarjeta del sitio).
 * 2. La reduce a 1200 px por lado y la comprime a WebP, para que pese
 *    poco y nunca rebase el límite de 2 MB del bucket.
 */
import { encuadre, recuadroDelProducto, tieneFondoBlanco, type Recuadro } from "../negocio/fotos";

export const LADO_MAXIMO = 1200;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_BYTES = 2 * 1024 * 1024;

export class ErrorDeFoto extends Error {}

function aBlob(lienzo: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((r) => lienzo.toBlob(r, tipo, calidad));
}

export async function prepararFoto(archivo: Blob): Promise<Blob> {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    throw new ErrorDeFoto("Usa una foto JPG, PNG o WebP.");
  }
  if (archivo.size > 25 * 1024 * 1024) {
    throw new ErrorDeFoto("La foto pesa demasiado (más de 25 MB).");
  }

  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new ErrorDeFoto("No se pudo leer la foto. Prueba con otra.");
  }

  const producto = buscarProducto(imagen);
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new ErrorDeFoto("Tu navegador no pudo procesar la foto.");
  ctx.imageSmoothingQuality = "high";
  if (producto) {
    // fondo blanco: producto centrado en un cuadro con margen parejo
    const { lado, destino } = encuadre(producto, LADO_MAXIMO);
    lienzo.width = lado;
    lienzo.height = lado;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(imagen, producto.x, producto.y, producto.ancho, producto.alto, destino.x, destino.y, destino.ancho, destino.alto);
  } else {
    // fondo de color o foto ambientada: se respeta tal cual, solo se reduce
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  }
  imagen.close();

  // Safari viejo no sabe generar WebP y devuelve PNG: en ese caso, JPG.
  let blob = await aBlob(lienzo, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await aBlob(lienzo, "image/jpeg", 0.88);
  if (!blob) throw new ErrorDeFoto("No se pudo comprimir la foto.");
  if (blob.size > LIMITE_BYTES) throw new ErrorDeFoto("Aun comprimida, la foto pesa más de 2 MB.");
  return blob;
}

/**
 * Dónde está el producto en la foto original, o null si la foto no
 * tiene fondo blanco. Se analiza una copia chica (rápido) y el
 * resultado se lleva a la escala real con un pixel de holgura.
 */
function buscarProducto(imagen: ImageBitmap): Recuadro | null {
  const escala = Math.min(1, 400 / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));
  const chico = document.createElement("canvas");
  chico.width = ancho;
  chico.height = alto;
  const ctx = chico.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  const { data } = ctx.getImageData(0, 0, ancho, alto);
  if (!tieneFondoBlanco(data, ancho, alto)) return null;
  const r = recuadroDelProducto(data, ancho, alto);
  if (!r) return null;
  const x = Math.max(0, Math.floor((r.x - 1) / escala));
  const y = Math.max(0, Math.floor((r.y - 1) / escala));
  const x2 = Math.min(imagen.width, Math.ceil((r.x + r.ancho + 1) / escala));
  const y2 = Math.min(imagen.height, Math.ceil((r.y + r.alto + 1) / escala));
  return { x, y, ancho: x2 - x, alto: y2 - y };
}
