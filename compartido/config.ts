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
 * Llave PÚBLICA (site key) del widget de Cloudflare Turnstile. La llave
 * secreta va solo en Supabase → Authentication → Attack Protection.
 *
 * La que está aquí es la llave de PRUEBA de Cloudflare: muestra el
 * widget y siempre pasa. Cámbiala por la de tu widget real
 * (Cloudflare → Turnstile → Add widget, dominio cocoycuero.com) y pon su
 * secreto en Supabase. Si la dejas vacía (""), el CAPTCHA se apaga.
 * Ver docs/SEGURIDAD.md.
 */
export const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
