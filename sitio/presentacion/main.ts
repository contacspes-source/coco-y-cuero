/**
 * Pantalla del sitio público: pinta controles y tarjetas y traduce
 * clics a cambios de filtros. Las reglas viven en ../negocio.
 */
import "../estilos.css";
import { h, vaciar } from "../../compartido/dom";
import { SUPABASE_URL } from "../../compartido/config";
import { sinAcentos, urlDeFoto, urlDirectaDeFoto, usarFotosPorNuestroDominio } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  CATEGORIAS,
  CONCENTRACIONES,
  FAMILIAS,
  PRESENTACIONES,
  RANGOS_PRECIO,
  claveDeTipo,
  cuantosExtra,
  marcasDe,
  GENEROS,
  SIN_FILTROS,
  conteos,
  escribirFiltros,
  familiaPrincipal,
  filtrar,
  hayFiltros,
  leerFiltros,
  mensajeWhatsApp,
  precioDesde,
  textoNotas,
  conPerfume,
  leerPerfumeAbierto,
  filtrosActivos,
  quitarFiltro,
  semillaDelDia,
  sugerenciasDeBusqueda,
  iniciarRotacion,
  siguienteCambio,
  type Rotacion,
  type Filtros,
  type Orden,
} from "../negocio/catalogo";
import { cargarCatalogo, conviene } from "../negocio/servicio";
import { CONFIG, linkWhatsApp } from "./config";
import { iconoFamilia, iconoWhatsApp } from "./iconos";
import { LOGOS_MARCAS } from "./logos-marcas";
import { abrirApartar, abrirRegistro, estadoBienvenida, iniciarCuenta } from "./cuenta";
import { vistaDetalle } from "./detalle";
import { iniciarPortada } from "./portada";
import { abrirHoja, cerrarHoja, hojaAbierta } from "./hoja";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const rejilla = $("rejilla");
const vacio = $<HTMLParagraphElement>("vacio");
const vacioTexto = $("vacio-texto");
const conteo = $("conteo");
const resumen = $("resumen");
const generos = $("generos");
const categorias = $("categorias");
const presentaciones = $("presentaciones");
const precios = $("precios");
const tipos = $("tipos");
const marcas = $("marcas");
const marcasCinta = $("marcas-cinta");
const marcasPista = $("marcas-pista");
const marcasBuscar = $<HTMLInputElement>("marcas-buscar");
const marcasTodas = $<HTMLButtonElement>("marcas-todas");
const marcasNota = $("marcas-nota");
const panelCuenta = $("panel-cuenta");
const panelCajon = $("panel-cajon");
const botonesPanel = [...document.querySelectorAll<HTMLButtonElement>(".panel-boton[data-sec]")];
const ruletaEscena = $("aromas-escena");
const ruletaRueda = $("aromas-rueda");
const ruletaPuntos = $("aromas-puntos");
const ruletaAyuda = $("aromas-ayuda");
const buscador = $<HTMLInputElement>("buscador");
const orden = $<HTMLSelectElement>("orden");
const limpiar = $<HTMLButtonElement>("limpiar");
const collage = $("collage");
const sugerencias = $("sugerencias");
const activos = $("activos");
const filtrosFila = $("filtros-fila");
const barraFija = $("barra-fija");
const barraFijaTexto = $("barra-fija-texto");
const barraFijaChips = $("barra-fija-chips");
const SEMILLA = semillaDelDia(new Date());

let perfumes: PerfumePublico[] = [];
let filtros: Filtros = leerFiltros(location.search);

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const nombreGenero = (clave: string) => GENEROS.find((g) => g.clave === clave)?.nombre ?? "";

// ------------------------------------------------------------ detalle
const enlaceDe = (p: PerfumePublico) => `${location.pathname}${conPerfume(location.search, p.id)}`;
const enlaceCompleto = (p: PerfumePublico) => `${location.origin}/?perfume=${p.id}`;

function abrirDetalle(p: PerfumePublico, empujar = true) {
  if (empujar && leerPerfumeAbierto(location.search) !== p.id) {
    history.pushState({ perfume: p.id }, "", enlaceDe(p));
  }
  const hoja = abrirHoja({
    etiqueta: `${p.marca} ${p.nombre}`,
    clase: "hoja-detalle",
    alCerrar: () => {
      if (leerPerfumeAbierto(location.search) !== null) {
        history.replaceState(null, "", `${location.pathname}${conPerfume(location.search, null)}`);
      }
      document.title = TITULO;
    },
  });
  document.title = `${p.marca} ${p.nombre} · Coco & Cuero`;
  hoja.pintar(
    vistaDetalle(p, perfumes, {
      apartar: (perfume, presentacion) => void abrirApartar(perfume, presentacion, () => abrirDetalle(perfume, false)),
      abrirOtro: (otro) => abrirDetalle(otro),
      enlace: enlaceCompleto,
      bienvenida: estadoBienvenida,
      crearCuenta: () => void abrirRegistro(() => abrirDetalle(p, false)),
    }),
  );
}

