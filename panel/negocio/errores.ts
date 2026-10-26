import { ErrorDeDatos } from "../datos/errores";
import { ErrorDeValidacion } from "../../compartido/errores";

export { ErrorDeDatos, ErrorDeValidacion };
export type { ProblemaDeCampo } from "../../compartido/errores";

/** La cuenta existe pero no es de administrador. */
export class ErrorDeAcceso extends Error {
  constructor() {
    super("Esta cuenta no es de administrador. El panel solo es para el equipo de Coco & Cuero.");
    this.name = "ErrorDeAcceso";
  }
}

/** Mensaje en español, listo para mostrarse, para cualquier error. */
export function mensajeDe(e: unknown): string {
  if (e instanceof ErrorDeValidacion) return "Revisa los campos marcados.";
  if (e instanceof ErrorDeDatos || e instanceof ErrorDeAcceso) return e.message;
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado.";
}

/** ¿Hay que mandar a la persona de regreso al login? */
export function esDeSesion(e: unknown): boolean {
  return e instanceof ErrorDeDatos && e.tipo === "permiso";
}
