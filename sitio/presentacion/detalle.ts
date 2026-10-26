/** Contenido de la hoja de detalle de un perfume. */
import { h } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  CATEGORIAS,
  GENEROS,
  TIPO_LARGO,
  descripcionDe,
  familiaPrincipal,
  mensajeWhatsAppTamano,
  notasPorFamilia,
  precioDesde,
  similares,
} from "../negocio/catalogo";
import { FORMAS_DE_ENTREGA, FORMAS_DE_PAGO, GARANTIA, PASOS_DE_COMPRA } from "../negocio/tienda";
import { linkWhatsApp } from "./config";
import { iconoFamilia, iconoWhatsApp } from "./iconos";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export interface AccionesDetalle {
  apartar: (p: PerfumePublico, presentacion: PerfumePublico["presentaciones"][number]) => void;
  abrirOtro: (p: PerfumePublico) => void;
  enlace: (p: PerfumePublico) => string;
}

function lista(titulo: string, elementos: readonly { titulo: string; texto: string }[], numerada = false): HTMLElement {
  return h(
    "section",
    { clase: "det-seccion" },
    h("h3", null, titulo),
    h(
      numerada ? "ol" : "ul",
      { clase: numerada ? "det-pasos" : "det-lista" },
      elementos.map((e) => h("li", null, h("strong", null, e.titulo), h("span", null, e.texto))),
    ),
  );
}

export function vistaDetalle(p: PerfumePublico, todos: PerfumePublico[], acc: AccionesDetalle): HTMLElement {
  const foto = urlDeFoto(p.imagenUrl);
  const categoria = CATEGORIAS.find((c) => c.clave === p.categoria);
  const genero = GENEROS.find((g) => g.clave === p.genero)?.nombre;
  let elegida = p.presentaciones[0] ?? null;

  const precio = h("p", { clase: "det-precio" });
  const whatsapp = h(
    "a",
    { clase: "boton boton-linea det-wa", target: "_blank", rel: "noopener" },
    iconoWhatsApp(),
    "Pedir por WhatsApp",
  );
  const apartar = h(
    "button",
    { clase: "boton boton-oscuro det-apartar", type: "button", al: { click: () => elegida && acc.apartar(p, elegida) } },
    "Apartar",
  );

  const tamanos = h("div", { clase: "det-tamanos", role: "radiogroup", "aria-label": "Tamaño" });
  function elegir(pr: typeof elegida) {
    elegida = pr;
    precio.textContent = pr ? pesos.format(pr.precio) : "Consultar";
    whatsapp.setAttribute("href", linkWhatsApp(mensajeWhatsAppTamano(p, pr?.ml ?? 0)));
    apartar.disabled = !pr;
    for (const b of tamanos.querySelectorAll<HTMLButtonElement>("button")) {
      const activo = Number(b.dataset.ml) === pr?.ml;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-checked", String(activo));
    }
  }
  for (const pr of p.presentaciones) {
    tamanos.append(
      h(
        "button",
        { type: "button", role: "radio", clase: "det-tamano", dataset: { ml: String(pr.ml) }, al: { click: () => elegir(pr) } },
        h("strong", null, `${pr.ml} ml`),
        h("span", null, pesos.format(pr.precio)),
      ),
    );
  }

  const copiar = h(
    "button",
    {
      type: "button",
      clase: "det-compartir",
      al: {
        click: async () => {
          const url = acc.enlace(p);
          try {
            if (navigator.share) await navigator.share({ title: `${p.marca} ${p.nombre}`, url });
            else {
              await navigator.clipboard.writeText(url);
              copiar.textContent = "Enlace copiado ✓";
              setTimeout(() => (copiar.textContent = "Compartir"), 2200);
            }
          } catch {
            /* la persona canceló el menú de compartir */
          }
        },
      },
    },
    "Compartir",
  );

  const grupos = notasPorFamilia(p);
  const parecidos = similares(p, todos);

  const vista = h(
    "article",
    { clase: "detalle" },
    h(
      "div",
      { clase: "det-foto" },
      foto ? h("img", { src: foto, alt: `${p.marca} ${p.nombre}`, width: 900, height: 900 }) : h("span", { clase: "ficha-inicial" }, p.nombre[0] ?? ""),
      categoria ? h("span", { clase: "etiqueta" }, categoria.singular) : null,
    ),
    h(
      "div",
      { clase: "det-info" },
      h("p", { clase: "ficha-marca" }, p.marca),
      h("h2", { clase: "det-nombre" }, p.nombre),
      h("p", { clase: "det-ficha" }, [TIPO_LARGO[p.tipo] ?? p.tipo, genero, categoria?.nombre].filter(Boolean).join(" · ")),
      precio,
      p.presentaciones.length > 1 ? tamanos : p.presentaciones[0] ? h("p", { clase: "det-un-tamano" }, `Presentación de ${p.presentaciones[0].ml} ml`) : null,
      h("div", { clase: "det-acciones" }, apartar, whatsapp),
      h("p", { clase: "det-aviso" }, "Sobre pedido. Confirmamos existencia antes de cobrarte."),

      h("section", { clase: "det-seccion" }, h("h3", null, "Descripción"), h("p", { clase: "det-descripcion" }, descripcionDe(p))),

      grupos.length
        ? h(
            "section",
            { clase: "det-seccion" },
            h("h3", null, "Notas olfativas"),
            h(
              "div",
              { clase: "det-notas" },
              grupos.map((g) =>
                h(
                  "div",
                  { clase: `det-familia${g.clave === familiaPrincipal(p) ? " principal" : ""}` },
                  iconoFamilia(g.clave),
                  h("div", null, h("strong", null, g.familia), h("span", null, g.notas.join(", "))),
                ),
              ),
            ),
          )
        : null,

      lista("Cómo comprar", PASOS_DE_COMPRA, true),
      lista("Formas de pago", FORMAS_DE_PAGO),
      lista("Entrega", FORMAS_DE_ENTREGA),
      h("p", { clase: "det-garantia" }, GARANTIA),
      h("div", { clase: "det-pie" }, copiar),

      parecidos.length
        ? h(
            "section",
            { clase: "det-seccion" },
            h("h3", null, "También te puede gustar"),
            h(
              "div",
              { clase: "det-similares" },
              parecidos.map((o) => {
                const src = urlDeFoto(o.imagenUrl);
                const desde = precioDesde(o);
                return h(
                  "a",
                  {
                    clase: "det-similar",
                    href: acc.enlace(o),
                    al: { click: (e) => { e.preventDefault(); acc.abrirOtro(o); } },
                  },
                  src ? h("img", { src, alt: "", loading: "lazy" }) : h("span", { clase: "det-similar-vacio" }),
                  h("span", { clase: "det-similar-marca" }, o.marca),
                  h("span", { clase: "det-similar-nombre" }, o.nombre),
                  h("span", { clase: "det-similar-precio" }, desde === null ? "" : pesos.format(desde)),
                );
              }),
            ),
          )
        : null,
    ),
  );

  elegir(elegida);
  return vista;
}
