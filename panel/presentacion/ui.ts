/**
 * Utilitarios de interfaz. Todo el texto entra con textContent, nunca
 * con innerHTML, así que un nombre de perfume como "<script>" se ve
 * como texto y no se ejecuta.
 */

import { h, type Props } from "../../compartido/dom";

export { avisar, campo, conBotonOcupado, h, marcarErrores, vaciar } from "../../compartido/dom";

// ------------------------------------------------------------ formato
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const porcentaje = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

export const fmtPesos = (n: number | null) => (n === null ? "—" : pesos.format(n));
export const fmtPorcentaje = (n: number | null) => (n === null ? "—" : porcentaje.format(n));

export { urlDeFoto } from "../../compartido/texto";

// ------------------------------------------------------------ diálogo
/**
 * Confirmación con <dialog> en lugar de window.confirm, que se ve fuera
 * de lugar y en algunos navegadores bloquea la pestaña.
 */
export function confirmar(opciones: {
  titulo: string;
  texto: string;
  aceptar: string;
  peligro?: boolean;
}): Promise<boolean> {
  return new Promise((resolver) => {
    const dialogo = h(
      "dialog",
      { clase: "dialogo" },
      h(
        "form",
        { method: "dialog" },
        h("h2", null, opciones.titulo),
        h("p", null, opciones.texto),
        h(
          "div",
          { clase: "dialogo-acciones" },
          h("button", { clase: "boton boton-fantasma", value: "no" }, "Cancelar"),
          h("button", { clase: `boton ${opciones.peligro ? "boton-peligro" : "boton-primario"}`, value: "si" }, opciones.aceptar),
        ),
      ),
    );
    dialogo.addEventListener("close", () => {
      resolver(dialogo.returnValue === "si");
      dialogo.remove();
    });
    document.body.append(dialogo);
    dialogo.showModal();
  });
}

// ------------------------------------------------------------ controles
export function selector(
  opciones: { valor: string; texto: string }[],
  valor: string,
  alCambiar: (v: string) => void,
  atributos: Props = {},
): HTMLSelectElement {
  const s = h(
    "select",
    { ...atributos, al: { change: () => alCambiar(s.value) } },
    opciones.map((o) => h("option", { value: o.valor }, o.texto)),
  );
  s.value = valor;
  return s;
}

export function cargando(texto = "Cargando…"): HTMLElement {
  return h("div", { clase: "cargando" }, h("span", { clase: "giro", "aria-hidden": "true" }), texto);
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Ícono de WhatsApp (constante, no viene de datos). */
export function iconoWhatsApp(): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", "M12 2a10 10 0 0 0-8.7 15l-1.2 4.4 4.5-1.2A10 10 0 1 0 12 2zm5.1 13.8c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.8-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.1c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.2.1.4.1.6-.1l.8-.9c.2-.2.3-.2.6-.1l1.9.9c.2.1.4.2.5.3.1.2.1.7-.2 1.3z");
  el.append(p);
  return el;
}
