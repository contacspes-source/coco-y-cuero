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

/**
 * Llave PÚBLICA (site key) del widget "cocoycuero" de Cloudflare
 * Turnstile. Es pública por diseño. La llave SECRETA del mismo widget
 * va solo en Supabase → Authentication → Attack Protection, nunca aquí.
 *
 * Para probar en local sin Cloudflare usa la llave de prueba
 * "1x00000000000000000000AA" (siempre pasa) y desactiva el CAPTCHA en
 * Supabase; con "" el widget se apaga. Ver docs/SEGURIDAD.md.
 */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFxMSyW4m0gHngeW";