const TITULO = document.title;

// atrás/adelante del navegador abre o cierra el detalle
window.addEventListener("popstate", () => {
  const id = leerPerfumeAbierto(location.search);
  const p = id === null ? undefined : perfumes.find((x) => x.id === id);
  if (p) abrirDetalle(p, false);
  else if (hojaAbierta()) cerrarHoja();
});

// ------------------------------------------------------------ tarjeta
function tarjeta(p: PerfumePublico): HTMLElement {
  const foto = urlDeFoto(p.imagenUrl);
  const desde = precioDesde(p);
  const familia = familiaPrincipal(p);
  const notas = textoNotas(p);
  const categoria = CATEGORIAS.find((c) => c.clave === p.categoria)?.singular ?? "Perfume";
  const detalle = [p.presentaciones.map((x) => `${x.ml} ml`).join(" · "), nombreGenero(p.genero)].filter(Boolean).join(" · ");

  return h(
    "article",
    { clase: "ficha" },
    h(
      "div",
      { clase: "ficha-foto" },
      foto
        ? h("img", { src: foto, alt: `${p.marca} ${p.nombre}`, loading: "lazy", decoding: "async", width: 600, height: 600 })
        : h("span", { clase: "ficha-inicial" }, p.nombre.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase()),
      h("span", { clase: "etiqueta" }, categoria),
    ),
    h(
      "div",
      { clase: "ficha-cuerpo" },
      h("p", { clase: "ficha-marca" }, p.marca),
      h(
        "h3",
        { clase: "ficha-nombre" },
        h(
          "a",
          {
            clase: "ficha-enlace",
            href: enlaceDe(p),
            al: { click: (e) => { e.preventDefault(); abrirDetalle(p); } },
          },
          p.nombre,
        ),
      ),
      h("p", { clase: "ficha-detalle" }, detalle),
      notas ? h("p", { clase: "familia" }, iconoFamilia(familia), h("span", null, notas)) : null,
      h(
        "div",
        { clase: "ficha-pie" },
        h("p", { clase: "precio" }, h("small", null, "Desde"), desde === null ? "Consultar" : pesos.format(desde)),
        h(
          "a",
          {
            clase: "circulo",
            href: linkWhatsApp(mensajeWhatsApp(p)),
            target: "_blank",
            rel: "noopener",
            "aria-label": `Pedir ${p.nombre} por WhatsApp`,
          },
          iconoWhatsApp(),
        ),
      ),
    ),
  );
}

function esqueleto(): HTMLElement[] {
  return Array.from({ length: 8 }, () =>
    h("div", { clase: "ficha ficha-esqueleto", "aria-hidden": "true" }, h("div", { clase: "ficha-foto" }), h("div", { clase: "ficha-cuerpo" }, h("span"), h("span"), h("span"))),
  );
}

// ------------------------------------------------------------ controles
/** Hasta que llega el catálogo no se pinta nada (si no, se verían ceros). */
let cargado = false;

function cambiar(parcial: Partial<Filtros>) {
  filtros = { ...filtros, ...parcial };
  history.replaceState(null, "", `${location.pathname}${escribirFiltros(filtros)}${location.hash}`);
  if (cargado) pintar();
}

// ------------------------------------------------------------ panel de filtros
// Una barra cerrada; cada botón abre solo su sección. Las de una sola
// opción se cierran al elegir; Aroma se queda abierta porque se combinan.
type Seccion = "generos" | "categorias" | "aromas" | "presentaciones" | "precios" | "tipos" | "marcas";
let seccionAbierta: Seccion | null = null;

function abrirSeccion(sec: Seccion | null) {
  seccionAbierta = sec;
  for (const b of botonesPanel) {
    const es = b.dataset.sec === sec;
    b.classList.toggle("abierto", es);
    b.setAttribute("aria-expanded", String(es));
  }
  document.querySelectorAll<HTMLElement>(".panel-seccion").forEach((s) => (s.hidden = s.id !== `sec-${sec}`));
  panelCajon.classList.toggle("abierto", sec !== null);
  if (sec === "aromas") requestAnimationFrame(() => medirRuleta(true));
}
for (const b of botonesPanel) b.addEventListener("click", () => abrirSeccion(seccionAbierta === b.dataset.sec ? null : (b.dataset.sec as Seccion)));
document.querySelectorAll<HTMLButtonElement>("[data-cerrar]").forEach((b) => b.addEventListener("click", () => abrirSeccion(null)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && seccionAbierta) abrirSeccion(null);
});
/** Elegir en un grupo de una sola opción cierra el cajón. */
const elegirYCerrar = (parcial: Partial<Filtros>) => {
  cambiar(parcial);
  setTimeout(() => abrirSeccion(null), 220);
};

