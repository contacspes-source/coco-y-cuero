/**
 * Estado de la aplicación en memoria. Un solo objeto, fácil de seguir:
 * las vistas lo leen y, tras cada operación, se recarga desde la base
 * (la base es la fuente de verdad, no esta copia).
 */
import type { Catalogos, Perfume } from "../../compartido/tipos";
import { FILTROS_INICIALES, type FiltrosCatalogo } from "../negocio/catalogo";
import { crearServicios } from "../negocio/servicios";

export const servicios = crearServicios();

export const estado: {
  correo: string | null;
  catalogos: Catalogos | null;
  perfumes: Perfume[];
  filtros: FiltrosCatalogo;
  /** hay un formulario con cambios sin guardar */
  sucio: boolean;
} = {
  correo: null,
  catalogos: null,
  perfumes: [],
  filtros: { ...FILTROS_INICIALES },
  sucio: false,
};

export async function recargar(): Promise<void> {
  const { catalogos, perfumes } = await servicios.catalogo.cargar();
  estado.catalogos = catalogos;
  estado.perfumes = perfumes;
}

export function nombreDe(lista: { id: number; nombre: string }[] | undefined, id: number): string {
  return lista?.find((x) => x.id === id)?.nombre ?? "—";
}
