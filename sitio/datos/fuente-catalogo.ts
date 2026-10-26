/**
 * De dónde sale el catálogo del sitio público.
 *
 * 1. En vivo: la vista catalogo_publico de Supabase (una sola petición,
 *    sin librería: el sitio pesa menos y carga más rápido en celular).
 * 2. Respaldo: si Supabase no responde, una copia que se guarda en cada
 *    publicación (catalogo-respaldo.json). Así el sitio nunca se queda
 *    en blanco por una falla del proveedor.
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
  presentaciones: { ml: number; precio: number | string }[] | null;
  notas: { nota: string; familia: string | null }[] | null;
}

export type Origen = "en-vivo" | "respaldo";

export interface ResultadoCatalogo {
  perfumes: PerfumePublico[];
  origen: Origen;
}

export class CatalogoNoDisponible extends Error {
  constructor() {
    super("No pudimos cargar el catálogo en este momento.");
    this.name = "CatalogoNoDisponible";
  }
}

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
    presentaciones: (f.presentaciones ?? [])
      .map((p) => ({ ml: Number(p.ml), precio: Number(p.precio) }))
      .filter((p) => p.ml > 0 && p.precio > 0),
    notas: f.notas ?? [],
  };
}

type Pedir = (url: string, init?: RequestInit) => Promise<Response>;

export class FuenteCatalogo {
  constructor(private readonly pedir: Pedir = (u, i) => fetch(u, i)) {}

  async cargar(): Promise<ResultadoCatalogo> {
    try {
      return { perfumes: await this.leer(URL_EN_VIVO, true), origen: "en-vivo" };
    } catch (e) {
      console.warn("Catálogo en vivo no disponible, usando respaldo", e);
    }
    try {
      return { perfumes: await this.leer(URL_RESPALDO, false), origen: "respaldo" };
    } catch {
      throw new CatalogoNoDisponible();
    }
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
      const filas = (await r.json()) as FilaCatalogo[];
      if (!Array.isArray(filas)) throw new Error("Respuesta inesperada");
      return filas.map(aPerfume).filter((p): p is PerfumePublico => p !== null);
    } finally {
      clearTimeout(reloj);
    }
  }
}
