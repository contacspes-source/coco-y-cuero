/** Ajuste masivo de precios con vista previa antes de aplicar. */
import {
  cambiosDe,
  planearAjuste,
  type AlcanceDeAjuste,
  type ReglaDeAjuste,
  type RenglonDeAjuste,
} from "../../negocio/catalogo";
import { esDeSesion, mensajeDe } from "../../negocio/errores";
import { AJUSTES } from "../../negocio/precios";
import { estado, recargar, servicios } from "../estado";
import { avisar, confirmar, conBotonOcupado, fmtPesos, h, selector, vaciar } from "../ui";
import { chipMargen } from "./catalogo";

export function vistaPrecios(alSesionVencida: () => void): HTMLElement {
  const catalogos = estado.catalogos!;
  const alcance: AlcanceDeAjuste = { categoriaId: null, generoId: null, soloPublicados: true };
  let regla: ReglaDeAjuste = { modo: "porcentaje", porcentaje: 5 };
  let plan: RenglonDeAjuste[] = [];

  const resumen = h("div", { clase: "ajuste-resumen" });
  const tabla = h("div", { clase: "ajuste-tabla" });
  const aplicar = h("button", { clase: "boton boton-primario", type: "button", al: { click: () => void aplicarPlan() } });

  const num = (v: string) => (v === "" ? null : Number(v));

  const porcentaje = h("input", {
    type: "number",
    step: 1,
    min: -50,
    max: 100,
    value: 5,
    clase: "entrada-porcentaje",
    "aria-label": "Porcentaje",
    al: { input: () => { regla = { modo: "porcentaje", porcentaje: Number(porcentaje.value) || 0 }; modoPorcentaje.checked = true; recalcular(); } },
  });
  const modoPorcentaje = h("input", {
    type: "radio", name: "modo", checked: true,
    al: { change: () => { regla = { modo: "porcentaje", porcentaje: Number(porcentaje.value) || 0 }; recalcular(); } },
  });
  const modoFormula = h("input", {
    type: "radio", name: "modo",
    al: { change: () => { regla = { modo: "formula" }; recalcular(); } },
  });

  function recalcular() {
    plan = planearAjuste(estado.perfumes, catalogos, alcance, regla);
    const cambian = plan.filter((r) => r.estado === "cambia");
    const rechazados = plan.filter((r) => r.estado === "rechazado");
    const diferencia = cambian.reduce((s, r) => s + (r.despues - r.antes), 0);

    vaciar(
      resumen,
      h("p", null, h("strong", null, String(cambian.length)), " precios cambian"),
      h("p", null, h("strong", null, String(plan.length - cambian.length - rechazados.length)), " se quedan igual"),
      h("p", { clase: rechazados.length ? "alerta" : undefined }, h("strong", null, String(rechazados.length)), " no se pueden aplicar"),
      h("p", null, "Diferencia total: ", h("strong", null, `${diferencia >= 0 ? "+" : ""}${fmtPesos(diferencia)}`)),
    );

    aplicar.textContent = cambian.length ? `Aplicar ${cambian.length} cambios` : "No hay cambios";
    aplicar.disabled = cambian.length === 0;

    const visibles = [...plan].sort((a, b) => orden(a) - orden(b));
    vaciar(
      tabla,
      visibles.length === 0
        ? h("div", { clase: "vacio" }, h("p", null, "Ningún perfume entra en este alcance."))
        : h(
            "table",
            null,
            h(
              "thead",
              null,
              h("tr", null, h("th", null, "Perfume"), h("th", null, "Costo"), h("th", null, "Antes"), h("th", null, "Después"), h("th", null, "Margen")),
            ),
            h(
              "tbody",
              null,
              visibles.map((r) =>
                h(
                  "tr",
                  { clase: `ajuste-${r.estado}` },
                  h("td", null, r.etiqueta, r.motivo ? h("span", { clase: "ajuste-motivo" }, r.motivo) : null),
                  h("td", { clase: "num" }, fmtPesos(r.costo)),
                  h("td", { clase: "num" }, fmtPesos(r.antes)),
                  h("td", { clase: "num fuerte" }, r.estado === "rechazado" ? "—" : fmtPesos(r.despues)),
                  h("td", null, r.estado === "rechazado" ? null : chipMargen(r.despues, r.costo)),
                ),
              ),
            ),
          ),
    );
  }

  const orden = (r: RenglonDeAjuste) => (r.estado === "rechazado" ? 0 : r.estado === "cambia" ? 1 : 2);

  async function aplicarPlan() {
    const n = cambiosDe(plan).length;
    const ok = await confirmar({
      titulo: `¿Aplicar ${n} cambios de precio?`,
      texto: "Se aplican todos juntos: si alguno falla, no se cambia ninguno. Los precios nuevos se verán en el sitio de inmediato.",
      aceptar: "Aplicar",
    });
    if (!ok) return;
    try {
      const hechos = await conBotonOcupado(aplicar, "Aplicando…", async () => {
        const r = await servicios.catalogo.aplicarAjuste(plan);
        await recargar();
        return r;
      });
      avisar(`${hechos} precios actualizados.`, "exito");
      recalcular();
    } catch (e) {
      avisar(mensajeDe(e), "error");
      if (esDeSesion(e)) alSesionVencida();
    }
  }

  const vista = h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h("div", null, h("a", { clase: "volver", href: "#/" }, "← Catálogo"), h("h1", null, "Ajustar precios")),
    ),
    h(
      "div",
      { clase: "ajuste-controles" },
      h(
        "section",
        { clase: "panel" },
        h("h2", null, "¿A cuáles?"),
        h(
          "div",
          { clase: "campos-3" },
          selector(
            [{ valor: "", texto: "Todas las categorías" }, ...catalogos.categorias.map((c) => ({ valor: String(c.id), texto: c.nombre }))],
            "",
            (v) => { alcance.categoriaId = num(v); recalcular(); },
            { "aria-label": "Categoría" },
          ),
          selector(
            [{ valor: "", texto: "Todos los géneros" }, ...catalogos.generos.map((g) => ({ valor: String(g.id), texto: g.nombre }))],
            "",
            (v) => { alcance.generoId = num(v); recalcular(); },
            { "aria-label": "Género" },
          ),
          selector(
            [{ valor: "si", texto: "Solo los que están en venta" }, { valor: "no", texto: "Incluir los de baja" }],
            "si",
            (v) => { alcance.soloPublicados = v === "si"; recalcular(); },
            { "aria-label": "Estado" },
          ),
        ),
      ),
      h(
        "section",
        { clase: "panel" },
        h("h2", null, "¿Cómo?"),
        h(
          "label",
          { clase: "opcion" },
          modoPorcentaje,
          h("span", null, "Mover un porcentaje: ", porcentaje, " %"),
        ),
        h(
          "label",
          { clase: "opcion" },
          modoFormula,
          h(
            "span",
            null,
            "Recalcular con la fórmula ",
            h(
              "small",
              null,
              `(costo × ${AJUSTES.colchon} × ${AJUSTES.multiplicador.arabes} en árabes, × ${AJUSTES.multiplicador.disenador} en diseñador y nicho)`,
            ),
          ),
        ),
        h("p", { clase: "panel-ayuda" }, "Todo se redondea a decenas. Lo que quedaría por debajo del costo se descarta solo."),
      ),
    ),
    resumen,
    tabla,
    h("div", { clase: "barra-guardar" }, h("a", { clase: "boton boton-fantasma", href: "#/" }, "Cancelar"), aplicar),
  );

  recalcular();
  return vista;
}
