/**
 * De dónde sale el catálogo del sitio público, en este orden:
 *
 * 1. /api/catalogo: nuestro propio dominio (worker/index.ts), que a su
 *    vez lee Supabase. Funciona aunque la red de quien visita bloquee
 *    *.supabase.co (escuelas, oficinas, bloqueadores de anuncios).
 * 2. Supabase directo: por si el Worker falla (y en `npm run dev`).
 * 3. Respaldo: una copia del catálogo que viaja con el sitio
 *    (catalogo-respaldo.json). Así nunca se queda en blanco.
 */
import { SUPABASE_LLAVE_PUBLICABLE, SUPABASE_URL } from "../../compartido/config";
import type { ClaveCategoria, PerfumePublico, TipoPerfume } from "../../compartido/tipos";

export interface FilaCatalogo {
  id: number;
  marca: string;
  nombre: string;
  tipo: string;
  genero: string;
  categoria: string;
  imagen_url: string | null;
  descripcion?: string | null;
  presentaciones: { id?: number; ml: number; precio: number | string }[] | null;
  notas: { nota: string; familia: string | null }[] | null;
}

export type Origen = "en-vivo" | "respaldo";

export interface ResultadoCatalogo {
  perfumes: PerfumePublico[];
  origen: Origen;
}

export class CatalogoNoDisponible extends Error {
  constructor(readonly detalles: string[] = []) {
    super("No pudimos cargar el catálogo en este momento.");
    this.name = "CatalogoNoDisponible";
  }
}

export const URL_PROPIA = "/api/catalogo";
export const URL_EN_VIVO = `${SUPABASE_URL}/rest/v1/catalogo_publico?select=*&order=id`;
export const URL_RESPALDO = "/catalogo-respaldo.json";
const ESPERA_MAXIMA_MS = 8000;

/** Convierte un renglón de la base al tipo del dominio (y descarta basura). */
export function aPerfume(f: FilaCatalogo): PerfumePublico | null {
  if (!f || typeof f.id !== "number" || !f.nombre) return null;
  return {
    id: f.id,
    marca: f.marca ?? "",
    nombre: f.nombre,
    tipo: f.tipo as TipoPerfume,
    genero: f.genero,
    categoria: f.categoria as ClaveCategoria,
    imagenUrl: f.imagen_url,
    descripcion: f.descripcion?.trim() || null,
    presentaciones: (f.presentaciones ?? [])
      .map((p) => ({ id: typeof p.id === "number" ? p.id : null, ml: Number(p.ml), precio: Number(p.precio) }))
      .filter((p) => p.ml > 0 && p.precio > 0),
    notas: f.notas ?? [],
  };
}

type Pedir = (url: string, init?: RequestInit) => Promise<Response>;

export class FuenteCatalogo {
  constructor(private readonly pedir: Pedir = (u, i) => fetch(u, i)) {}

  /** Lo que falló en el último intento (para mostrarlo si nada funciona). */
  ultimosErrores: string[] = [];

  async cargar(): Promise<ResultadoCatalogo> {
    this.ultimosErrores = [];
    const fuentes: [string, boolean, Origen][] = [
      [URL_PROPIA, false, "en-vivo"],
      [URL_EN_VIVO, true, "en-vivo"],
      [URL_RESPALDO, false, "respaldo"],
    ];
    for (const [url, conLlave, origen] of fuentes) {
      try {
        const perfumes = await this.leer(url, conLlave);
        // un catálogo vacío en vivo es sospechoso: se intenta la siguiente
        if (perfumes.length === 0 && origen === "en-vivo") throw new Error("catálogo vacío");
        return { perfumes, origen };
      } catch (e) {
        const motivo = e instanceof Error ? (e.name === "AbortError" ? "tardó demasiado" : e.message) : String(e);
        this.ultimosErrores.push(`${url.startsWith("/") ? url : "supabase"}: ${motivo}`);
      }
    }
    console.warn("Catálogo no disponible", this.ultimosErrores);
    throw new CatalogoNoDisponible(this.ultimosErrores);
  }

  private async leer(url: string, conLlave: boolean): Promise<PerfumePublico[]> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
    try {
      const r = await this.pedir(url, {
        signal: control.signal,
        headers: conLlave ? { apikey: SUPABASE_LLAVE_PUBLICABLE, Accept: "application/json" } : { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // si el servidor regresa una página HTML (ruta inexistente), no es el catálogo
      if ((r.headers.get("Content-Type") ?? "").includes("html")) throw new Error("no es el catálogo (HTML)");
      const filas = (await r.json()) as FilaCatalogo[];
      if (!Array.isArray(filas)) throw new Error("Respuesta inesperada");
      return filas.map(aPerfume).filter((p): p is PerfumePublico => p !== null);
    } finally {
      clearTimeout(reloj);
    }
  }
}
