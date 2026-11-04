/** Clientes: lista con búsqueda, ficha con sus pedidos, alta manual. */
import type { ClienteAdmin, ClienteEditable } from "../../../compartido/tipos";
import { ErrorDeValidacion, esDeSesion, mensajeDe } from "../../negocio/errores";
import { enlaceWhatsApp, esActivo, filtrarClientes } from "../../negocio/ventas";
import { estado, recargarVentas, servicios } from "../estado";
import { avisar, campo, confirmar, iconoWhatsApp, conBotonOcupado, fmtPesos, h, marcarErrores, selector, vaciar } from "../ui";
import { chipEstado } from "./pedidos";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
let busqueda = "";
let verBajas = false;

// ------------------------------------------------------------ lista
export function vistaClientes(): HTMLElement {
  const lista = h("div", { clase: "lista", role: "list" });
  const contador = h("p", { clase: "contador" });

  function renglon(c: ClienteAdmin): HTMLElement {
    const wa = enlaceWhatsApp(c.telefono, `Hola ${c.nombre.split(" ")[0]}, te escribo de Coco & Cuero.`);
    return h(
      "article",
      { clase: `renglon renglon-cliente${c.activo ? "" : " de-baja"}`, role: "listitem" },
      h("div", { clase: "numero-cliente" }, `#${c.numeroCliente}`),
      h(
        "div",
        { clase: "renglon-nombre" },
        h("a", { clase: "renglon-titulo", href: `#/clientes/${c.id}` }, c.nombre),
        h("p", { clase: "renglon-detalle" }, [c.telefono, c.correo].filter(Boolean).join(" · ") || "Sin contacto"),
      ),
      h(
        "div",
        { clase: "renglon-etiquetas" },
        c.ciudad ? h("span", { clase: "etiqueta etiqueta-suave" }, c.ciudad) : null,
        c.canal ? h("span", { clase: "etiqueta etiqueta-suave", title: c.canalDetalle ?? "" }, c.canalDetalle ? `${c.canal}: ${c.canalDetalle}` : c.canal) : null,
        c.rol === "admin" ? h("span", { clase: "etiqueta" }, "Admin") : c.conCuenta ? h("span", { clase: "etiqueta" }, "Con cuenta") : null,
        c.activo ? null : h("span", { clase: "etiqueta etiqueta-baja" }, "De baja"),
      ),
      h(
        "dl",
        { clase: "renglon-cifras" },
        h("div", null, h("dt", null, "Pedidos"), h("dd", null, String(c.pedidos))),
        h("div", null, h("dt", null, "En curso"), h("dd", { clase: c.pedidosActivos ? "precio" : undefined }, String(c.pedidosActivos))),
        h("div", null, h("dt", null, "Comprado"), h("dd", null, fmtPesos(c.totalEntregado))),
      ),
      h(
        "div",
        { clase: "renglon-acciones" },
        wa ? h("a", { clase: "boton-wa", href: wa, target: "_blank", rel: "noopener", title: "WhatsApp", "aria-label": "WhatsApp" }, iconoWhatsApp()) : null,
        h("a", { clase: "boton boton-fantasma boton-chico", href: `#/clientes/${c.id}` }, "Ver"),
      ),
    );
  }

  function pintar() {
    const base = verBajas ? estado.clientes : estado.clientes.filter((c) => c.activo);
    const visibles = filtrarClientes(base, busqueda);
    const bajas = estado.clientes.filter((c) => !c.activo).length;
    contador.textContent = `${visibles.length} ${visibles.length === 1 ? "cliente" : "clientes"}${bajas && !verBajas ? ` · ${bajas} de baja (ocultos)` : ""}`;
    vaciar(lista, ...(visibles.length ? visibles.map(renglon) : [h("div", { clase: "vacio" }, h("p", null, "Ningún cliente coincide."))]));
  }

  const buscador = h("input", {
    type: "search",
    clase: "buscador",
    placeholder: "Buscar por nombre, número, teléfono o correo…",
    "aria-label": "Buscar",
    value: busqueda,
    al: { input: () => { busqueda = buscador.value; pintar(); } },
  });

  const interruptorBajas = h(
    "label",
    { clase: "interruptor interruptor-filtro" },
    h("input", { type: "checkbox", role: "switch", checked: verBajas, al: { change: (e) => { verBajas = (e.target as HTMLInputElement).checked; pintar(); } } }),
    h("span", { clase: "interruptor-pista", "aria-hidden": "true" }),
    h("span", { clase: "interruptor-texto" }, "Ver dados de baja"),
  );

  const activos = estado.clientes.filter((c) => c.activo);
  const conCuenta = activos.filter((c) => c.conCuenta).length;
  const vista = h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h("div", null, h("p", { clase: "rotulo" }, "Ventas"), h("h1", null, "Clientes")),
      h("div", { clase: "vista-acciones" }, h("a", { clase: "boton boton-primario", href: "#/clientes/nuevo" }, "+ Nuevo cliente")),
    ),
    h(
      "div",
      { clase: "tarjetas-resumen tarjetas-3" },
      ...[
        ["Clientes", String(activos.length), `${conCuenta} con cuenta en la página`],
        ["Con pedidos en curso", String(activos.filter((c) => c.pedidosActivos > 0).length), "esperando algo de ti"],
        ["Vendido", fmtPesos(estado.clientes.reduce((s, c) => s + c.totalEntregado, 0)), "en pedidos entregados"],
      ].map(([t, v, n]) => h("div", { clase: "tarjeta-resumen" }, h("p", { clase: "tarjeta-titulo" }, t!), h("p", { clase: "tarjeta-valor" }, v!), h("p", { clase: "tarjeta-nota" }, n!))),
    ),
    h("div", { clase: "barra barra-clientes" }, buscador, interruptorBajas),
    contador,
    lista,
  );
  pintar();
  return vista;
}

