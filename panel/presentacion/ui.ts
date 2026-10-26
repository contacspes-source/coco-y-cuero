/**
 * Utilitarios de interfaz. Todo el texto entra con textContent, nunca
 * con innerHTML, así que un nombre de perfume como "<script>" se ve
 * como texto y no se ejecuta.
 */

type Hijo = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & {
  clase?: string;
  al?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  etiqueta: K,
  props: Props | null = null,
  ...hijos: (Hijo | Hijo[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(etiqueta);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "clase") el.className = String(v);
      else if (k === "al") {
        for (const [evento, fn] of Object.entries(v as Props["al"] & object)) {
          el.addEventListener(evento, fn as EventListener);
        }
      } else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export function vaciar(el: Element, ...nuevo: Node[]): void {
  el.replaceChildren(...nuevo);
}

// ------------------------------------------------------------ formato
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const porcentaje = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

export const fmtPesos = (n: number | null) => (n === null ? "—" : pesos.format(n));
export const fmtPorcentaje = (n: number | null) => (n === null ? "—" : porcentaje.format(n));

/** Las fotos viejas viven en el sitio ("assets/img/…"), las nuevas en Storage. */
export function urlDeFoto(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `/${url.replace(/^\/+/, "")}`;
}

// ------------------------------------------------------------ avisos
let contenedorAvisos: HTMLElement | null = null;

export function avisar(mensaje: string, tipo: "exito" | "error" | "info" = "info"): void {
  if (!contenedorAvisos) {
    contenedorAvisos = h("div", { clase: "avisos", role: "status", "aria-live": "polite" });
    document.body.append(contenedorAvisos);
  }
  const aviso = h("div", { clase: `aviso aviso-${tipo}` }, mensaje);
  contenedorAvisos.append(aviso);
  const quitar = () => {
    aviso.classList.add("saliendo");
    setTimeout(() => aviso.remove(), 250);
  };
  aviso.addEventListener("click", quitar);
  setTimeout(quitar, tipo === "error" ? 7000 : 3500);
}

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
export function campo(etiqueta: string, control: HTMLElement, opciones: { nombre?: string; ayuda?: string } = {}) {
  const id = control.id || `c-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h(
    "div",
    { clase: "campo", dataset: opciones.nombre ? { campo: opciones.nombre } : undefined },
    h("label", { for: id }, etiqueta),
    control,
    opciones.ayuda ? h("p", { clase: "campo-ayuda" }, opciones.ayuda) : null,
    h("p", { clase: "campo-error", role: "alert" }),
  );
}

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

/** Pone los mensajes de error junto a cada campo (data-campo="…"). */
export function marcarErrores(raiz: HTMLElement, problemas: { campo: string; mensaje: string }[]): void {
  raiz.querySelectorAll<HTMLElement>("[data-campo]").forEach((c) => {
    c.classList.remove("con-error");
    const p = c.querySelector(".campo-error");
    if (p) p.textContent = "";
  });
  for (const pr of problemas) {
    const c = raiz.querySelector<HTMLElement>(`[data-campo="${CSS.escape(pr.campo)}"]`);
    if (!c) continue;
    c.classList.add("con-error");
    const p = c.querySelector(".campo-error");
    if (p && !p.textContent) p.textContent = pr.mensaje;
  }
  raiz.querySelector<HTMLElement>(".con-error input, .con-error select")?.focus();
}

export function cargando(texto = "Cargando…"): HTMLElement {
  return h("div", { clase: "cargando" }, h("span", { clase: "giro", "aria-hidden": "true" }), texto);
}

/** Desactiva un botón mientras corre una promesa. */
export async function conBotonOcupado<T>(boton: HTMLButtonElement, texto: string, tarea: () => Promise<T>): Promise<T> {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = texto;
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}
