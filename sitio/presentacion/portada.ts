/**
 * Portada: carrusel de diapositivas de la marca (qué es Coco & Cuero,
 * 10 % de bienvenida, cómo funciona, pagos, entregas, garantía) y la
 * franja de beneficios. El contenido vive en ../negocio/portada.ts.
 *
 * Accesible: se pausa con el mouse o el foco encima, tiene botón de
 * pausa, flechas del teclado, se desliza con el dedo y no avanza solo
 * si el sistema pide menos movimiento.
 */
import { h, vaciar } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import { muestras, semillaDelDia } from "../negocio/catalogo";
import {
  BENEFICIOS,
  CADA_DIAPOSITIVA_MS,
  diapositivasPara,
  direccionDeArrastre,
  moverIndice,
  partesDelTitulo,
  type Diapositiva,
} from "../negocio/portada";
import { CIUDADES, DESCUENTO_BIENVENIDA } from "../negocio/tienda";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Iconos de línea propios (constantes, nunca datos de la base). */
const ICONOS: Record<string, string> = {
  sello: `<circle cx="12" cy="9.5" r="5.8"/><path d="M8.6 14.2 7.4 21l4.6-2.4 4.6 2.4-1.2-6.8"/><path d="m9.6 9.6 1.6 1.6 3.2-3.2"/>`,
  camion: `<path d="M2.8 6.5h11v9.2h-11z"/><path d="M13.8 9.6h3.8l2.8 3v3.1h-6.6"/><circle cx="6.6" cy="16.9" r="1.7"/><circle cx="16.8" cy="16.9" r="1.7"/>`,
  tarjeta: `<rect x="2.8" y="5.6" width="18.4" height="12.8" rx="2"/><path d="M2.8 9.6h18.4M6.4 14.6h4"/>`,
  regalo: `<rect x="3.6" y="9" width="16.8" height="11.4" rx="1"/><path d="M2.8 9h18.4M12 9v11.4M12 9c-1.4-3.6-5.6-4.6-5.6-2 0 1.4 2.2 2 5.6 2zm0 0c1.4-3.6 5.6-4.6 5.6-2 0 1.4-2.2 2-5.6 2z"/>`,
  apartar: `<path d="M6.4 3.6h11.2v16.8L12 16.6l-5.6 3.8z"/><path d="m9.4 9.6 1.8 1.8 3.4-3.4"/>`,
  acordar: `<path d="M4 5.4h12.4v8.4H9.2L5.6 16.6v-2.8H4z"/><path d="M16.4 8.6H20v8.4h-1.6v2.6L15 17h-4.6v-3.2"/>`,
  recibir: `<path d="M3.4 8 12 3.6 20.6 8v8.6L12 21l-8.6-4.4z"/><path d="M3.4 8 12 12.4 20.6 8M12 12.4V21"/>`,
  efectivo: `<rect x="2.8" y="6" width="18.4" height="12" rx="1.4"/><circle cx="12" cy="12" r="2.8"/><path d="M5.6 9v6M18.4 9v6"/>`,
  transferencia: `<rect x="6.6" y="2.8" width="10.8" height="18.4" rx="2"/><path d="M9.4 9.6h5.2l-1.6-1.6M14.6 13.4H9.4l1.6 1.6"/>`,
  deposito: `<path d="M3.2 9.4 12 4l8.8 5.4zM5 9.8v7.6M9.4 9.8v7.6M14.6 9.8v7.6M19 9.8v7.6M3.2 19.6h17.6"/>`,
  pausa: `<path d="M9 5.5v13M15 5.5v13"/>`,
  seguir: `<path d="M7.5 5.2 18.5 12l-11 6.8z"/>`,
  izquierda: `<path d="M14.8 5.4 8.2 12l6.6 6.6"/>`,
  derecha: `<path d="m9.2 5.4 6.6 6.6-6.6 6.6"/>`,
};

function icono(nombre: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = ICONOS[nombre] ?? "";
  return el;
}

function titulo(d: Diapositiva, principal: boolean): HTMLElement {
  return h(
    principal ? "h1" : "h2",
    { clase: "diapo-titulo" },
    partesDelTitulo(d.titulo).map((p) => (p.cursiva ? h("em", null, p.texto) : document.createTextNode(p.texto))),
  );
}

/** Tarjeta blanca con la foto de un perfume (la misma idea que el collage). */
function tarjetita(clase: string): HTMLElement {
  return h("span", { clase: `diapo-foto ${clase}`, "aria-hidden": "true" });
}

function pintarFoto(t: Element, p: PerfumePublico | undefined) {
  const src = p ? urlDeFoto(p.imagenUrl) : null;
  vaciar(t as HTMLElement, ...(src ? [h("img", { src, alt: "", decoding: "async", width: 360, height: 360 })] : []));
}

