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

// ------------------------------------------------------------------
// Enlaces por nombre: /p/lattafa-asad
// ------------------------------------------------------------------

export interface PerfumeConNombre {
  id: number;
  marca: string | null;
  nombre: string;
  tipo?: string | null;
}

/**
 * El nombre de cada perfume en su enlace: "lattafa-asad". Si dos se
 * llaman igual (el mismo en EDT y EDP), se agrega el tipo; si aun así
 * chocan, el número. Se calcula sobre la lista PUBLICADA y en el mismo
 * orden (por id) en la tienda, el panel y el Worker, así los tres dan
 * el mismo enlace.
 */
export function nombresDeEnlace(perfumes: PerfumeConNombre[]): Map<number, string> {
  const orden = [...perfumes].sort((a, b) => a.id - b.id);
  const base = new Map(orden.map((p) => [p.id, slug(p.marca ?? "", p.nombre)]));
  const cuantos = (m: Map<number, string>) => {
    const c = new Map<string, number>();
    for (const v of m.values()) c.set(v, (c.get(v) ?? 0) + 1);
    return c;
  };
  const c1 = cuantos(base);
  const conTipo = new Map(orden.map((p) => {
    const b = base.get(p.id)!;
    return [p.id, c1.get(b)! > 1 && p.tipo ? `${b}-${slug(p.tipo)}` : b];
  }));
  const c2 = cuantos(conTipo);
  return new Map(orden.map((p) => {
    const b = conTipo.get(p.id)!;
    return [p.id, c2.get(b)! > 1 ? `${b}-${p.id}` : b];
  }));
}

export const rutaDePerfume = (nombreEnlace: string) => `/p/${nombreEnlace}`;

/**
 * Qué perfume pide la ruta. Acepta el enlace por nombre (/p/lattafa-asad)
 * y los que ya se compartieron antes: /p/12-lattafa-asad y /p/12.
 */
export function perfumeDeRuta(ruta: string, nombres: Map<number, string>): number | null {
  const m = /^\/p\/([a-z0-9-]{1,120})\/?$/.exec(ruta);
  if (!m) return null;
  const texto = m[1]!;
  for (const [id, n] of nombres) if (n === texto) return id;
  const viejo = /^(\d{1,9})(?:-|$)/.exec(texto);
  if (viejo && nombres.has(Number(viejo[1]))) return Number(viejo[1]);
  return null;
}

/** ¿Es una ruta de perfume bien formada? (antes de saber si existe) */
export const esRutaDePerfume = (ruta: string) => /^\/p\/[a-z0-9-]{1,120}\/?$/.test(ruta);
