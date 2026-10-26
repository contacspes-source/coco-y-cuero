/**
 * Tipos del dominio. Los usan las tres capas, por eso viven aquí y no
 * en ninguna de ellas. No contienen lógica.
 */

export type ClaveCategoria = "arabes" | "nicho" | "disenador";
export type TipoPerfume = "EDT" | "EDP" | "Parfum" | "Extrait" | "Colonia";
export const TIPOS_PERFUME: readonly TipoPerfume[] = ["EDT", "EDP", "Parfum", "Extrait", "Colonia"];

export interface Opcion {
  id: number;
  clave: string;
  nombre: string;
}

export interface Nota {
  id: number;
  nombre: string;
  familia: string | null;
}

export interface Catalogos {
  generos: Opcion[];
  categorias: Opcion[];
  marcas: string[];
  notas: Nota[];
}

export interface Presentacion {
  id: number;
  ml: number;
  precioVenta: number;
  /** null si todavía no se registra costo de proveedor */
  costo: number | null;
}

export interface Perfume {
  id: number;
  marca: string;
  nombre: string;
  tipo: TipoPerfume;
  generoId: number;
  categoriaId: number;
  imagenUrl: string | null;
  publicado: boolean;
  presentaciones: Presentacion[];
  notas: number[];
  actualizadoEn: string;
}

/** Lo que edita el formulario. Sin id = perfume nuevo. */
export interface PerfumeEditable {
  id?: number;
  marca: string;
  nombre: string;
  tipo: TipoPerfume;
  generoId: number;
  categoriaId: number;
  imagenUrl: string | null;
  publicado: boolean;
  presentaciones: PresentacionEditable[];
  notas: number[];
}

export interface PresentacionEditable {
  id?: number;
  ml: number;
  precioVenta: number;
  costo: number | null;
}

export interface CambioDePrecio {
  presentacionId: number;
  precioVenta: number;
}

export type Rol = "admin" | "cliente";

export interface Usuario {
  id: string;
  correo: string;
}

// ------------------------------------------------------------------
// Sitio público (vista catalogo_publico: sin costos)
// ------------------------------------------------------------------

export interface NotaPublica {
  nota: string;
  familia: string | null;
}

export interface PerfumePublico {
  id: number;
  marca: string;
  nombre: string;
  tipo: TipoPerfume;
  /** "caballero" | "dama" | "unisex" */
  genero: string;
  categoria: ClaveCategoria;
  imagenUrl: string | null;
  presentaciones: { ml: number; precio: number }[];
  notas: NotaPublica[];
}