const FOTOS_FILTRO = "/assets/img/filtros/";
const ICONO_PALOMA = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M5 12l5 5 9-10");
  svg.append(p);
  return h("span", { clase: "ff-paloma" }, svg);
};

/** Ficha de filtro: con foto (frasco) o lisa (solo texto). */
function fichaFiltro(opciones: { nombre: string; n: number | null; activa: boolean; foto?: string; alClic: () => void; desactivada?: boolean }) {
  const { nombre, n, activa, foto, alClic, desactivada } = opciones;
  const cuenta = n === null ? null : `${n} ${n === 1 ? "perfume" : "perfumes"}`;
  return h(
    "button",
    {
      type: "button",
      clase: `ff${foto ? " ff-foto" : " ff-lisa"}${activa ? " activa" : ""}`,
      "aria-pressed": String(activa),
      disabled: Boolean(desactivada) && !activa,
      al: { click: alClic },
    },
    foto ? h("img", { src: FOTOS_FILTRO + foto, alt: "", loading: "lazy", decoding: "async" }) : null,
    foto ? h("span", { clase: "ff-velo", "aria-hidden": "true" }) : null,
    h("span", { clase: "ff-texto" }, h("span", { clase: "ff-nombre" }, nombre), cuenta ? h("span", { clase: "ff-cuenta" }, cuenta) : null),
    ICONO_PALOMA(),
  );
}

// ---- ruleta de aromas (se construye una vez; pintarControles solo la actualiza)
const N_AROMAS = FAMILIAS.length;
const PASO = 360 / N_AROMAS;
const FOTO_AROMA: Record<string, string> = { cuero: "aroma-cuero.webp", dulce: "aroma-dulce.webp", floral: "aroma-floral.webp", amaderado: "aroma-amaderado.webp", fresco: "aroma-fresco.webp" };
let giro = 0; // tarjeta al frente (puede crecer sin tope; se usa módulo N)
let arrastre = 0; // desplazamiento mientras se arrastra, en tarjetas
let anchoTarjeta = 420;
let radio = 0;
let seMovio = false;
const tarjetasAroma: HTMLButtonElement[] = [];

const alFrente = () => ((Math.round(giro + arrastre) % N_AROMAS) + N_AROMAS) % N_AROMAS;

function medirRuleta(sinAnimar = false) {
  const ancho = ruletaEscena.clientWidth || 900;
  anchoTarjeta = Math.min(420, Math.max(240, ancho * 0.46));
  radio = anchoTarjeta / 2 / Math.tan(Math.PI / N_AROMAS) + 10;
  ruletaEscena.style.setProperty("--w", `${anchoTarjeta}px`);
  tarjetasAroma.forEach((t, i) => (t.style.transform = `rotateY(${i * PASO}deg) translateZ(${radio}px)`));
  if (sinAnimar) ruletaRueda.classList.add("sin-animar");
  pintarRuleta();
  if (sinAnimar) requestAnimationFrame(() => requestAnimationFrame(() => ruletaRueda.classList.remove("sin-animar")));
}

function pintarRuleta() {
  ruletaRueda.style.transform = `translateZ(${-radio}px) rotateY(${-(giro + arrastre) * PASO}deg)`;
  const frente = alFrente();
  tarjetasAroma.forEach((t, i) => {
    let d = Math.abs((((i - (giro + arrastre)) % N_AROMAS) + N_AROMAS) % N_AROMAS);
    d = Math.min(d, N_AROMAS - d);
    t.style.setProperty("--sombra", String(Math.min(0.72, d * 0.3)));
    t.classList.toggle("frente", i === frente);
    t.tabIndex = i === frente ? 0 : -1;
  });
  [...ruletaPuntos.children].forEach((p, i) => {
    p.classList.toggle("act", i === frente);
    p.classList.toggle("sel", filtros.aromas.includes(FAMILIAS[i]!.clave));
  });
  const f = FAMILIAS[frente]!;
  ruletaAyuda.textContent = filtros.aromas.includes(f.clave) ? `${f.corto} · seleccionado, toca para quitar` : `${f.corto} · toca para seleccionar`;
}

function irAAroma(i: number) {
  let d = i - alFrente();
  if (d > N_AROMAS / 2) d -= N_AROMAS;
  if (d < -N_AROMAS / 2) d += N_AROMAS;
  giro += d;
  pintarRuleta();
}

function alternarAroma(clave: string) {
  const activo = filtros.aromas.includes(clave);
  cambiar({ aromas: activo ? filtros.aromas.filter((a) => a !== clave) : [...filtros.aromas, clave] });
}

