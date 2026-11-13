/**
 * Hoja lateral (a la derecha en computadora, desde abajo en celular).
 * Usa <dialog>: el navegador se encarga de atrapar el foco, cerrar con
 * Esc y bloquear el fondo, que es lo accesible.
 */
import { h, vaciar } from "../../compartido/dom";

let dialogo: HTMLDialogElement | null = null;
let alCerrarActual: (() => void) | null = null;
/** Si existe y devuelve false, la hoja no se cierra (p. ej. registro a medias). */
let antesDeCerrarActual: (() => boolean) | null = null;

/** Cerrar respetando la guarda (Esc, fondo, ×, botón Atrás). */
function intentarCerrar() {
  if (!dialogo?.open) return;
  if (antesDeCerrarActual && !antesDeCerrarActual()) return;
  dialogo.close();
}

export interface Hoja {
  cuerpo: HTMLElement;
  cerrar: () => void;
  /** reemplaza el contenido sin cerrar ni volver a animar */
  pintar: (...nodos: Node[]) => void;
}

export function abrirHoja(opciones: {
  etiqueta: string;
  clase?: string;
  alCerrar?: () => void;
  /** devuelve false para no cerrar (se puede preguntar antes con un confirm) */
  antesDeCerrar?: () => boolean;
}): Hoja {
  if (!dialogo) {
    const nuevo = h("dialog", { clase: "hoja" });
    dialogo = nuevo;
    nuevo.addEventListener("close", () => {
      const fn = alCerrarActual;
      alCerrarActual = null;
      document.documentElement.classList.remove("con-hoja");
      fn?.();
    });
    // clic en el fondo oscuro cierra (si la guarda lo permite)
    nuevo.addEventListener("click", (e) => {
      if (e.target === nuevo) intentarCerrar();
    });
    // Esc: el navegador cerraría solo; pasa por la guarda
    nuevo.addEventListener("cancel", (e) => {
      e.preventDefault();
      intentarCerrar();
    });
    document.body.append(nuevo);
  }
  const d = dialogo;
  // si ya había una abierta, se avisa a su dueño que se reemplazó
  const anterior = alCerrarActual;
  alCerrarActual = null;
  antesDeCerrarActual = null;
  if (d.open) anterior?.();

  // el foco inicial va al contenido, no al botón de cerrar
  const cuerpo = h("div", { clase: "hoja-cuerpo", tabindex: -1, autofocus: true });
  const cerrar = () => {
    antesDeCerrarActual = null; // cierre pedido por la propia pantalla
    d.close();
  };
  d.className = `hoja ${opciones.clase ?? ""}`.trim();
  d.setAttribute("aria-label", opciones.etiqueta);
  vaciar(
    d,
    h("button", { clase: "hoja-cerrar", type: "button", "aria-label": "Cerrar", al: { click: intentarCerrar } }, "×"),
    cuerpo,
  );
  alCerrarActual = opciones.alCerrar ?? null;
  antesDeCerrarActual = opciones.antesDeCerrar ?? null;
  if (!d.open) {
    d.showModal();
    document.documentElement.classList.add("con-hoja");
  }
  d.scrollTop = 0;
  return { cuerpo, cerrar, pintar: (...n) => { vaciar(cuerpo, ...n); d.scrollTop = 0; } };
}

/** Cierra la hoja abierta; si tiene guarda (registro a medias), pregunta antes. */
export function cerrarHoja(): void {
  intentarCerrar();
}

/** Pone (o quita, con null) la guarda de la hoja abierta. */
export function guardaDeCierre(fn: (() => boolean) | null): void {
  antesDeCerrarActual = fn;
}

export const hojaAbierta = () => Boolean(dialogo?.open);
