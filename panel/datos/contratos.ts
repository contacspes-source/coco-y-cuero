/**
 * Lo que la capa de datos promete a la de negocio. La capa de negocio
 * depende de estas interfaces, no de Supabase; por eso en las pruebas
 * se le puede pasar un repositorio falso en memoria.
 */
import type {
  CambioDePrecio,
  CambiosDePedido,
  Catalogos,
  ClienteAdmin,
  ClienteEditable,
  NuevoPedido,
  PedidoAdmin,
  Perfume,
  PerfumeEditable,
  Reporte,
  Rol,
  Usuario,
} from "../../compartido/tipos";

export interface RepositorioCatalogo {
  cargarCatalogos(): Promise<Catalogos>;
  listarPerfumes(): Promise<Perfume[]>;
  /** Guarda todo el perfume en una transacción. Devuelve su id. */
  guardarPerfume(datos: PerfumeEditable): Promise<number>;
  cambiarPublicado(perfumeId: number, publicado: boolean): Promise<void>;
  /** Cambia solo la foto (para reencuadrar sin tocar lo demás). */
  cambiarFoto(perfumeId: number, url: string): Promise<void>;
  /** Todos o ninguno. Devuelve cuántos precios cambiaron. */
  actualizarPrecios(cambios: CambioDePrecio[]): Promise<number>;
}

export interface RepositorioFotos {
  /** Sube la foto y devuelve su URL pública. */
  subir(archivo: Blob, ruta: string): Promise<string>;
}

export type EventoDeSesion = "entro" | "salio" | "recuperar-contrasena";

export interface RepositorioSesion {
  usuarioActual(): Promise<Usuario | null>;
  rolDe(usuario: Usuario): Promise<Rol | null>;
  iniciarSesion(correo: string, contrasena: string): Promise<Usuario>;
  cerrarSesion(): Promise<void>;
  enviarCorreoDeRecuperacion(correo: string, volverA: string): Promise<void>;
  cambiarContrasena(nueva: string): Promise<void>;
  alCambiar(escucha: (evento: EventoDeSesion) => void): void;
}

export interface RepositorioVentas {
  listarClientes(): Promise<ClienteAdmin[]>;
  guardarCliente(c: ClienteEditable): Promise<number>;
  canales(): Promise<{ id: number; nombre: string }[]>;
  listarPedidos(): Promise<PedidoAdmin[]>;
  crearPedido(p: NuevoPedido): Promise<number>;
  actualizarPedido(id: number, cambios: CambiosDePedido): Promise<void>;
  guardarNotaInterna(pedidoId: number, nota: string | null): Promise<void>;
  /** null borra el costo registrado. */
  guardarCostoReal(pedidoId: number, costo: number | null): Promise<void>;
}

export interface RepositorioReportes {
  /** Fechas "AAAA-MM-DD", hora de México. Solo admin. */
  reporte(desde: string, hasta: string): Promise<Reporte>;
}