function iniciarRuleta() {
  vaciar(
    ruletaRueda,
    ...FAMILIAS.map((f, i) => {
      const t = h(
        "button",
        {
          type: "button",
          clase: "ruleta-tarjeta",
          dataset: { familia: f.clave },
          "aria-pressed": "false",
          al: {
            click: () => {
              if (seMovio) return;
              if (alFrente() === i) alternarAroma(f.clave);
              else irAAroma(i);
            },
          },
        },
        h("img", { src: FOTOS_FILTRO + (FOTO_AROMA[f.clave] ?? ""), alt: "", loading: "lazy", decoding: "async" }),
        h("span", { clase: "ruleta-sombra", "aria-hidden": "true" }),
        h("span", { clase: "ruleta-texto" }, h("span", { clase: "ruleta-nombre" }, f.corto), h("span", { clase: "ruleta-cuenta" })),
        ICONO_PALOMA(),
      );
      tarjetasAroma.push(t);
      return t;
    }),
  );
  vaciar(ruletaPuntos, ...FAMILIAS.map((_, i) => h("i", { al: { click: () => irAAroma(i) } })));
  $("aromas-ant").addEventListener("click", () => { giro--; pintarRuleta(); });
  $("aromas-sig").addEventListener("click", () => { giro++; pintarRuleta(); });

  // arrastrar con el dedo o el mouse
  let x0: number | null = null;
  ruletaEscena.addEventListener("pointerdown", (e) => { x0 = e.clientX; seMovio = false; ruletaRueda.classList.add("sin-animar"); });
  ruletaEscena.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 5) seMovio = true;
    arrastre = -dx / anchoTarjeta;
    pintarRuleta();
  });
  const soltar = () => {
    if (x0 === null) return;
    giro = Math.round(giro + arrastre);
    arrastre = 0;
    x0 = null;
    ruletaRueda.classList.remove("sin-animar");
    pintarRuleta();
    setTimeout(() => (seMovio = false), 0);
  };
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
  // rueda del mouse (una tarjeta por gesto)
  let ultimaRueda = 0;
  ruletaEscena.addEventListener("wheel", (e) => {
    e.preventDefault();
    const ahora = Date.now();
    if (ahora - ultimaRueda < 350) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8) return;
    ultimaRueda = ahora;
    giro += d > 0 ? 1 : -1;
    pintarRuleta();
  }, { passive: false });
  // teclado, solo con la sección abierta
  document.addEventListener("keydown", (e) => {
    if (seccionAbierta !== "aromas" || (e.target instanceof HTMLElement && e.target.matches("input,select,textarea"))) return;
    if (e.key === "ArrowLeft") { giro--; pintarRuleta(); }
    if (e.key === "ArrowRight") { giro++; pintarRuleta(); }
  });
  window.addEventListener("resize", () => { if (seccionAbierta === "aromas") medirRuleta(true); });
}
iniciarRuleta();

// ---- marcas: cinta infinita de logos
// La pista lleva las marcas dos veces y se desliza de 0 a -50 %, así el
// giro no tiene corte. Se detiene con el mouse encima, con el foco dentro
// o unos segundos después de tocarla. Si se escribe en el buscador, la
// cinta se oculta y aparecen solo las marcas que coinciden, quietas.
const FOTOS_MARCAS = "/assets/img/marcas/";
let marcasHuella = "";

function fichaMarca(m: { clave: string; nombre: string }, copia: boolean): HTMLButtonElement {
  const logo = LOGOS_MARCAS[m.clave];
  const b = h(
    "button",
    {
      type: "button",
      clase: "marca",
      dataset: { marca: m.clave },
      "aria-label": m.nombre,
      "aria-hidden": copia ? "true" : null,
      tabindex: copia ? "-1" : null,
      al: {
        click: () => {
          marcasBuscar.value = "";
          elegirYCerrar({ marca: filtros.marca === m.clave ? null : m.clave });
        },
      },
    },
    h(
      "span",
      { clase: "marca-caja", "aria-hidden": "true" },
      logo ? h("span", { clase: "marca-logo" }) : h("span", { clase: "marca-nombre" }, m.nombre),
    ),
    h("span", { clase: "marca-cuenta", "aria-hidden": "true" }),
  );
  if (logo) {
    const span = b.querySelector<HTMLElement>(".marca-logo")!;
    span.style.setProperty("--logo", `url("${FOTOS_MARCAS}${m.clave}.webp")`);
    // los archivos vienen al doble; se muestran a un tercio para que todos pesen igual
    span.style.width = `${Math.round(logo[0] * 0.34)}px`;
    span.style.height = `${Math.round(logo[1] * 0.34)}px`;
  }
  return b;
}

function actualizarFichaMarca(b: HTMLElement, n: number) {
  const clave = b.dataset.marca ?? "";
  const activa = filtros.marca === clave;
  b.classList.toggle("activa", activa);
  b.classList.toggle("vacia", n === 0 && !activa);
  if (b.getAttribute("aria-hidden") !== "true") b.setAttribute("aria-pressed", String(activa));
  b.querySelector(".marca-cuenta")!.textContent = `${n} ${n === 1 ? "perfume" : "perfumes"}`;
}

