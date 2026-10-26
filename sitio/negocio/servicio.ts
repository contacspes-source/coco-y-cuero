/**
 * Punto de entrada de la capa de negocio para la pantalla del sitio.
 * La pantalla no sabe de dónde salen los datos (en vivo o respaldo).
 */
import { CatalogoNoDisponible, FuenteCatalogo, type ResultadoCatalogo } from "../datos/fuente-catalogo";

export { CatalogoNoDisponible };
export type { ResultadoCatalogo };

const fuente = new FuenteCatalogo();

export function cargarCatalogo(): Promise<ResultadoCatalogo> {
  return fuente.cargar();
}
