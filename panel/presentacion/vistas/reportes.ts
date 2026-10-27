/**
 * Reportes (incremento 5): cómo va el negocio en el periodo elegido.
 * Todos los números vienen de reporte_ventas() en la base; esta vista
 * solo los acomoda. La gráfica es SVG hecho a mano (el panel no carga
 * librerías externas y su CSP no permite estilos en línea).
 */
import type { FilaReporte, Reporte } from "../../../compartido/tipos";
import { esDeSesion, mensajeDe, ErrorDeValidacion } from "../../negocio/errores";
import {
  PERIODOS,
  aCsv,
  cierre,
  compacto,
  etiquetaRango,
  margenPorcentaje,
  marcasDelEje,
  nombreDeArchivo,
  nombreMes,
  proporciones,
  ticketPromedio,
  variacion,
  type Periodo,
  type Rango,
} from "../../negocio/reportes";
import { servicios } from "../estado";
import { campo, cargando, fmtPesos, fmtPorcentaje, h, marcarErrores, vaciar } from "../ui";

// se recuerda mientras el panel esté abierto
let periodo: Periodo = "mes";
let personalizado: Rango | null = null;
let comoTabla = false;

const enteros = new Intl.NumberFormat("es-MX");
const SVG = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, atributos: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  return el;
}

// ------------------------------------------------------------ piezas
function delta(actual: number, anterior: number, unidad: "pesos" | "numero" = "pesos"): HTMLElement {
  const v = variacion(actual, anterior);
  if (v === null) {
    return h("p", { clase: "kpi-delta neutro" }, anterior === 0 && actual > 0 ? "Primer periodo con ventas" : "Sin periodo anterior para comparar");
  }
  const sube = v > 0.0005;
  const baja = v < -0.0005;
  const texto = `${sube ? "▲" : baja ? "▼" : "="} ${fmtPorcentaje(Math.abs(v))} vs. periodo anterior (${unidad === "pesos" ? fmtPesos(anterior) : enteros.format(anterior)})`;
  return h("p", { clase: `kpi-delta ${sube ? "sube" : baja ? "baja" : "neutro"}` }, texto);
}

function kpi(titulo: string, valor: string, ...detalle: (HTMLElement | null)[]): HTMLElement {
  return h("div", { clase: "kpi" }, h("p", { clase: "tarjeta-titulo" }, titulo), h("p", { clase: "kpi-valor" }, valor), ...detalle);
}

const nota = (t: string) => h("p", { clase: "tarjeta-nota" }, t);

/** Tabla con una barra delgada por renglón (proporción contra el mayor). */
function tablaConBarras(
  columnas: string[],
  filas: { celdas: (string | HTMLElement)[]; valor: number }[],
  vacio: string,
): HTMLElement {
  if (!filas.length) return h("p", { clase: "reporte-vacio" }, vacio);
  const anchos = proporciones(filas.map((f) => f.valor));
  return h(
    "table",
    { clase: "tabla-reporte" },
    h("thead", null, h("tr", null, columnas.map((c, i) => h("th", { scope: "col", clase: i === 0 ? undefined : "num" }, c)))),
    h(
      "tbody",
      null,
      filas.map((f, i) =>
        h(
          "tr",
          null,
          f.celdas.map((c, j) =>
            h(
              "td",
              { clase: j === 0 ? "celda-nombre" : "num" },
              c,
              j === 0 ? barra(anchos[i]!) : null,
            ),
          ),
        ),
      ),
    ),
  );
}

function barra(proporcion: number): SVGSVGElement {
  // SVG en vez de un div con width en línea: la CSP del panel bloquea style=""
  const s = svg("svg", { class: "barrita", viewBox: "0 0 100 4", preserveAspectRatio: "none", "aria-hidden": "true" });
  s.append(svg("rect", { x: 0, y: 0, width: 100, height: 4, rx: 2, class: "barrita-fondo" }));
  if (proporcion > 0) s.append(svg("rect", { x: 0, y: 0, width: Math.max(2, proporcion * 100), height: 4, rx: 2, class: "barrita-valor" }));
  return s;
}

const filasSimples = (lista: FilaReporte[], conMargen: boolean) =>
  lista.map((f) => ({
    valor: f.ingresos,
    celdas: [f.nombre, enteros.format(f.ventas), fmtPesos(f.ingresos), ...(conMargen ? [fmtPesos(f.margen)] : [])],
  }));