function pintarMarcas(lista: { clave: string; nombre: string }[], cuentas: Record<string, number>) {
  // la pista se arma una sola vez por catálogo: rehacerla reiniciaría el giro
  const huella = lista.map((m) => m.clave).join("|");
  if (huella !== marcasHuella) {
    marcasHuella = huella;
    vaciar(marcasPista, ...lista.map((m) => fichaMarca(m, false)), ...lista.map((m) => fichaMarca(m, true)));
    marcasCinta.style.setProperty("--duracion", `${Math.max(24, lista.length * 2.4)}s`);
  }
  marcasPista.querySelectorAll<HTMLElement>(".marca").forEach((b) => actualizarFichaMarca(b, cuentas[b.dataset.marca ?? ""] ?? 0));
  marcasTodas.classList.toggle("activa", filtros.marca === null);
  marcasTodas.setAttribute("aria-pressed", String(filtros.marca === null));

  // búsqueda: lista quieta con lo que coincide
  const q = sinAcentos(marcasBuscar.value.trim());
  const buscando = q.length > 0;
  marcasCinta.hidden = buscando;
  marcas.hidden = !buscando;
  marcasNota.textContent = buscando ? "" : "Pasa el mouse o toca para detener la cinta.";
  if (buscando) {
    const hallazgos = lista.filter((m) => sinAcentos(m.nombre).includes(q));
    vaciar(
      marcas,
      ...(hallazgos.length
        ? hallazgos.map((m) => {
            const b = fichaMarca(m, false);
            actualizarFichaMarca(b, cuentas[m.clave] ?? 0);
            return b;
          })
        : [h("p", { clase: "marcas-sin" }, "No tenemos esa marca todavía. Escríbenos por WhatsApp y la conseguimos.")]),
    );
  }
}

marcasBuscar.addEventListener("input", () => { if (cargado) pintar(); });
marcasBuscar.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const primera = marcas.querySelector<HTMLButtonElement>(".marca");
  primera?.click();
});
marcasTodas.addEventListener("click", () => {
  marcasBuscar.value = "";
  elegirYCerrar({ marca: null });
});
// en pantallas táctiles, tocar la cinta la detiene unos segundos
let reanudar: number | undefined;
marcasCinta.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  marcasCinta.classList.add("pausada");
  clearTimeout(reanudar);
  reanudar = window.setTimeout(() => marcasCinta.classList.remove("pausada"), 4000);
});

