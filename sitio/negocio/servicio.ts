/**
 * Punto de entrada de la capa de negocio para la pantalla del sitio.
 * La pantalla no sabe de dónde salen los datos (en vivo o respaldo)
 * ni que existe Supabase.
 */
import { CatalogoNoDisponible, FuenteCatalogo, type ResultadoCatalogo } from "../datos/fuente-catalogo";
import { RepositorioCuenta } from "../datos/repositorio-cuenta";
import { enlaceDeCorreo, haySesionOEnlace, type EnlaceDeCorreo } from "../datos/supabase";
import { ServicioCuenta } from "./cuenta";

export { CatalogoNoDisponible };
export type { ResultadoCatalogo };

const fuente = new FuenteCatalogo();

export function cargarCatalogo(): Promise<ResultadoCatalogo> {
  return fuente.cargar();
}

export const cuenta = new ServicioCuenta(new RepositorioCuenta());

/** ¿Hay que preparar la cuenta desde que abre la página? */
export const conviene = { cargarCuentaAlInicio: haySesionOEnlace };

/** De qué enlace de correo venimos al abrir la página (o null). */
export const enlaceAlAbrir: EnlaceDeCorreo | null = enlaceDeCorreo;
export type { EnlaceDeCorreo };
