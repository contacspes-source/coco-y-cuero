/**
 * Prepara una foto en el navegador antes de subirla: la reduce a 1200 px
 * por lado y la comprime a WebP. Así todas pesan poco (el sitio carga
 * rápido en datos móviles) y nunca rebasan el límite de 2 MB del bucket.
 */
export const LADO_MAXIMO = 1200;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_BYTES = 2 * 1024 * 1024;

export class ErrorDeFoto extends Error {}

function aBlob(lienzo: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((r) => lienzo.toBlob(r, tipo, calidad));
}

export async function prepararFoto(archivo: File): Promise<Blob> {
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

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new ErrorDeFoto("Tu navegador no pudo procesar la foto.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();

  // Safari viejo no sabe generar WebP y devuelve PNG: en ese caso, JPG.
  let blob = await aBlob(lienzo, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await aBlob(lienzo, "image/jpeg", 0.88);
  if (!blob) throw new ErrorDeFoto("No se pudo comprimir la foto.");
  if (blob.size > LIMITE_BYTES) throw new ErrorDeFoto("Aun comprimida, la foto pesa más de 2 MB.");
  return blob;
}