function pintarControles() {
  const c = conteos(perfumes, filtros);

  // tipo (para quién): "Todos" lisa, los demás con un frasco de referencia
  vaciar(
    generos,
    fichaFiltro({ nombre: "Todos", n: c.generos.todos ?? 0, activa: filtros.genero === null, alClic: () => elegirYCerrar({ genero: null }) }),
    ...GENEROS.map((g) =>
      fichaFiltro({
        nombre: g.nombre,
        n: c.generos[g.clave] ?? 0,
        activa: filtros.genero === g.clave,
        foto: `${g.clave}.webp`,
        desactivada: (c.generos[g.clave] ?? 0) === 0,
        alClic: () => elegirYCerrar({ genero: filtros.genero === g.clave ? null : g.clave }),
      }),
    ),
  );

  // categoría: las vacías no se muestran (aparecen solas cuando haya)
  vaciar(
    categorias,
    fichaFiltro({ nombre: "Todas", n: c.categorias.todas ?? 0, activa: filtros.categoria === null, alClic: () => elegirYCerrar({ categoria: null }) }),
    ...CATEGORIAS.filter((cat) => (c.categorias[cat.clave] ?? 0) > 0 || filtros.categoria === cat.clave).map((cat) =>
      fichaFiltro({
        nombre: cat.singular,
        n: c.categorias[cat.clave] ?? 0,
        activa: filtros.categoria === cat.clave,
        foto: `${cat.clave}.webp`,
        alClic: () => elegirYCerrar({ categoria: filtros.categoria === cat.clave ? null : cat.clave }),
      }),
    ),
  );

  // aroma: la ruleta ya existe; solo se actualizan cuentas y selección
  tarjetasAroma.forEach((t, i) => {
    const f = FAMILIAS[i]!;
    const n = c.aromas[f.clave] ?? 0;
    const activo = filtros.aromas.includes(f.clave);
    t.classList.toggle("activa", activo);
    t.classList.toggle("vacia", n === 0 && !activo);
    t.setAttribute("aria-pressed", String(activo));
    t.querySelector(".ruleta-cuenta")!.textContent = `${n} ${n === 1 ? "perfume" : "perfumes"}`;
  });
  pintarRuleta();

  // presentación: estuches de regalo o solo el perfume
  vaciar(
    presentaciones,
    fichaFiltro({ nombre: "Todas", n: null, activa: filtros.presentacion === null, alClic: () => elegirYCerrar({ presentacion: null }) }),
    ...PRESENTACIONES.filter((x) => (c.presentaciones[x.clave] ?? 0) > 0 || filtros.presentacion === x.clave).map((x) =>
      fichaFiltro({
        nombre: x.nombre,
        n: c.presentaciones[x.clave] ?? 0,
        activa: filtros.presentacion === x.clave,
        foto: `${x.clave}.webp`,
        alClic: () => elegirYCerrar({ presentacion: filtros.presentacion === x.clave ? null : x.clave }),
      }),
    ),
  );

  // precio
  vaciar(
    precios,
    fichaFiltro({ nombre: "Cualquiera", n: null, activa: filtros.precio === null, alClic: () => elegirYCerrar({ precio: null }) }),
    ...RANGOS_PRECIO.map((r) =>
      fichaFiltro({
        nombre: r.nombre,
        n: c.precios[r.clave] ?? 0,
        activa: filtros.precio === r.clave,
        desactivada: (c.precios[r.clave] ?? 0) === 0,
        alClic: () => elegirYCerrar({ precio: filtros.precio === r.clave ? null : r.clave }),
      }),
    ),
  );

  // concentración: se combinan, así que no cierra el cajón
  const tiposEnCatalogo = new Set(perfumes.map((p) => claveDeTipo(p.tipo)));
  vaciar(
    tipos,
    fichaFiltro({ nombre: "Todas", n: null, activa: filtros.tipos.length === 0, alClic: () => elegirYCerrar({ tipos: [] }) }),
    ...CONCENTRACIONES.filter((t) => tiposEnCatalogo.has(t.clave) || filtros.tipos.includes(t.clave)).map((t) => {
      const activa = filtros.tipos.includes(t.clave);
      return fichaFiltro({
        nombre: t.corto,
        n: c.tipos[t.clave] ?? 0,
        activa,
        desactivada: (c.tipos[t.clave] ?? 0) === 0,
        alClic: () => cambiar({ tipos: activa ? filtros.tipos.filter((x) => x !== t.clave) : [...filtros.tipos, t.clave] }),
      });
    }),
  );

  // marca: cinta de logos que corre sola (o lista filtrada si se busca)
  const listaMarcas = marcasDe(perfumes);
  pintarMarcas(listaMarcas, c.marcas);

  // la barra muestra lo elegido en cada botón
  const valores: Record<Seccion, string> = {
    generos: filtros.genero ? nombreGenero(filtros.genero) : "",
    categorias: CATEGORIAS.find((x) => x.clave === filtros.categoria)?.singular ?? "",
    aromas: filtros.aromas.length ? `${FAMILIAS.find((f) => f.clave === filtros.aromas[0])?.corto ?? ""}${filtros.aromas.length > 1 ? ` +${filtros.aromas.length - 1}` : ""}` : "",
    presentaciones: PRESENTACIONES.find((x) => x.clave === filtros.presentacion)?.corto ?? "",
    precios: RANGOS_PRECIO.find((x) => x.clave === filtros.precio)?.corto ?? "",
    tipos: filtros.tipos.map((t) => CONCENTRACIONES.find((x) => x.clave === t)?.corto ?? t).join(", "),
    marcas: listaMarcas.find((m) => m.clave === filtros.marca)?.nombre ?? "",
  };
  for (const b of botonesPanel) {
    const v = valores[b.dataset.sec as Seccion];
    b.querySelector(".panel-valor")!.textContent = v ? `· ${v}` : "";
    b.classList.toggle("lleno", Boolean(v));
  }

  if (buscador.value !== filtros.texto && document.activeElement !== buscador) buscador.value = filtros.texto;
  orden.value = filtros.orden;
  limpiar.hidden = !hayFiltros(filtros);

  // filtros activos como chips que se quitan con un toque
  const chips = () =>
    filtrosActivos(filtros, marcasDe(perfumes)).map((f) =>
      h(
        "button",
        { type: "button", clase: "chip-activo", "aria-label": `Quitar ${f.etiqueta}`, al: { click: () => cambiar(quitarFiltro(filtros, f)) } },
        f.etiqueta,
        h("span", { "aria-hidden": "true" }, "×"),
      ),
    );
  vaciar(activos, ...chips());
  vaciar(barraFijaChips, ...chips());
}

/** El collage de la vitrina: frascos del catálogo que van rotando. */
const LUGARES = 7;
const CADA_MS = 3200;
let rotacion: Rotacion | null = null;
let reloj: number | undefined;

function llenarPieza(a: HTMLAnchorElement, p: PerfumePublico, inicial = false) {
  a.href = enlaceDe(p);
  a.dataset.perfume = String(p.id);
  a.setAttribute("aria-label", `${p.marca} ${p.nombre}`);
  vaciar(
    a,
    h("img", { src: urlDeFoto(p.imagenUrl)!, alt: "", decoding: "async", width: 400, height: 400, loading: inicial ? "eager" : "lazy" }),
    h("span", { clase: "pieza-nombre" }, h("small", null, p.marca), p.nombre),
  );
}