function arte(d: Diapositiva): HTMLElement {
  switch (d.arte) {
    case "frascos":
      return h("div", { clase: "arte arte-frascos" }, tarjetita("f1"), tarjetita("f2"), tarjetita("f3"));
    case "numero":
      return h("div", { clase: "arte arte-numero" }, h("span", { clase: "numero-grande", "aria-hidden": "true" }, String(Math.round(DESCUENTO_BIENVENIDA * 100)), h("small", null, "%")), tarjetita("f1"));
    case "pasos":
      return h(
        "ol",
        { clase: "arte arte-pasos" },
        [
          ["apartar", "Apartas", "en línea o por WhatsApp"],
          ["acordar", "Acordamos", "pago y fecha de entrega"],
          ["recibir", "Lo recibes", "revisado y sellado"],
        ].map(([i, t, x]) => h("li", null, h("span", { clase: "paso-icono" }, icono(i!)), h("strong", null, t), h("span", null, x))),
      );
    case "pago":
      return h(
        "ul",
        { clase: "arte arte-pago" },
        [
          ["efectivo", "Efectivo", "al recibir"],
          ["transferencia", "Transferencia", "SPEI"],
          ["deposito", "Depósito", "banco o tienda"],
        ].map(([i, t, x]) => h("li", null, icono(i!), h("strong", null, t), h("span", null, x))),
      );
    case "mapa":
      return h(
        "div",
        { clase: "arte arte-mapa" },
        h(
          "ul",
          { clase: "ciudades" },
          CIUDADES.map((c) => h("li", null, h("span", { clase: "pin", "aria-hidden": "true" }), c, h("small", null, "Recolecta gratis"))),
        ),
        h("p", { clase: "republica" }, icono("camion"), "Envío por paquetería a cualquier estado"),
      );
    case "sello":
      return h(
        "div",
        { clase: "arte arte-sello" },
        h("span", { clase: "sello", "aria-hidden": "true" }, h("strong", null, "100 %"), h("span", null, "Originales")),
        tarjetita("f1"),
      );
  }
}

export interface AccionesPortada {
  catalogo: () => void;
  registro: () => void;
  comoPedir: () => void;
  originales: () => void;
  whatsapp: string;
}