// ------------------------------------------------------------ ficha y alta
export function vistaCliente(idTexto: string, navegar: (r: string) => void, alSesionVencida: () => void): HTMLElement {
  const esNuevo = idTexto === "nuevo";
  const c = esNuevo ? null : estado.clientes.find((x) => x.id === Number(idTexto));
  if (!esNuevo && !c) {
    return h("section", { clase: "vista" }, h("div", { clase: "vacio" }, h("p", null, "Ese cliente no existe."), h("a", { clase: "boton boton-fantasma", href: "#/clientes" }, "Volver")));
  }

  const nombre = h("input", { value: c?.nombre ?? "", maxlength: 80, autocomplete: "off" });
  const telefono = h("input", { type: "tel", value: c?.telefono ?? "", placeholder: "10 dígitos", autocomplete: "off" });
  const ciudad = h("input", { value: c?.ciudad ?? "", maxlength: 60, list: "ciudades" });
  const direccion = h("input", { value: c?.direccion ?? "", maxlength: 200 });
  const canalActual = estado.canales.find((x) => x.nombre === c?.canal)?.id ?? null;
  let canalId: number | null = canalActual;
  const canal = selector(
    [{ valor: "", texto: "—" }, ...estado.canales.map((x) => ({ valor: String(x.id), texto: x.nombre }))],
    canalActual ? String(canalActual) : "",
    (v) => (canalId = v ? Number(v) : null),
  );
  const boton = h("button", { clase: "boton boton-primario", type: "submit" }, esNuevo ? "Dar de alta" : "Guardar cambios");

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "panel",
      novalidate: true,
      al: {
        submit: async (e) => {
          e.preventDefault();
          marcarErrores(form, []);
          const datos: ClienteEditable = {
            id: c?.id,
            nombre: nombre.value,
            telefono: telefono.value,
            ciudad: ciudad.value,
            direccion: direccion.value,
            canalId,
          };
          try {
            const id = await conBotonOcupado(boton, "Guardando…", async () => {
              const id = await servicios.ventas.guardarCliente(datos);
              await recargarVentas();
              return id;
            });
            avisar(esNuevo ? "Cliente dado de alta." : "Datos guardados.", "exito");
            navegar(`#/clientes/${id}`);
          } catch (err) {
            if (err instanceof ErrorDeValidacion) marcarErrores(form, err.problemas);
            else avisar(mensajeDe(err), "error");
            if (esDeSesion(err)) alSesionVencida();
          }
        },
      },
    },
    h("h2", null, "Datos"),
    h("div", { clase: "campos-2" }, campo("Nombre completo", nombre, { nombre: "nombre" }), campo("WhatsApp", telefono, { nombre: "telefono" })),
    h("div", { clase: "campos-2" }, campo("Ciudad", ciudad), campo("¿Cómo nos conoció?", canal)),
    campo("Dirección", direccion, { nombre: "direccion" }),
    h("datalist", { id: "ciudades" }, ["Guadalajara", "Zamora", "Morelia"].map((x) => h("option", { value: x }))),
    c?.conCuenta ? h("p", { clase: "panel-ayuda" }, `Tiene cuenta en la página (${c.correo}). Si cambias sus datos, él también los verá.`) : null,
    h("div", { clase: "panel-pie" }, boton),
  );

  const pedidos = c ? estado.pedidos.filter((p) => p.clienteId === c.id) : [];
  const wa = c ? enlaceWhatsApp(c.telefono, `Hola ${c.nombre.split(" ")[0]}, te escribo de Coco & Cuero.`) : null;

  // baja lógica: desaparece de la lista y no puede apartar, pero sus
  // pedidos e historial se quedan para los reportes
  async function cambiarActivo() {
    if (!c) return;
    if (c.activo) {
      const ok = await confirmar({
        titulo: `¿Dar de baja a ${c.nombre}?`,
        texto: "Ya no podrá apartar desde la página y sus solicitudes pendientes se cancelan. Sus pedidos anteriores se conservan. Lo puedes reactivar cuando quieras.",
        aceptar: "Dar de baja",
        peligro: true,
      });
      if (!ok) return;
    }
    try {
      if (c.activo) await servicios.ventas.darDeBajaCliente(c.id);
      else await servicios.ventas.reactivarCliente(c.id);
      await recargarVentas();
      avisar(c.activo ? `${c.nombre} quedó dado de baja.` : `${c.nombre} vuelve a estar activo.`, "exito");
      navegar(c.activo ? "#/clientes" : `#/clientes/${c.id}`);
    } catch (e) {
      avisar(mensajeDe(e), "error");
      if (esDeSesion(e)) alSesionVencida();
    }
  }

  return h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h(
        "div",
        null,
        h("a", { clase: "volver", href: "#/clientes" }, "← Clientes"),
        h("h1", null, esNuevo ? "Nuevo cliente" : c!.nombre),
        c
          ? h(
              "p",
              { clase: "vista-sub" },
              `Cliente #${c.numeroCliente} · desde ${fecha.format(new Date(c.creadoEn))}`,
              c.canalDetalle ? ` · nos conoció por: ${c.canalDetalle}` : "",
              c.activo ? "" : ` · DE BAJA${c.bajaEn ? ` desde ${fecha.format(new Date(c.bajaEn))}` : ""}`,
            )
          : null,
      ),
      c
        ? h(
            "div",
            { clase: "vista-acciones" },
            wa ? h("a", { clase: "boton boton-fantasma", href: wa, target: "_blank", rel: "noopener" }, "WhatsApp") : null,
            c.rol === "admin"
              ? null
              : h("button", { type: "button", clase: c.activo ? "boton boton-peligro" : "boton boton-fantasma", al: { click: () => void cambiarActivo() } }, c.activo ? "Dar de baja" : "Reactivar"),
            c.activo ? h("a", { clase: "boton boton-primario", href: `#/pedidos/nuevo?cliente=${c.id}` }, "+ Pedido para este cliente") : null,
          )
        : null,
    ),
    h(
      "div",
      { clase: esNuevo ? "" : "formulario-rejilla" },
      h("div", { clase: "formulario-principal" }, form),
      c
        ? h(
            "aside",
            { clase: "formulario-lateral" },
            h(
              "section",
              { clase: "panel" },
              h("h2", null, `Pedidos (${pedidos.length})`),
              pedidos.length
                ? h(
                    "ul",
                    { clase: "mini-pedidos" },
                    pedidos.map((p) =>
                      h(
                        "li",
                        { clase: esActivo(p.estado) ? "" : "inactivo" },
                        h("a", { href: `#/pedidos/${p.id}` }, h("strong", null, `#${p.id} ${p.perfume ?? ""}`), h("span", null, `${fmtPesos(p.precioPactado)}${p.saldo > 0 && esActivo(p.estado) ? ` · debe ${fmtPesos(p.saldo)}` : ""}`)),
                        chipEstado(p.estado),
                      ),
                    ),
                  )
                : h("p", { clase: "panel-ayuda" }, "Todavía no tiene pedidos."),
            ),
          )
        : null,
    ),
  );
}