async function cambiarUnaPieza() {
  if (!rotacion) return;
  const c = siguienteCambio(rotacion);
  if (!c) return;
  const p = perfumes.find((x) => x.id === c.entra);
  const a = collage.children[c.lugar] as HTMLAnchorElement | undefined;
  if (!p || !a) return;
  rotacion = c.rotacion;
  // se baja la foto antes de girar, para que no aparezca en blanco
  const previa = new Image();
  previa.src = urlDeFoto(p.imagenUrl)!;
  await previa.decode().catch(() => {});
  a.classList.add("girando");
  setTimeout(() => {
    llenarPieza(a, p, true);
    a.classList.remove("girando");
  }, 320);
}

function pintarVitrina() {
  rotacion = iniciarRotacion(perfumes, LUGARES, SEMILLA);
  vaciar(
    collage,
    ...rotacion.mostrados.map((id, i) => {
      const a = h("a", { clase: `pieza pieza-${i + 1}` });
      llenarPieza(a, perfumes.find((x) => x.id === id)!, i < 3);
      return a;
    }),
  );
  iniciarReloj();
  const ideas = sugerenciasDeBusqueda(perfumes, 4);
  sugerencias.hidden = ideas.length === 0;
  vaciar(
    sugerencias,
    h("span", null, "Prueba:"),
    ...ideas.map((t) =>
      h("button", { type: "button", clase: "sugerencia", al: { click: () => { buscador.value = t; cambiar({ texto: t }); irAResultados(); } } }, t),
    ),
  );
}

// La vitrina rota sola, pero se detiene cuando no la estás viendo, cuando
// pasas el mouse o el foco por ella (para poder darle clic con calma) y
// si tu sistema pide menos movimiento.
let vitrinaVisible = true;
let vitrinaQuieta = false;
const menosMovimiento = matchMedia("(prefers-reduced-motion: reduce)");

function iniciarReloj() {
  clearInterval(reloj);
  if (menosMovimiento.matches) return;
  reloj = window.setInterval(() => {
    if (vitrinaVisible && !vitrinaQuieta && !document.hidden) void cambiarUnaPieza();
  }, CADA_MS);
}

collage.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.pieza");
  const p = a && perfumes.find((x) => x.id === Number(a.dataset.perfume));
  if (!p) return;
  e.preventDefault();
  abrirDetalle(p);
});
collage.addEventListener("pointerenter", () => (vitrinaQuieta = true));
collage.addEventListener("pointerleave", () => (vitrinaQuieta = false));
collage.addEventListener("focusin", () => (vitrinaQuieta = true));
collage.addEventListener("focusout", () => (vitrinaQuieta = false));
new IntersectionObserver(([e]) => (vitrinaVisible = e!.isIntersecting)).observe(collage);
menosMovimiento.addEventListener("change", iniciarReloj);

function irAResultados() {
  filtrosFila.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function pintar() {
  pintarControles();
  const visibles = filtrar(perfumes, filtros);
  rejilla.setAttribute("aria-busy", "false");
  vaciar(rejilla, ...visibles.map(tarjeta));

  const n = visibles.length;
  conteo.textContent = `· ${perfumes.length} perfumes`;
  const partes = [
    filtros.genero ? nombreGenero(filtros.genero) : null,
    filtros.categoria ? CATEGORIAS.find((c) => c.clave === filtros.categoria)?.nombre : null,
    ...filtros.aromas.map((a) => FAMILIAS.find((f) => f.clave === a)?.corto),
    ...(cuantosExtra(filtros) ? ["más filtros"] : []),
  ].filter(Boolean);
  resumen.textContent = n === 1 ? "1 perfume" : `${n} perfumes`;
  panelCuenta.textContent = resumen.textContent;
  barraFijaTexto.textContent = `${resumen.textContent}${partes.length ? "" : " · todo el catálogo"}`;

  vacio.hidden = n > 0;
  vacioTexto.textContent = "No tenemos ese perfume en el catálogo todavía.";
}

// ------------------------------------------------------------ eventos
let espera: number | undefined;
buscador.addEventListener("input", () => {
  clearTimeout(espera);
  espera = window.setTimeout(() => cambiar({ texto: buscador.value }), 180);
});
buscador.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    clearTimeout(espera);
    cambiar({ texto: buscador.value });
    irAResultados();
  }
});
orden.addEventListener("change", () => cambiar({ orden: orden.value as Orden }));
limpiar.addEventListener("click", () => {
  buscador.value = "";
  cambiar({ ...SIN_FILTROS, orden: filtros.orden });
});

