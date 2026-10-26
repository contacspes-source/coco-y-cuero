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

/**
 * Las fotos del catálogo original viven en el sitio ("assets/img/…");
 * las que sube el panel viven en Supabase Storage (URL completa).
 */
export function urlDeFoto(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `/${url.replace(/^\/+/, "")}`;
}
