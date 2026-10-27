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
  descripcion: string | null;
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
  descripcion: string | null;
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
  descripcion: string | null;
  /** id null solo en respaldos viejos, que no lo traían */
  presentaciones: { id: number | null; ml: number; precio: number }[];
  notas: NotaPublica[];
}

// ------------------------------------------------------------------
// Ventas (panel): clientes y pedidos
// ------------------------------------------------------------------

export type EstadoPedido = "consultado" | "apartado" | "comprado" | "entregado" | "cancelado";

export interface ClienteAdmin {
  id: number;
  numeroCliente: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  canal: string | null;
  correo: string | null;
  rol: Rol;
  conCuenta: boolean;
  creadoEn: string;
  pedidos: number;
  pedidosActivos: number;
  totalEntregado: number;
}

export interface ClienteEditable {
  id?: number;
  nombre: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  canalId: number | null;
}

export interface PedidoAdmin {
  id: number;
  estado: EstadoPedido;
  precioPactado: number;
  /** Lo que se descontó del precio de lista (10 % de bienvenida). */
  descuento: number;
  anticipo: number;
  saldo: number;
  ciudadEntrega: string | null;
  /** Solo en envíos por paquetería a otra ciudad. */
  direccionEnvio: string | null;
  notas: string | null;
  notaInterna: string | null;
  creadoEn: string;
  actualizadoEn: string;
  clienteId: number;
  numeroCliente: number | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  presentacionId: number;
  ml: number | null;
  perfumeId: number | null;
  perfume: string | null;
  marca: string | null;
  imagenUrl: string | null;
  historial: { estado: EstadoPedido; fecha: string }[];
}

export interface NuevoPedido {
  clienteId: number | null;
  presentacionId: number | null;
  precioPactado: number;
  anticipo: number;
  ciudadEntrega: string;
  notas: string;
  notaInterna: string;
}

export interface CambiosDePedido {
  estado?: EstadoPedido;
  anticipo?: number;
  precioPactado?: number;
  ciudadEntrega?: string | null;
  notas?: string | null;
}