// ------------------------------------------------------------ gráfica
function graficaMeses(r: Reporte): HTMLElement {
  const caja = h("div", { clase: "grafica" });
  const globo = h("div", { clase: "grafica-globo", role: "status", hidden: true });
  const anio = Number(r.hasta.slice(0, 4));
  const mesDesde = r.desde.slice(0, 7);
  const mesHasta = r.hasta.slice(0, 7);
  const dentro = (mes: string) => mes >= mesDesde && mes <= mesHasta;

  function dibujar() {
    const ancho = Math.max(300, Math.round(caja.clientWidth));
    const alto = 230;
    const izq = 46;
    const der = 8;
    const arriba = 22;
    const abajo = 28;
    const plotAncho = ancho - izq - der;
    const plotAlto = alto - arriba - abajo;
    const meses = r.porMes;
    const max = Math.max(0, ...meses.map((m) => m.ingresos));
    const marcas = marcasDelEje(max);
    const tope = marcas[marcas.length - 1] || 1;
    const y = (v: number) => arriba + plotAlto - (v / tope) * plotAlto;
    const ranura = plotAncho / Math.max(1, meses.length);
    const grosor = Math.min(24, ranura * 0.56);

    const s = svg("svg", {
      class: "grafica-svg",
      width: ancho,
      height: alto,
      viewBox: `0 0 ${ancho} ${alto}`,
      role: "img",
      "aria-label": `Ingresos por mes, últimos 12 meses. Máximo ${fmtPesos(max)}.`,
    });

    for (const m of marcas) {
      const yy = Math.round(y(m)) + 0.5;
      s.append(svg("line", { x1: izq, x2: ancho - der, y1: yy, y2: yy, class: m === 0 ? "eje-base" : "eje-guia" }));
      const t = svg("text", { x: izq - 8, y: yy + 4, class: "eje-texto", "text-anchor": "end" });
      t.textContent = m === 0 ? "0" : `$${compacto(m)}`;
      s.append(t);
    }

    meses.forEach((m, i) => {
      const cx = izq + ranura * i + ranura / 2;
      const x = cx - grosor / 2;
      const base = y(0);
      const altoBarra = Math.max(0, base - y(m.ingresos));
      const g = svg("g", { class: `col${dentro(m.mes) ? " en-periodo" : ""}` });
      // zona de hover más grande que la barra
      const zona = svg("rect", { x: cx - ranura / 2, y: arriba, width: ranura, height: plotAlto, class: "col-zona", tabindex: 0, role: "img", "aria-label": `${nombreMes(m.mes, anio)}: ${fmtPesos(m.ingresos)}, ${m.ventas} ventas` });
      g.append(zona);
      if (altoBarra > 0) {
        const radio = Math.min(4, altoBarra, grosor / 2);
        const top = base - altoBarra;
        // punta redondeada, base recta
        const d = `M${x},${base} V${top + radio} Q${x},${top} ${x + radio},${top} H${x + grosor - radio} Q${x + grosor},${top} ${x + grosor},${top + radio} V${base} Z`;
        g.append(svg("path", { d, class: "col-barra" }));
      }
      // en pantallas angostas: un mes sí y uno no, sin el año
      const angosto = ranura < 44;
      if (!angosto || (meses.length - 1 - i) % 2 === 0) {
        const etiqueta = svg("text", { x: cx, y: alto - 9, class: "eje-texto", "text-anchor": "middle" });
        etiqueta.textContent = angosto ? nombreMes(m.mes) : nombreMes(m.mes, anio);
        g.append(etiqueta);
      }
      // solo el último mes lleva su valor escrito; el resto, en el globo
      if (i === meses.length - 1 && m.ingresos > 0) {
        const v = svg("text", { x: cx, y: base - altoBarra - 7, class: "col-valor", "text-anchor": "middle" });
        v.textContent = `$${compacto(m.ingresos)}`;
        g.append(v);
      }
      const mostrar = () => {
        g.classList.add("activa");
        vaciar(
          globo,
          h("strong", null, `${nombreMes(m.mes)} ${m.mes.slice(0, 4)}`),
          h("span", null, `Ingresos ${fmtPesos(m.ingresos)}`),
          h("span", null, `Ganancia ${fmtPesos(m.margen)}`),
          h("span", null, `${m.ventas} ${m.ventas === 1 ? "venta" : "ventas"}`),
        );
        globo.hidden = false;
        const gx = Math.min(Math.max(cx, 80), ancho - 80);
        globo.style.setProperty("--x", `${gx}px`); // CSSOM: permitido por la CSP
        globo.style.setProperty("--y", `${Math.max(arriba, base - altoBarra) - 10}px`);
      };
      const ocultar = () => {
        g.classList.remove("activa");
        globo.hidden = true;
      };
      zona.addEventListener("mouseenter", mostrar);
      zona.addEventListener("focus", mostrar);
      zona.addEventListener("mouseleave", ocultar);
      zona.addEventListener("blur", ocultar);
      s.append(g);
    });
    vaciar(caja, s, globo);
  }

  queueMicrotask(dibujar);
  let ultimoAncho = 0;
  new ResizeObserver(() => {
    if (Math.abs(caja.clientWidth - ultimoAncho) > 8) {
      ultimoAncho = caja.clientWidth;
      dibujar();
    }
  }).observe(caja);
  return caja;
}

