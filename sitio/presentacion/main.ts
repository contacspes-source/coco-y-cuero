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
  type Filtros,
  type Orden,
} from "../negocio/catalogo";
import { cargarCatalogo } from "../negocio/servicio";
import { CONFIG, linkWhatsApp } from "./config";
import { iconoFamilia, iconoWhatsApp } from "./iconos";

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

let perfumes: PerfumePublico[] = [];
let filtros: Filtros = leerFiltros(location.search);

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const nombreGenero = (clave: string) => GENEROS.find((g) => g.clave === clave)?.nombre ?? "";

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
      h("h3", { clase: "ficha-nombre" }, p.nombre),
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

function pintarControles() {
  const c = conteos(perfumes, filtros);

  vaciar(
    generos,
    ...[{ clave: null as string | null, nombre: "Todos" }, ...GENEROS].map((g) =>
      h(
        "button",
        {
          type: "button",
          clase: `genero${filtros.genero === g.clave ? " activo" : ""}`,
          "aria-pressed": String(filtros.genero === g.clave),
          al: { click: () => cambiar({ genero: g.clave }) },
        },
        g.nombre,
        h("sup", null, String(c.generos[g.clave ?? "todos"] ?? 0)),
      ),
    ),
  );

  vaciar(
    categorias,
    ...[{ clave: null, nombre: "Todas" } as const, ...CATEGORIAS].map((cat) => {
      const n = c.categorias[cat.clave ?? "todas"] ?? 0;
      const activa = filtros.categoria === cat.clave;
      return h(
        "button",
        {
          type: "button",
          clase: `pildora${activa ? " activa" : ""}`,
          "aria-pressed": String(activa),
          disabled: n === 0 && !activa,
          al: { click: () => cambiar({ categoria: cat.clave }) },
        },
        cat.nombre,
        h("span", { clase: "pildora-cuenta" }, String(n)),
      );
    }),
  );

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
      );
    }),
  );

  if (buscador.value !== filtros.texto) buscador.value = filtros.texto;
  orden.value = filtros.orden;
  limpiar.hidden = !hayFiltros(filtros);
}

function pintar() {
  pintarControles();
  const visibles = filtrar(perfumes, filtros);
  rejilla.setAttribute("aria-busy", "false");
  vaciar(rejilla, ...visibles.map(tarjeta));

  const n = visibles.length;
  conteo.textContent = `${perfumes.length} perfumes`;
  const partes = [
    filtros.genero ? nombreGenero(filtros.genero) : null,
    filtros.categoria ? CATEGORIAS.find((c) => c.clave === filtros.categoria)?.nombre : null,
    ...filtros.aromas.map((a) => FAMILIAS.find((f) => f.clave === a)?.corto),
  ].filter(Boolean);
  resumen.textContent = `${n === 1 ? "1 perfume" : `${n} perfumes`}${partes.length ? ` · ${partes.join(" · ")}` : ""}`;

  vacio.hidden = n > 0;
  vacioTexto.textContent = "No tenemos ese perfume en el catálogo todavía.";
}

// ------------------------------------------------------------ eventos
let espera: number | undefined;
buscador.addEventListener("input", () => {
  clearTimeout(espera);
  espera = window.setTimeout(() => cambiar({ texto: buscador.value }), 180);
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

// ------------------------------------------------------------ arranque
vaciar(rejilla, ...esqueleto());
cargarCatalogo()
  .then(({ perfumes: lista, origen }) => {
    perfumes = lista;
    pintar();
    if (origen === "respaldo") {
      rejilla.before(
        h("p", { clase: "aviso-respaldo" }, "Mostramos el catálogo guardado mientras se restablece la conexión. Confirma precio y existencia por WhatsApp."),
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
