/**
 * El ÚNICO archivo del panel que importa la librería de Supabase.
 * Si mañana cambiamos de proveedor, se reescribe la capa de datos y
 * nada más (pruebas/arquitectura.test.ts vigila que siga así).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_LLAVE_PUBLICABLE, SUPABASE_URL } from "../../compartido/config";

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  cliente ??= createClient(SUPABASE_URL, SUPABASE_LLAVE_PUBLICABLE, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cliente;
}
