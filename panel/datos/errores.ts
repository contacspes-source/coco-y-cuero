/**
 * Traduce los errores técnicos (Postgres, red, Auth) a errores que la
 * capa de negocio y la pantalla entienden. Nadie arriba de esta capa
 * tiene que saber qué es un código 23505.
 */

export type TipoDeError = "permiso" | "regla" | "duplicado" | "no-existe" | "red" | "credenciales" | "desconocido";

export class ErrorDeDatos extends Error {
  constructor(
    public readonly tipo: TipoDeError,
    mensaje: string,
    /** pista que manda la base (por ejemplo "precio_bajo_costo") */
    public readonly pista?: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeDatos";
  }
}

interface ErrorCrudo {
  code?: string;
  message?: string;
  hint?: string | null;
  status?: number;
  name?: string;
}

export function traducirError(e: unknown): ErrorDeDatos {
  if (e instanceof ErrorDeDatos) return e;
  const err = (e ?? {}) as ErrorCrudo;
  const msg = err.message ?? String(e);

  if (err.name === "AuthApiError" || err.name === "AuthError") {
    if (/invalid login credentials/i.test(msg)) {
      return new ErrorDeDatos("credenciales", "Correo o contraseña incorrectos.");
    }
    if (/email not confirmed/i.test(msg)) {
      return new ErrorDeDatos("credenciales", "Falta confirmar tu correo. Revisa tu bandeja de entrada.");
    }
    if (err.status === 429) {
      return new ErrorDeDatos("red", "Demasiados intentos. Espera un minuto y vuelve a probar.");
    }
    return new ErrorDeDatos("credenciales", msg);
  }

  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new ErrorDeDatos("red", "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }

  switch (err.code) {
    case "42501":
      return new ErrorDeDatos("permiso", "Tu cuenta no tiene permiso para esto. Vuelve a iniciar sesión.");
    case "23505":
      return new ErrorDeDatos("duplicado", "Ya existe un perfume con esa marca, nombre y tipo, o dos presentaciones con los mismos ml.");
    case "23503":
      return new ErrorDeDatos("regla", "Ese registro está en uso por otro y no se puede quitar.");
    case "23514":
      return new ErrorDeDatos("regla", "Algún dato está fuera de rango (revisa ml, precios y tipo).");
    case "P0001":
      return new ErrorDeDatos("regla", msg, err.hint ?? undefined);
    case "P0002":
      return new ErrorDeDatos("no-existe", msg);
    case "PGRST301":
    case "PGRST303":
      return new ErrorDeDatos("permiso", "Tu sesión expiró. Vuelve a iniciar sesión.");
    default:
      return new ErrorDeDatos("desconocido", msg || "Ocurrió un error inesperado.");
  }
}
