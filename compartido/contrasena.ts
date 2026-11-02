/**
 * Regla de contraseñas, la misma para clientes (sitio) y administrador
 * (panel). Supabase debe tener configurado lo mismo en Authentication →
 * Providers → Email (ver docs/SEGURIDAD.md): esta validación evita una
 * llamada a la red, pero la que manda es la de Supabase.
 */
export const LARGO_MINIMO_CONTRASENA = 8;
/** bcrypt ignora lo que pase de 72 bytes; se avisa en vez de truncar en silencio. */
export const LARGO_MAXIMO_CONTRASENA = 72;

/** El mensaje del problema, o null si la contraseña es aceptable. */
export function problemaDeContrasena(contrasena: string): string | null {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) return `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) return `Usa máximo ${LARGO_MAXIMO_CONTRASENA} caracteres.`;
  if (!/\d/.test(contrasena) || !/\p{L}/u.test(contrasena)) return "Combina letras y números.";
  return null;
}
