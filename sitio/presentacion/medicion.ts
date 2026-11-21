/**
 * Medición del embudo de venta: quién ve un perfume, quién escribe por
 * WhatsApp y quién aparta. Sin esto no se sabe qué anuncio ni qué
 * perfume vende.
 *
 * Cada evento va a dos lados, solo si existen en la página:
 * - Google Tag Manager (window.dataLayer), con los nombres estándar de
 *   Google Analytics 4 (view_item, generate_lead) más "clic_whatsapp".
 * - El píxel de Meta (window.fbq), con sus eventos estándar
 *   (ViewContent, Contact, Lead), que sirven para optimizar anuncios.
 *
 * Nunca manda datos de la persona (nombre, correo, teléfono): solo qué
 * perfume y cuánto cuesta. Si un bloqueador quita GTM o el píxel, no
 * pasa nada: la tienda funciona igual.
 */
import type { PerfumePublico } from "../../compartido/tipos";

type Ventana = Window & { dataLayer?: unknown[]; fbq?: (...args: unknown[]) => void };
const w = window as Ventana;

function enviar(gtm: Record<string, unknown>, meta?: { evento: string; datos?: Record<string, unknown> }) {
  try {
    if (Array.isArray(w.dataLayer)) {
      // GA4 pide limpiar el ecommerce anterior antes de mandar otro
      if ("ecommerce" in gtm) w.dataLayer.push({ ecommerce: null });
      w.dataLayer.push(gtm);
    }
    if (meta && typeof w.fbq === "function") w.fbq("track", meta.evento, meta.datos ?? {});
  } catch {
    /* medir nunca debe romper la tienda */
  }
}

const articulo = (p: PerfumePublico, precio: number | null, ml?: number) => ({
  item_id: String(p.id),
  item_name: p.nombre,
  item_brand: p.marca,
  item_category: p.categoria,
  ...(ml ? { item_variant: `${ml} ml` } : {}),
  ...(precio !== null ? { price: precio } : {}),
});

/** Alguien abrió el detalle de un perfume. */
export function medirVerPerfume(p: PerfumePublico) {
  const precio = p.presentaciones[0]?.precio ?? null;
  enviar(
    { event: "view_item", ecommerce: { currency: "MXN", value: precio ?? 0, items: [articulo(p, precio)] } },
    { evento: "ViewContent", datos: { content_ids: [String(p.id)], content_name: `${p.marca} ${p.nombre}`, content_type: "product", currency: "MXN", value: precio ?? 0 } },
  );
}

/** Alguien apartó un perfume desde su cuenta. */
export function medirApartado(p: PerfumePublico, ml: number, precio: number, pedido: number) {
  enviar(
    { event: "generate_lead", pedido, ecommerce: { currency: "MXN", value: precio, items: [articulo(p, precio, ml)] } },
    { evento: "Lead", datos: { content_ids: [String(p.id)], content_name: `${p.marca} ${p.nombre}`, currency: "MXN", value: precio } },
  );
}

/** De qué parte de la página salió un clic a WhatsApp. */
export function origenDeEnlace(a: Element): string {
  if (a.id) return a.id;
  if (a.closest(".ficha")) return "tarjeta";
  if (a.closest(".hoja-detalle")) return "detalle";
  if (a.closest(".hoja")) return "cuenta";
  if (a.closest(".portada")) return "portada";
  return "otro";
}

/**
 * Un solo oyente para todos los enlaces de WhatsApp, también los que se
 * pintan después (tarjetas, detalle, pedido apartado).
 */
export function medirClicsWhatsApp() {
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href*="wa.me/"]');
      if (!a) return;
      const origen = origenDeEnlace(a);
      enviar({ event: "clic_whatsapp", origen }, { evento: "Contact", datos: { content_name: origen } });
    },
    true,
  );
}
