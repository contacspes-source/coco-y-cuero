/**
 * Pantalla del sitio público: pinta controles y tarjetas y traduce
 * clics a cambios de filtros. Las reglas viven en ../negocio.
 */
import "../estilos.css";
import { h, vaciar } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  CATEGORIAS,
  FAMILIAS,
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
  muestras,
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
const aromas = $("aromas");
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
function cambiar(parcial: Partial<Filtros>) {
  filtros = { ...filtros, ...parcial };
  history.replaceState(null, "", `${location.pathname}${escribirFiltros(filtros)}${location.hash}`);
  pintar();
}

/** Miniatura redonda de un perfume (para tarjetas de filtro). */
function miniatura(p: PerfumePublico, clase = "mini"): HTMLElement {
  const foto = urlDeFoto(p.imagenUrl);
  return h("span", { clase }, foto ? h("img", { src: foto, alt: "", loading: "lazy", decoding: "async", width: 120, height: 120 }) : null);
}

function pintarControles() {
  const c = conteos(perfumes, filtros);

  // género: tarjetas con fotos de referencia
  vaciar(
    generos,
    ...[{ clave: null as string | null, nombre: "Todos", texto: "Todo el catálogo" }, ...GENEROS.map((g) => ({ clave: g.clave as string | null, nombre: g.nombre, texto: `Para ${g.nombre.toLowerCase()}` }))].map((g, i) => {
      const activo = filtros.genero === g.clave;
      const n = c.generos[g.clave ?? "todos"] ?? 0;
      const fotos = muestras(perfumes, (p) => g.clave === null || p.genero === g.clave, 3, SEMILLA + i);
      return h(
        "button",
        {
          type: "button",
          clase: `genero${activo ? " activo" : ""}`,
          "aria-pressed": String(activo),
          disabled: n === 0 && !activo,
          al: { click: () => cambiar({ genero: activo && g.clave !== null ? null : g.clave }) },
        },
        h("span", { clase: "genero-fotos", "aria-hidden": "true" }, fotos.map((p) => miniatura(p))),
        h("span", { clase: "genero-texto" }, h("span", { clase: "genero-nombre" }, g.nombre), h("span", { clase: "genero-cuenta" }, `${n} ${n === 1 ? "perfume" : "perfumes"}`)),
      );
    }),
  );

  // tipo: píldoras con una foto; las vacías no se muestran (aparecen solas cuando haya)
  vaciar(
    categorias,
    ...[{ clave: null, nombre: "Todos" } as const, ...CATEGORIAS]
      .filter((cat) => cat.clave === null || (c.categorias[cat.clave] ?? 0) > 0 || filtros.categoria === cat.clave)
      .map((cat) => {
        const n = c.categorias[cat.clave ?? "todas"] ?? 0;
        const activa = filtros.categoria === cat.clave;
        const foto = cat.clave ? muestras(perfumes, (p) => p.categoria === cat.clave, 1, SEMILLA + 7)[0] : undefined;
        return h(
          "button",
          {
            type: "button",
            clase: `pildora${activa ? " activa" : ""}`,
            "aria-pressed": String(activa),
            al: { click: () => cambiar({ categoria: activa && cat.clave !== null ? null : cat.clave }) },
          },
          foto ? miniatura(foto, "mini mini-pildora") : null,
          cat.nombre,
          h("span", { clase: "pildora-cuenta" }, String(n)),
        );
      }),
  );

  // aroma: cada familia con su color
  vaciar(
    aromas,
    ...FAMILIAS.map((f) => {
      const activo = filtros.aromas.includes(f.clave);
      const n = c.aromas[f.clave] ?? 0;
      return h(
        "button",
        {
          type: "button",
          clase: `aroma${activo ? " activo" : ""}`,
          dataset: { familia: f.clave },
          "aria-pressed": String(activo),
          disabled: n === 0 && !activo,
          title: f.nombre,
          al: {
            click: () =>
              cambiar({ aromas: activo ? filtros.aromas.filter((a) => a !== f.clave) : [...filtros.aromas, f.clave] }),
          },
        },
        iconoFamilia(f.clave),
        f.corto,
        h("span", { clase: "aroma-cuenta" }, String(n)),
      );
    }),
  );

  if (buscador.value !== filtros.texto && document.activeElement !== buscador) buscador.value = filtros.texto;
  orden.value = filtros.orden;
  limpiar.hidden = !hayFiltros(filtros);

  // filtros activos como chips que se quitan con un toque
  const chips = () =>
    filtrosActivos(filtros).map((f) =>
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
  ].filter(Boolean);
  resumen.textContent = n === 1 ? "1 perfume" : `${n} perfumes`;
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
vaciar(rejilla, ...esqueleto());
cargarCatalogo()
  .then(({ perfumes: lista, origen }) => {
    perfumes = lista;
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
  .catch(() => {
    rejilla.setAttribute("aria-busy", "false");
    vaciar(rejilla);
    pintarControles();
    resumen.textContent = "";
    vacio.hidden = false;
    vacioTexto.textContent = "No pudimos cargar el catálogo en este momento.";
  });

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
void iniciarCuenta($<HTMLButtonElement>("cuenta-boton"), document.getElementById("promo"), conviene.cargarCuentaAlInicio(), () => portada.refrescar());