// enlaces generales
const saludo = "Hola, vengo de la página de Coco & Cuero. Quisiera preguntar por un perfume.";
for (const id of ["wa-portada", "wa-originales", "wa-pie", "wa-vacio"]) {
  const a = document.getElementById(id) as HTMLAnchorElement | null;
  if (!a) continue;
  a.href = linkWhatsApp(saludo);
  a.target = "_blank";
  a.rel = "noopener";
}
($<HTMLAnchorElement>("ig-pie")).href = CONFIG.instagram;
($<HTMLAnchorElement>("fb-pie")).href = CONFIG.facebook;
$("anio").textContent = String(new Date().getFullYear());

// ------------------------------------------------------------ portada
const desplazar = (id: string) => () =>
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
const portada = iniciarPortada(
  $("inicio"),
  $("beneficios"),
  {
    catalogo: desplazar("catalogo"),
    registro: () => void abrirRegistro(),
    comoPedir: desplazar("pedido"),
    originales: desplazar("originales"),
    whatsapp: linkWhatsApp(saludo),
  },
  () => estadoBienvenida() !== "usado",
);

// ------------------------------------------------------------ arranque
// Fotos de Supabase por nuestro dominio (/fotos/…), salvo en `npm run dev`.
// Si alguna no llega por ahí, se intenta directo una vez.
usarFotosPorNuestroDominio(!/^(localhost|127\.|\[::1\])/.test(location.hostname));
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.reintento) return;
    const directa = urlDirectaDeFoto(img.currentSrc || img.src, SUPABASE_URL);
    if (!directa) return;
    img.dataset.reintento = "1";
    img.src = directa;
  },
  true,
);

function cargar() {
vaciar(rejilla, ...esqueleto());
rejilla.setAttribute("aria-busy", "true");
vacio.hidden = true;
conteo.textContent = "· cargando…";
cargarCatalogo()
  .then(({ perfumes: lista, origen }) => {
    perfumes = lista;
    cargado = true;
    // una marca que ya no está en el catálogo (enlace viejo) se ignora
    if (filtros.marca && !marcasDe(perfumes).some((m) => m.clave === filtros.marca)) filtros = { ...filtros, marca: null };
    pintarVitrina();
    portada.conPerfumes(perfumes);
    pintar();
    const abierto = leerPerfumeAbierto(location.search);
    const p = abierto === null ? undefined : perfumes.find((x) => x.id === abierto);
    if (p) abrirDetalle(p, false);
    if (origen === "respaldo") {
      rejilla.before(
        h("p", { clase: "aviso-respaldo" }, "Mostramos el catálogo guardado mientras se restablece la conexión. Confirma precio y disponibilidad por WhatsApp."),
      );
    }
  })
  .catch((e: unknown) => {
    rejilla.setAttribute("aria-busy", "false");
    vaciar(rejilla);
    resumen.textContent = "";
    conteo.textContent = "· sin conexión";
    vacio.hidden = false;
    const detalles = (e as { detalles?: string[] }).detalles ?? [];
    vaciar(
      vacioTexto,
      h("strong", null, "No pudimos cargar el catálogo. "),
      document.createTextNode("Revisa tu conexión a internet e inténtalo de nuevo."),
      h("button", { type: "button", clase: "boton boton-oscuro boton-reintentar", al: { click: cargar } }, "Reintentar"),
      // pista para nosotros si nos mandan captura
      ...(detalles.length ? [h("small", { clase: "detalle-error" }, detalles.join(" · "))] : []),
    );
    vacio.scrollIntoView({ block: "nearest" });
  });
}
cargar();

// ------------------------------------------------------------ barra fija
// Al bajar por los perfumes, una barra delgada recuerda qué filtros hay
// y regresa a ellos con un toque.
$("barra-fija-boton").addEventListener("click", () => {
  irAResultados();
  setTimeout(() => (filtrosFila.querySelector("button") as HTMLButtonElement | null)?.focus({ preventScroll: true }), 400);
});
let filtrosVisibles = true;
let rejillaVisible = false;
const actualizarBarra = () => {
  const mostrar = !filtrosVisibles && rejillaVisible && filtrosFila.getBoundingClientRect().top < 0;
  barraFija.hidden = !mostrar;
};
new IntersectionObserver(([e]) => { filtrosVisibles = e!.isIntersecting; actualizarBarra(); }).observe(filtrosFila);
new IntersectionObserver(([e]) => { rejillaVisible = e!.isIntersecting; actualizarBarra(); }, { rootMargin: "0px 0px -40% 0px" }).observe(rejilla);

// ------------------------------------------------------------ cuenta
void iniciarCuenta(
  $<HTMLButtonElement>("cuenta-boton"),
  document.getElementById("cuenta-crear") as HTMLButtonElement | null,
  document.getElementById("promo"),
  conviene.cargarCuentaAlInicio(),
  () => portada.refrescar(),
);
