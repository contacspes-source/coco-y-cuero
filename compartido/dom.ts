/**
 * Crear elementos del DOM sin innerHTML. Todo el texto entra con
 * textContent, así que un nombre como "<script>" se muestra como texto
 * y nunca se ejecuta. Lo usan el panel y el sitio público.
 */

type Hijo = Node | string | number | null | undefined | false;
export type Props = Record<string, unknown> & {
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
