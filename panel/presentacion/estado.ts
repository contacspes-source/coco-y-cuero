/**
 * Estado de la aplicación en memoria. Un solo objeto, fácil de seguir:
 * las vistas lo leen y, tras cada operación, se recarga desde la base
 * (la base es la fuente de verdad, no esta copia).
 */
import type { Catalogos, ClienteAdmin, PedidoAdmin, Perfume } from "../../compartido/tipos";
import { FILTROS_INICIALES, type FiltrosCatalogo } from "../negocio/catalogo";
import { crearServicios } from "../negocio/servicios";

export const servicios = crearServicios();

export const estado: {
  correo: string | null;
  catalogos: Catalogos | null;
  perfumes: Perfume[];
  filtros: FiltrosCatalogo;
  clientes: ClienteAdmin[];
  pedidos: PedidoAdmin[];
  canales: { id: number; nombre: string }[];
  /** hay un formulario con cambios sin guardar */
  sucio: boolean;
  /** dónde estabas en la lista del catálogo, para regresar ahí */
  posicionCatalogo: number;
  /** perfume a resaltar al volver a la lista (el que acabas de guardar) */
  resaltar: number | null;
} = {
  correo: null,
  catalogos: null,
  perfumes: [],
  filtros: { ...FILTROS_INICIALES },
  clientes: [],
  pedidos: [],
  canales: [],
  sucio: false,
  posicionCatalogo: 0,
  resaltar: null,
};

export async function recargar(): Promise<void> {
  const { catalogos, perfumes } = await servicios.catalogo.cargar();
  estado.catalogos = catalogos;
  estado.perfumes = perfumes;
}

export function nombreDe(lista: { id: number; nombre: string }[] | undefined, id: number): string {
  return lista?.find((x) => x.id === id)?.nombre ?? "—";
}

/** Clientes, pedidos y canales: se piden juntos al entrar a esas secciones. */
export async function recargarVentas(): Promise<void> {
  const [clientes, pedidos, canales] = await Promise.all([
    servicios.ventas.listarClientes(),
    servicios.ventas.listarPedidos(),
    estado.canales.length ? Promise.resolve(estado.canales) : servicios.ventas.canales(),
  ]);
  estado.clientes = clientes;
  estado.pedidos = pedidos;
  estado.canales = canales;
}