export function iniciarPortada(
  raiz: HTMLElement,
  franja: HTMLElement,
  acciones: AccionesPortada,
  puedeUsarBienvenida: () => boolean,
) {
  const menosMovimiento = matchMedia("(prefers-reduced-motion: reduce)");
  const pista = h("div", { clase: "carrusel-pista" });
  const puntos = h("div", { clase: "carrusel-puntos", role: "group", "aria-label": "Elegir diapositiva" });
  const anterior = h("button", { type: "button", clase: "carrusel-flecha", "aria-label": "Diapositiva anterior" }, icono("izquierda"));
  const siguiente = h("button", { type: "button", clase: "carrusel-flecha", "aria-label": "Diapositiva siguiente" }, icono("derecha"));
  const pausa = h("button", { type: "button", clase: "carrusel-pausa" });

  let diapos: Diapositiva[] = [];
  let indice = 0;
  let pausadoPorUsuario = menosMovimiento.matches;
  let encima = false;
  let visible = true;
  let reloj: number | undefined;
  let perfumes: PerfumePublico[] = [];

  const accion = (d: Diapositiva) => {
    const destino = d.accion.destino;
    if (destino === "whatsapp") {
      return h("a", { clase: "boton diapo-boton", href: acciones.whatsapp, target: "_blank", rel: "noopener" }, d.accion.texto, h("span", { clase: "flecha", "aria-hidden": "true" }, "→"));
    }
    const ir = { catalogo: acciones.catalogo, registro: acciones.registro, "como-pedir": acciones.comoPedir, originales: acciones.originales }[destino];
    return h("button", { type: "button", clase: "boton diapo-boton", al: { click: ir } }, d.accion.texto, h("span", { clase: "flecha", "aria-hidden": "true" }, "→"));
  };

  function construir() {
    const clave = diapos[indice]?.clave;
    diapos = diapositivasPara(puedeUsarBienvenida());
    indice = Math.max(0, diapos.findIndex((d) => d.clave === clave));
    vaciar(
      pista,
      ...diapos.map((d, i) =>
        h(
          "article",
          {
            clase: `diapo diapo-${d.tema}`,
            role: "group",
            "aria-roledescription": "diapositiva",
            "aria-label": `${i + 1} de ${diapos.length}: ${d.rotulo}`,
            dataset: { clave: d.clave },
          },
          h(
            "div",
            { clase: "caja diapo-caja" },
            h("div", { clase: "diapo-texto" }, h("p", { clase: "diapo-rotulo" }, d.rotulo), titulo(d, i === 0), h("p", { clase: "diapo-entrada" }, d.texto), accion(d)),
            arte(d),
          ),
        ),
      ),
    );
    vaciar(
      puntos,
      ...diapos.map((d, i) =>
        h("button", { type: "button", clase: "carrusel-punto", "aria-label": `Ir a: ${d.rotulo}`, al: { click: () => ir(i, true) } }, h("span")),
      ),
    );
    llenarFotos();
    mostrar();
  }

  function llenarFotos() {
    if (!perfumes.length) return;
    const semilla = semillaDelDia(new Date());
    pista.querySelectorAll<HTMLElement>(".diapo").forEach((el, i) => {
      const fotos = el.querySelectorAll(".diapo-foto");
      const criterio =
        el.dataset.clave === "originales" ? (p: PerfumePublico) => p.categoria === "disenador" : el.dataset.clave === "bienvenida" ? (p: PerfumePublico) => p.genero === "dama" : () => true;
      const lista = muestras(perfumes, criterio, fotos.length, semilla + 31 * (i + 1));
      fotos.forEach((t, j) => pintarFoto(t, lista[j] ?? muestras(perfumes, () => true, 1, semilla + j)[0]));
    });
  }

  function mostrar() {
    raiz.dataset.tema = diapos[indice]?.tema ?? "cuero";
    pista.querySelectorAll<HTMLElement>(".diapo").forEach((el, i) => {
      const activa = i === indice;
      el.classList.toggle("activa", activa);
      el.setAttribute("aria-hidden", String(!activa));
      el.toggleAttribute("inert", !activa);
    });
    puntos.querySelectorAll<HTMLButtonElement>(".carrusel-punto").forEach((b, i) => {
      b.classList.toggle("activo", i === indice);
      b.setAttribute("aria-current", String(i === indice));
    });
    programar();
  }

  const detenido = () => pausadoPorUsuario || encima || !visible || document.hidden || diapos.length < 2;

  function programar() {
    clearTimeout(reloj);
    raiz.classList.toggle("en-pausa", detenido());
    // el icono solo se cambia si cambió el estado (reemplazarlo a mitad
    // de un clic hace que el navegador pierda ese clic)
    if (pausa.dataset.pausado !== String(pausadoPorUsuario)) {
      pausa.dataset.pausado = String(pausadoPorUsuario);
      vaciar(pausa, icono(pausadoPorUsuario ? "seguir" : "pausa"));
      pausa.setAttribute("aria-label", pausadoPorUsuario ? "Reanudar diapositivas" : "Pausar diapositivas");
    }
    if (detenido()) return;
    // la barrita del punto activo vuelve a empezar
    const barra = puntos.querySelector<HTMLElement>(".carrusel-punto.activo span");
    if (barra) {
      barra.style.animation = "none";
      void barra.offsetWidth;
      barra.style.animation = "";
    }
    reloj = window.setTimeout(() => ir(moverIndice(indice, diapos.length, 1)), CADA_DIAPOSITIVA_MS);
  }

  function ir(i: number, porUsuario = false) {
    indice = moverIndice(i, diapos.length, 0);
    mostrar();
    if (porUsuario) (pista.querySelector(".diapo.activa .diapo-boton") as HTMLElement | null)?.blur();
  }

  anterior.addEventListener("click", () => ir(moverIndice(indice, diapos.length, -1), true));
  siguiente.addEventListener("click", () => ir(moverIndice(indice, diapos.length, 1), true));
  pausa.addEventListener("click", () => {
    pausadoPorUsuario = !pausadoPorUsuario;
    programar();
  });
  raiz.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") {
      encima = true;
      programar();
    }
  });
  raiz.addEventListener("pointerleave", () => {
    encima = false;
    programar();
  });
  raiz.addEventListener("focusin", () => {
    encima = true;
    programar();
  });
  raiz.addEventListener("focusout", (e) => {
    if (!raiz.contains(e.relatedTarget as Node | null)) {
      encima = false;
      programar();
    }
  });
  raiz.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") ir(moverIndice(indice, diapos.length, 1), true);
    if (e.key === "ArrowLeft") ir(moverIndice(indice, diapos.length, -1), true);
  });
  // deslizar con el dedo
  let inicio: { x: number; y: number } | null = null;
  pista.addEventListener("pointerdown", (e) => (inicio = { x: e.clientX, y: e.clientY }));
  pista.addEventListener("pointerup", (e) => {
    if (!inicio) return;
    const dir = direccionDeArrastre(e.clientX - inicio.x, e.clientY - inicio.y);
    inicio = null;
    if (dir) ir(moverIndice(indice, diapos.length, dir), true);
  });
  document.addEventListener("visibilitychange", programar);
  new IntersectionObserver(([e]) => {
    visible = e!.isIntersecting;
    programar();
  }).observe(raiz);

  vaciar(
    raiz,
    pista,
    h("div", { clase: "caja carrusel-controles" }, anterior, puntos, pausa, siguiente),
  );
  vaciar(
    franja,
    h(
      "ul",
      { clase: "caja beneficios-lista" },
      BENEFICIOS.map((b) => h("li", null, icono(b.icono), h("span", null, h("strong", null, b.titulo), h("small", null, b.texto)))),
    ),
  );
  construir();

  return {
    /** Ya cargó el catálogo: se ponen fotos reales en las diapositivas. */
    conPerfumes(lista: PerfumePublico[]) {
      perfumes = lista;
      llenarFotos();
    },
    /** Cambió la sesión: la del 10 % aparece o desaparece. */
    refrescar() {
      const antes = diapos.map((d) => d.clave).join();
      if (diapositivasPara(puedeUsarBienvenida()).map((d) => d.clave).join() !== antes) construir();
    },
  };
}
