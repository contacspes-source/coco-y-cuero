/** Consulta del catálogo: resumen, filtros, lista y baja/alta rápida. */
import type { Perfume } from "../../../compartido/tipos";
import { filtrarPerfumes, FILTROS_INICIALES, resumir, semaforoDe, type FiltrosCatalogo } from "../../negocio/catalogo";
import { esDeSesion, mensajeDe } from "../../negocio/errores";
import { margen, semaforo, type Semaforo } from "../../negocio/precios";
import { estado, nombreDe, recargar, servicios } from "../estado";
import { avisar, confirmar, fmtPesos, fmtPorcentaje, h, selector, urlDeFoto, vaciar } from "../ui";

export const TEXTO_SEMAFORO: Record<Semaforo, string> = {
  "sin-costo": "Sin costo",
  perdida: "Pérdida",
  bajo: "Bajo",
  justo: "Justo",
  sano: "Sano",
};

export function chipMargen(precio: number, costo: number | null): HTMLElement {
  const s = semaforo(precio, costo);
  const m = margen(precio, costo);
  return h(
    "span",
    { clase: `chip-margen m-${s}`, title: TEXTO_SEMAFORO[s] },
    m === null ? "Sin costo" : fmtPorcentaje(m),
  );
}

export function miniatura(url: string | null, alt: string, clase = "mini"): HTMLElement {
  const src = urlDeFoto(url);
  return src
    ? h("img", { clase, src, alt, loading: "lazy", decoding: "async" })
    : h("div", { clase: `${clase} mini-vacia`, title: "Sin foto" }, "Sin foto");
}

