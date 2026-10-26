/**
 * Iconos de línea del kit visual. Son constantes escritas aquí (nunca
 * datos de la base), por eso es seguro insertarlas como marcado SVG.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

const TRAZOS: Record<string, string> = {
  cuero: `<path d="M12 3.4c3 1 5.2 1.6 7.4 1.6-.5 2.6.3 4-1.2 6.4-1.4 2.3-1 4.6-1.9 6.2-.9 1.5-2.6 2.6-4.3 3-1.7-.4-3.4-1.5-4.3-3-.9-1.6-.5-3.9-1.9-6.2C4.3 9 5.1 7.6 4.6 5c2.2 0 4.4-.6 7.4-1.6z"/>`,
  dulce: `<circle cx="12" cy="12" r="7.6"/><path d="M8.3 9.4c1.6 1.2 2.8 3 3.4 5M15.9 9.9c-1.3 1.3-2.2 3-2.6 4.9"/>`,
  floral: `<circle cx="12" cy="12" r="2.3"/><path d="M12 9.7c0-2.6-.9-4.3-2.6-4.3S7.2 7.3 9.4 9.4M14.3 12c2.6 0 4.3-.9 4.3-2.6s-1.9-2.2-4 0M12 14.3c0 2.6.9 4.3 2.6 4.3s2.2-1.9 0-4M9.7 12c-2.6 0-4.3.9-4.3 2.6s1.9 2.2 4 0"/>`,
  amaderado: `<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2.6"/>`,
  fresco: `<path d="M3.6 9.3c2.3-2 4.5-2 6.8 0s4.5 2 6.8 0 4.5-2 6.8 0M3.6 14.7c2.3-2 4.5-2 6.8 0s4.5 2 6.8 0 4.5-2 6.8 0"/>`,
  notas: `<path d="M12 4.4c-3.4 3-5.1 5.6-5.1 8.3 0 3 2.3 5.3 5.1 5.3s5.1-2.3 5.1-5.3c0-2.7-1.7-5.3-5.1-8.3z"/><path d="M12 9.6v6.4"/>`,
};

const WHATSAPP = `<path d="M12 2a10 10 0 0 0-8.7 15l-1.2 4.4 4.5-1.2A10 10 0 1 0 12 2zm5.1 13.8c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.8-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.1c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.2.1.4.1.6-.1l.8-.9c.2-.2.3-.2.6-.1l1.9.9c.2.1.4.2.5.3.1.2.1.7-.2 1.3z"/>`;

function svg(trazo: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = trazo;
  return el;
}

export const iconoFamilia = (clave: string | null) => svg(TRAZOS[clave ?? "notas"] ?? TRAZOS.notas!);
export const iconoWhatsApp = () => svg(WHATSAPP);
