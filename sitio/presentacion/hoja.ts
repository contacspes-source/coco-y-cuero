/**
 * Hoja lateral (a la derecha en computadora, desde abajo en celular).
 * Usa <dialog>: el navegador se encarga de atrapar el foco, cerrar con
 * Esc y bloquear el fondo, que es lo accesible.
 */
import { h, vaciar } from "../../compartido/dom";

let dialogo: HTMLDialogElement | null = null;
let alCerrarActual: (() => void) | null = null;

export interface Hoja {
  cuerpo: HTMLElement;
  cerrar: () => void;
  /** reemplaza el contenido sin cerrar ni volver a animar */
  pintar: (...nodos: Node[]) => void;
}

export function abrirHoja(opciones: { etiqueta: string; clase?: string; alCerrar?: () => void }): Hoja {
  if (!dialogo) {
    const nuevo = h("dialog", { clase: "hoja" });
    dialogo = nuevo;
    nuevo.addEventListener("close", () => {
      const fn = alCerrarActual;
      alCerrarActual = null;
      document.documentElement.classList.remove("con-hoja");
      fn?.();
    });
    // clic en el fondo oscuro cierra
    nuevo.addEventListener("click", (e) => {
      if (e.target === nuevo) nuevo.close();
    });
    document.body.append(nuevo);
  }
  const d = dialogo;
  // si ya había una abierta, se avisa a su dueño que se reemplazó
  const anterior = alCerrarActual;
  alCerrarActual = null;
  if (d.open) anterior?.();

  // el foco inicial va al contenido, no al botón de cerrar
  const cuerpo = h("div", { clase: "hoja-cuerpo", tabindex: -1, autofocus: true });
  const cerrar = () => d.close();
  d.className = `hoja ${opciones.clase ?? ""}`.trim();
  d.setAttribute("aria-label", opciones.etiqueta);
  vaciar(
    d,
    h("button", { clase: "hoja-cerrar", type: "button", "aria-label": "Cerrar", al: { click: cerrar } }, "×"),
    cuerpo,
  );
  alCerrarActual = opciones.alCerrar ?? null;
  if (!d.open) {
    d.showModal();
    document.documentElement.classList.add("con-hoja");
  }
  d.scrollTop = 0;
  return { cuerpo, cerrar, pintar: (...n) => { vaciar(cuerpo, ...n); d.scrollTop = 0; } };
}

export function cerrarHoja(): void {
  dialogo?.close();
}

export const hojaAbierta = () => Boolean(dialogo?.open);