export function vistaCatalogo(alSesionVencida: () => void): HTMLElement {
  const catalogos = estado.catalogos!;
  const lista = h("div", { clase: "lista", role: "list" });
  const contador = h("p", { clase: "contador" });
  const tarjetas = h("div", { clase: "tarjetas-resumen" });

  const filtrar = (cambio: Partial<FiltrosCatalogo>) => {
    estado.filtros = { ...estado.filtros, ...cambio };
    pintar();
  };

  async function cambiarPublicado(p: Perfume) {
    if (p.publicado) {
      const ok = await confirmar({
        titulo: `¿Dar de baja ${p.nombre}?`,
        texto: "Deja de verse en el sitio, pero no se borra: conserva sus precios, costos y pedidos, y lo puedes reactivar cuando quieras.",
        aceptar: "Dar de baja",
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      if (p.publicado) await servicios.catalogo.darDeBaja(p.id);
      else await servicios.catalogo.reactivar(p.id);
      await recargar();
      avisar(p.publicado ? `${p.nombre} ya no se ve en el sitio.` : `${p.nombre} vuelve a estar a la venta.`, "exito");
      pintar();
    } catch (e) {
      avisar(mensajeDe(e), "error");
      if (esDeSesion(e)) alSesionVencida();
    }
  }

  function renglon(p: Perfume): HTMLElement {
    const principal = p.presentaciones[0];
    const s = semaforoDe(p);
    const etiquetaGenero = nombreDe(catalogos.generos, p.generoId);
    const etiquetaCategoria = nombreDe(catalogos.categorias, p.categoriaId);
    return h(
      "article",
      { clase: `renglon${p.publicado ? "" : " de-baja"}`, role: "listitem" },
      h("a", { clase: "renglon-foto", href: `#/perfume/${p.id}`, tabindex: -1, "aria-hidden": "true" }, miniatura(p.imagenUrl, "")),
      h(
        "div",
        { clase: "renglon-nombre" },
        h("p", { clase: "renglon-marca" }, p.marca),
        h("a", { clase: "renglon-titulo", href: `#/perfume/${p.id}` }, p.nombre),
        h(
          "p",
          { clase: "renglon-detalle" },
          `${p.tipo} · ${p.presentaciones.map((x) => `${x.ml} ml`).join(", ") || "sin presentación"}`,
        ),
      ),
      h(
        "div",
        { clase: "renglon-etiquetas" },
        h("span", { clase: "etiqueta" }, etiquetaCategoria),
        h("span", { clase: "etiqueta etiqueta-suave" }, etiquetaGenero),
      ),
      h(
        "dl",
        { clase: "renglon-cifras" },
        h("div", null, h("dt", null, "Costo"), h("dd", null, fmtPesos(principal?.costo ?? null))),
        h("div", null, h("dt", null, "Precio"), h("dd", { clase: "precio" }, fmtPesos(principal?.precioVenta ?? null))),
        h(
          "div",
          null,
          h("dt", null, "Margen"),
          h("dd", null, principal ? chipMargen(principal.precioVenta, principal.costo) : h("span", { clase: `chip-margen m-${s}` }, "—")),
        ),
      ),
      h(
        "div",
        { clase: "renglon-acciones" },
        h(
          "label",
          { clase: "interruptor", title: p.publicado ? "Publicado en el sitio" : "Dado de baja" },
          h("input", {
            type: "checkbox",
            role: "switch",
            checked: p.publicado,
            "aria-label": `${p.nombre}: ${p.publicado ? "publicado" : "de baja"}`,
            al: {
              change: (e) => {
                (e.target as HTMLInputElement).checked = p.publicado; // se actualiza al confirmar
                void cambiarPublicado(p);
              },
            },
          }),
          h("span", { clase: "interruptor-pista", "aria-hidden": "true" }),
          h("span", { clase: "interruptor-texto" }, p.publicado ? "En venta" : "De baja"),
        ),
        h("a", { clase: "boton boton-fantasma boton-chico", href: `#/perfume/${p.id}` }, "Editar"),
      ),
    );
  }

  function pintar() {
    const r = resumir(estado.perfumes);
    const tarjeta = (titulo: string, valor: string, nota: string, filtro?: Partial<FiltrosCatalogo>, alerta = false) =>
      h(
        filtro ? "button" : "div",
        {
          clase: `tarjeta-resumen${alerta ? " alerta" : ""}`,
          type: filtro ? "button" : undefined,
          al: filtro ? { click: () => filtrar({ ...FILTROS_INICIALES, ...filtro, texto: buscador.value }) } : undefined,
        },
        h("p", { clase: "tarjeta-titulo" }, titulo),
        h("p", { clase: "tarjeta-valor" }, valor),
        h("p", { clase: "tarjeta-nota" }, nota),
      );
    vaciar(
      tarjetas,
      tarjeta("En venta", String(r.publicados), `${r.deBaja} de baja · ${r.total} en total`, { estado: "publicados" }),
      tarjeta("Margen promedio", fmtPorcentaje(r.margenPromedio), "de cada peso que cobras"),
      tarjeta("Margen bajo", String(r.conMargenBajo), "menos de 20 % de margen", { alerta: "margen-bajo" }, r.conMargenBajo > 0),
      tarjeta("Sin foto", String(r.sinFoto), `${r.sinCosto} presentaciones sin costo`, { alerta: "sin-foto" }, r.sinFoto > 0),
    );

    const visibles = filtrarPerfumes(estado.perfumes, estado.filtros);
    contador.textContent =
      visibles.length === estado.perfumes.length
        ? `${visibles.length} perfumes`
        : `${visibles.length} de ${estado.perfumes.length} perfumes`;

    if (visibles.length === 0) {
      vaciar(
        lista,
        h(
          "div",
          { clase: "vacio" },
          h("p", null, "Ningún perfume coincide con los filtros."),
          h(
            "button",
            {
              clase: "boton boton-fantasma",
              al: {
                click: () => {
                  buscador.value = "";
                  estado.filtros = { ...FILTROS_INICIALES };
                  vaciar(barra, ...controles());
                  pintar();
                },
              },
            },
            "Quitar filtros",
          ),
        ),
      );
    } else {
      vaciar(lista, ...visibles.map(renglon));
    }
    vaciar(barra, ...controles());
  }

  const buscador = h("input", {
    type: "search",
    clase: "buscador",
    placeholder: "Buscar marca o perfume…",
    "aria-label": "Buscar",
    value: estado.filtros.texto,
    al: { input: () => { estado.filtros.texto = buscador.value; pintarSoloLista(); } },
  });

  // al teclear solo se repinta la lista, para no perder el foco del buscador
  function pintarSoloLista() {
    const visibles = filtrarPerfumes(estado.perfumes, estado.filtros);
    contador.textContent = `${visibles.length} de ${estado.perfumes.length} perfumes`;
    vaciar(lista, ...(visibles.length ? visibles.map(renglon) : [h("div", { clase: "vacio" }, h("p", null, "Ningún perfume coincide."))]));
  }

  const barra = h("div", { clase: "filtros" });
  function controles(): Node[] {
    const f = estado.filtros;
    const num = (v: string) => (v === "" ? null : Number(v));
    const alerta = f.alerta !== "todas";
    return [
      selector(
        [{ valor: "", texto: "Todos los géneros" }, ...catalogos.generos.map((g) => ({ valor: String(g.id), texto: g.nombre }))],
        f.generoId === null ? "" : String(f.generoId),
        (v) => filtrar({ generoId: num(v) }),
        { "aria-label": "Género" },
      ),
      selector(
        [{ valor: "", texto: "Todas las categorías" }, ...catalogos.categorias.map((c) => ({ valor: String(c.id), texto: c.nombre }))],
        f.categoriaId === null ? "" : String(f.categoriaId),
        (v) => filtrar({ categoriaId: num(v) }),
        { "aria-label": "Categoría" },
      ),
      selector(
        [
          { valor: "todos", texto: "En venta y de baja" },
          { valor: "publicados", texto: "Solo en venta" },
          { valor: "baja", texto: "Solo de baja" },
        ],
        f.estado,
        (v) => filtrar({ estado: v as FiltrosCatalogo["estado"] }),
        { "aria-label": "Estado" },
      ),
      selector(
        [
          { valor: "todas", texto: "Sin alertas" },
          { valor: "margen-bajo", texto: "Margen bajo" },
          { valor: "sin-costo", texto: "Sin costo" },
          { valor: "sin-foto", texto: "Sin foto" },
        ],
        f.alerta,
        (v) => filtrar({ alerta: v as FiltrosCatalogo["alerta"] }),
        { "aria-label": "Alertas", clase: alerta ? "activo" : undefined },
      ),
    ];
  }

  const vista = h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h("div", null, h("p", { clase: "rotulo" }, "Inventario"), h("h1", null, "Catálogo")),
      h(
        "div",
        { clase: "vista-acciones" },
        h("a", { clase: "boton boton-fantasma", href: "#/precios" }, "Ajustar precios"),
        h("a", { clase: "boton boton-primario", href: "#/perfume/nuevo" }, "+ Nuevo perfume"),
      ),
    ),
    tarjetas,
    h("div", { clase: "barra" }, buscador, barra),
    contador,
    lista,
  );
  pintar();
  return vista;
}
