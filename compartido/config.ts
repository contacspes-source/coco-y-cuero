/**
 * Configuración pública del proyecto.
 *
 * La llave publicable PUEDE vivir aquí: es pública por diseño y lo que
 * limita lo que se puede hacer con ella son las políticas RLS de la base
 * (ver supabase/pruebas/seguridad.sql).
 *
 * La llave service_role NUNCA va en este repositorio.
 */
export const SUPABASE_URL = "https://hsdthxlymeldxcoolmar.supabase.co";
export const SUPABASE_LLAVE_PUBLICABLE = "sb_publishable_ZROgURMmmu34nTvF3uJrew_Qy_j9RRS";

/** Bucket de Supabase Storage donde viven las fotos de producto. */
export const BUCKET_FOTOS = "perfumes";
