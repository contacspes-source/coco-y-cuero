/** Utilidades de texto puras que comparten el panel y el sitio. */

/** "Ámbar" y "ambar" deben encontrarse igual. */
export function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Lattafa", "Asad Bourbon" → "lattafa-asad-bourbon" */
export function slug(...partes: string[]): string {
  return (
    sinAcentos(partes.join(" "))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "perfume"
  );
}

/** "flor blanca" → "Flor blanca" */
export function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase("es-MX") + s.slice(1);
}

const FOTOS_EN_SUPABASE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/perfumes\/([^/?#]+)$/;
let fotosPorNuestroDominio = false;

/**
 * El sitio público pide las fotos de Supabase a través de nuestro dominio
 * (/fotos/…, ver worker/index.ts) para que carguen aunque la red de quien
 * visita bloquee supabase.co. El panel no lo activa.
 */
export function usarFotosPorNuestroDominio(activo: boolean): void {
  fotosPorNuestroDominio = activo;
}

/**
 * Las fotos del catálogo original viven en el sitio ("assets/img/…");
 * las que sube el panel viven en Supabase Storage (URL completa).
 */
export function urlDeFoto(url: string | null): string | null {
  if (!url) return null;
  if (!/^https?:\/\//.test(url)) return `/${url.replace(/^\/+/, "")}`;
  const enSupabase = fotosPorNuestroDominio ? FOTOS_EN_SUPABASE.exec(url) : null;
  return enSupabase ? `/fotos/${enSupabase[1]}` : url;
}

/** El camino de regreso: "/fotos/x.webp" → URL directa de Supabase (si el Worker fallara). */
export function urlDirectaDeFoto(src: string, supabaseUrl: string): string | null {
  const m = /\/fotos\/([^/?#]+)$/.exec(src);
  return m ? `${supabaseUrl}/storage/v1/object/public/perfumes/${m[1]}` : null;
}