function tablaMeses(r: Reporte): HTMLElement {
  const anio = Number(r.hasta.slice(0, 4));
  return h(
    "table",
    { clase: "tabla-reporte tabla-meses" },
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Mes"), h("th", { scope: "col", clase: "num" }, "Ventas"), h("th", { scope: "col", clase: "num" }, "Ingresos"), h("th", { scope: "col", clase: "num" }, "Ganancia"))),
    h(
      "tbody",
      null,
      [...r.porMes].reverse().map((m) =>
        h("tr", null, h("td", null, nombreMes(m.mes, anio)), h("td", { clase: "num" }, enteros.format(m.ventas)), h("td", { clase: "num" }, fmtPesos(m.ingresos)), h("td", { clase: "num" }, fmtPesos(m.margen))),
      ),
    ),
  );
}

// ------------------------------------------------------------ vista
export function vistaReportes(alSesionVencida: () => void): HTMLElement {
  const cuerpo = h("div", { clase: "reporte" });
  const etiqueta = h("p", { clase: "vista-sub" });
  const selector = h("div", { clase: "pestanas pestanas-periodo", role: "tablist", "aria-label": "Periodo" });
  const desde = h("input", { type: "date", value: personalizado?.desde ?? "" });
  const hasta = h("input", { type: "date", value: personalizado?.hasta ?? "" });
  const aplicar = h("button", { type: "submit", clase: "boton boton-primario boton-chico" }, "Ver");
  const formRango: HTMLFormElement = h(
    "form",
    {
      clase: "rango-personalizado",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          personalizado = { desde: desde.value, hasta: hasta.value };
          void cargar();
        },
      },
    },
    campo("Desde", desde, { nombre: "desde" }),
    campo("Hasta", hasta, { nombre: "hasta" }),
    aplicar,
  );
  const descargar = h("button", { type: "button", clase: "boton boton-fantasma", disabled: true }, "Descargar CSV");
  let actual: Reporte | null = null;
  let rangoActual: Rango | null = null;

  descargar.addEventListener("click", () => {
    if (!actual || !rangoActual) return;
    const archivo = new Blob([aCsv(actual)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(archivo);
    const a = h("a", { href: url, download: nombreDeArchivo(rangoActual) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function pintarSelector() {
    vaciar(
      selector,
      ...PERIODOS.map((p) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            clase: `pestana${periodo === p.clave ? " activa" : ""}`,
            "aria-selected": String(periodo === p.clave),
            al: {
              click: () => {
                periodo = p.clave;
                pintarSelector();
                if (p.clave !== "personalizado" || personalizado) void cargar();
                else desde.focus();
              },
            },
          },
          p.nombre,
        ),
      ),
    );
    formRango.hidden = periodo !== "personalizado";
  }

  let turno = 0;
  async function cargar() {
    const mio = ++turno;
    marcarErrores(formRango, []);
    let rango: Rango;
    try {
      rango = servicios.reportes.rango(periodo, personalizado ?? undefined);
    } catch (e) {
      if (e instanceof ErrorDeValidacion) marcarErrores(formRango, e.problemas);
      return;
    }
    if (periodo === "personalizado") {
      desde.value = rango.desde;
      hasta.value = rango.hasta;
    }
    etiqueta.textContent = etiquetaRango(rango);
    descargar.disabled = true;
    vaciar(cuerpo, cargando("Calculando…"));
    try {
      const r = await servicios.reportes.obtener(rango);
      if (mio !== turno) return; // llegó tarde: ya se pidió otro periodo
      actual = r;
      rangoActual = rango;
      descargar.disabled = false;
      pintar(r);
    } catch (e) {
      if (mio !== turno) return;
      if (e instanceof ErrorDeValidacion) {
        marcarErrores(formRango, e.problemas);
        vaciar(cuerpo);
        return;
      }
      vaciar(
        cuerpo,
        h("div", { clase: "vacio" }, h("p", null, mensajeDe(e)), h("button", { type: "button", clase: "boton boton-fantasma", al: { click: () => void cargar() } }, "Reintentar")),
      );
      if (esDeSesion(e)) alSesionVencida();
    }
  }

  function pintar(r: Reporte) {
    const s = r.resumen;
    const pct = margenPorcentaje(s);
    const ticket = ticketPromedio(s);
    const c = cierre(r.embudo);
    const sinVentas = s.ventas === 0;

    const kpis = h(
      "div",
      { clase: "kpis" },
      kpi("Ventas", fmtPesos(s.ingresos), delta(s.ingresos, r.anterior.ingresos), nota(`${enteros.format(s.ventas)} ${s.ventas === 1 ? "pedido entregado" : "pedidos entregados"}`)),
      kpi("Ganancia", fmtPesos(s.margen), delta(s.margen, r.anterior.margen), nota(pct === null ? "Margen: —" : `Margen de ${fmtPorcentaje(pct)} sobre lo vendido`)),
      kpi("Ticket promedio", fmtPesos(ticket), nota(s.descuentos > 0 ? `${fmtPesos(s.descuentos)} en descuentos de bienvenida` : "Lo que deja cada venta en promedio")),
      kpi(
        "Clientes nuevos",
        enteros.format(r.clientes.nuevos),
        nota(`${enteros.format(r.clientes.compradores)} ${r.clientes.compradores === 1 ? "compró" : "compraron"} · ${enteros.format(r.clientes.recurrentes)} ${r.clientes.recurrentes === 1 ? "repite" : "repiten"}`),
      ),
    );

    const avisoCosto =
      s.costoEstimado > 0
        ? h(
            "p",
            { clase: "aviso-reporte" },
            `${s.costoEstimado} ${s.costoEstimado === 1 ? "venta usa" : "ventas usan"} el costo del catálogo porque no tiene${s.costoEstimado === 1 ? "" : "n"} costo real registrado. Para una ganancia exacta, captúralo en la ficha del pedido.`,
          )
        : null;

    const alternar = h(
      "button",
      { type: "button", clase: "enlace", "aria-pressed": String(comoTabla) },
      comoTabla ? "Ver gráfica" : "Ver como tabla",
    );
    const contenidoMeses = h("div", null, comoTabla ? tablaMeses(r) : graficaMeses(r));
    alternar.addEventListener("click", () => {
      comoTabla = !comoTabla;
      alternar.textContent = comoTabla ? "Ver gráfica" : "Ver como tabla";
      alternar.setAttribute("aria-pressed", String(comoTabla));
      vaciar(contenidoMeses, comoTabla ? tablaMeses(r) : graficaMeses(r));
    });

    const panelMeses = h(
      "section",
      { clase: "panel" },
      h("div", { clase: "panel-cabecera" }, h("h2", null, "Ingresos por mes"), alternar),
      h("p", { clase: "panel-ayuda" }, "Últimos 12 meses. En color, los meses del periodo elegido. Una venta cuenta el día que se entregó."),
      contenidoMeses,
    );

    const masVendidos = h(
      "section",
      { clase: "panel" },
      h("h2", null, "Más vendidos"),
      h("p", { clase: "panel-ayuda" }, "Por ingresos en el periodo."),
      tablaConBarras(
        ["Perfume", "Ventas", "Ingresos", "Ganancia"],
        r.topPerfumes.map((t) => ({
          valor: t.ingresos,
          celdas: [h("span", null, h("small", { clase: "celda-marca" }, t.marca), t.nombre), enteros.format(t.ventas), fmtPesos(t.ingresos), fmtPesos(t.margen)],
        })),
        "Cuando entregues pedidos, aquí verás qué se vende más.",
      ),
    );

    const canales = h(
      "section",
      { clase: "panel" },
      h("h2", null, "Cómo te conocen"),
      h("p", { clase: "panel-ayuda" }, "Clientes nuevos del periodo y lo que compraron. Úsalo para decidir dónde invertir en anuncios."),
      tablaConBarras(
        ["Canal", "Nuevos", "Ventas", "Ingresos"],
        r.porCanal.map((c) => ({ valor: c.ingresos || c.clientesNuevos, celdas: [c.nombre, enteros.format(c.clientesNuevos), enteros.format(c.ventas), fmtPesos(c.ingresos)] })),
        "Sin clientes nuevos ni ventas en este periodo.",
      ),
    );

    const mini = (titulo: string, filas: FilaReporte[], conMargen: boolean) =>
      h(
        "section",
        { clase: "panel" },
        h("h2", null, titulo),
        tablaConBarras(["", "Ventas", "Ingresos", ...(conMargen ? ["Ganancia"] : [])], filasSimples(filas, conMargen), "Sin ventas en este periodo."),
      );

    const etapa = (titulo: string, n: number, extra?: string) =>
      h("li", null, h("span", { clase: "embudo-n" }, enteros.format(n)), h("span", { clase: "embudo-t" }, titulo), extra ? h("span", { clase: "embudo-x" }, extra) : null);
    const embudo = h(
      "section",
      { clase: "panel" },
      h("h2", null, "Pedidos que entraron en el periodo"),
      h("p", { clase: "panel-ayuda" }, "En qué estado están hoy. Los que siguen en curso todavía pueden cerrarse."),
      r.embudo.creados
        ? h(
            "ol",
            { clase: "embudo" },
            etapa("Entraron", r.embudo.creados),
            etapa("Siguen en curso", c.enCurso, `${r.embudo.consultado} por confirmar · ${r.embudo.apartado} apartados · ${r.embudo.comprado} comprados`),
            etapa("Entregados", r.embudo.entregado, c.entregados === null ? undefined : `${fmtPorcentaje(c.entregados)} de los que entraron`),
            etapa("Cancelados", r.embudo.cancelado, c.cancelados === null ? undefined : `${fmtPorcentaje(c.cancelados)} de los que entraron`),
          )
        : h("p", { clase: "reporte-vacio" }, "No entraron pedidos en este periodo."),
    );

    const hoy = h(
      "section",
      { clase: "panel" },
      h("h2", null, "Hoy"),
      h("p", { clase: "panel-ayuda" }, "Foto del momento, sin importar el periodo."),
      h(
        "dl",
        { clase: "hoy-cifras" },
        h("div", null, h("dt", null, "Pedidos en curso"), h("dd", null, enteros.format(r.pendiente.enCurso))),
        h("div", null, h("dt", null, "Anticipos recibidos"), h("dd", null, fmtPesos(r.pendiente.anticipos))),
        h("div", null, h("dt", null, "Por cobrar al entregar"), h("dd", null, fmtPesos(r.pendiente.porCobrar))),
        h("div", null, h("dt", null, "Invertido en mercancía"), h("dd", null, fmtPesos(r.pendiente.invertido))),
      ),
      h("a", { clase: "enlace", href: "#/pedidos" }, "Ir a pedidos →"),
    );

    vaciar(
      cuerpo,
      ...(sinVentas
        ? [h("div", { clase: "aviso-reporte aviso-suave" }, h("strong", null, "Todavía no hay ventas entregadas en este periodo. "), "Los reportes se llenan cuando marcas un pedido como Entregado.")]
        : []),
      kpis,
      ...(avisoCosto ? [avisoCosto] : []),
      panelMeses,
      h("div", { clase: "reporte-2" }, masVendidos, canales),
      h("div", { clase: "reporte-3" }, mini("Por categoría", r.porCategoria, true), mini("Por género", r.porGenero, true), mini("Por ciudad", r.porCiudad, false)),
      h("div", { clase: "reporte-2" }, embudo, hoy),
    );
  }

  const vista = h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h("div", null, h("p", { clase: "rotulo" }, "Negocio"), h("h1", null, "Reportes"), etiqueta),
      h("div", { clase: "vista-acciones" }, descargar),
    ),
    h("div", { clase: "reporte-controles" }, selector, formRango),
    cuerpo,
  );
  pintarSelector();
  void cargar();
  return vista;
}
