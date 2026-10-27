/**
 * El único archivo del sitio que toca la librería de Supabase, y la
 * carga solo cuando hace falta (cuentas de cliente). El catálogo no la
 * necesita: así la primera visita descarga 45 KB menos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_LLAVE_PUBLICABLE, SUPABASE_URL } from "../../compartido/config";

const LLAVE_SESION = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

let promesa: Promise<SupabaseClient> | null = null;

/**
 * Supabase borra el #access_token=… de la barra en cuanto lo lee, así
 * que guardamos de qué tipo de enlace venimos ANTES de cargarla. Con
 * eso la página sabe que debe abrir la cuenta recién confirmada.
 */
export type EnlaceDeCorreo = "confirmacion" | "contrasena" | "vencido";
function leerEnlace(hash: string): EnlaceDeCorreo | null {
  if (/error_description=|error_code=/.test(hash)) return "vencido";
  if (/type=recovery/.test(hash)) return "contrasena";
  if (/type=(signup|email|invite|magiclink)/.test(hash) || /access_token=/.test(hash)) return "confirmacion";
  return null;
}
export const enlaceDeCorreo: EnlaceDeCorreo | null = leerEnlace(location.hash);

export function supabase(): Promise<SupabaseClient> {
  promesa ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_LLAVE_PUBLICABLE, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return promesa;
}

/**
 * ¿Vale la pena cargar la librería al abrir la página? Solo si hay
 * una sesión guardada o si venimos de un enlace de correo (confirmar
 * cuenta o cambiar contraseña).
 */
export function haySesionOEnlace(): boolean {
  if (enlaceDeCorreo !== null) return true;
  try {
    return localStorage.getItem(LLAVE_SESION) !== null;
  } catch {
    return false;
  }
}
