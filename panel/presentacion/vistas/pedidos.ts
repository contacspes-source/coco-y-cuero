/** Pedidos: lista por estado, ficha con historial y alta manual. */
import type { EstadoPedido, FormaPago, NuevoPedido, PagoInicial, PedidoAdmin } from "../../../compartido/tipos";
import { ErrorDeValidacion, esDeSesion, mensajeDe } from "../../negocio/errores";
import {
  ESTADOS,
  advertenciaAlAvanzar,
  anticipoSugerido,
  enlaceWhatsApp,
  esActivo,
  filtrarPedidos,
  mensajeParaCliente,
  resumirPedidos,
  siguienteEstado,
  transicionesDe,
  type VistaPedidos,
  gananciaDe,
  FORMAS_PAGO,
  descuentoBienvenida,
  esPrimeraCompra,
  pagoInicialDe,
  precioFinalDe,
} from "../../negocio/ventas";
import { estado, recargar, recargarVentas, servicios } from "../estado";
import { avisar, campo, iconoWhatsApp, confirmar, conBotonOcupado, fmtPesos, h, marcarErrores, selector, vaciar } from "../ui";
import { miniatura } from "./catalogo";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const fechaHora = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function chipEstado(e: EstadoPedido): HTMLElement {
  return h("span", { clase: `chip-estado e-${e}` }, ESTADOS[e].nombre);
}

function nombrePerfume(p: PedidoAdmin): string {
  return p.perfume ? `${p.marca ?? ""} ${p.perfume}`.trim() : "Perfume no disponible";
}

let vistaActual: VistaPedidos = "activos";
let busqueda = "";

/** Botón "Avanzar" con confirmación y aviso de anticipo/saldo. */
export function botonAvanzar(p: PedidoAdmin, alTerminar: () => void, alSesionVencida: () => void): HTMLElement | null {
  const sig = siguienteEstado(p.estado);
  if (!sig) return null;
  const b = h(
    "button",
    {
      type: "button",
      clase: "boton boton-primario boton-chico",
      al: {
        click: async () => {
          const aviso = advertenciaAlAvanzar(p, sig);
          if (aviso && !(await confirmar({ titulo: `¿${ESTADOS[sig].accion}?`, texto: aviso, aceptar: "Sí, continuar" }))) return;
          try {
            await conBotonOcupado(b, "…", () => servicios.ventas.cambiarEstado(p, sig));
            avisar(`Pedido #${p.id}: ${ESTADOS[sig].nombre}.`, "exito");
            alTerminar();
          } catch (e) {
            avisar(mensajeDe(e), "error");
            if (esDeSesion(e)) alSesionVencida();
          }
        },
      },
    },
    ESTADOS[sig].accion,
  );
  return b;
}

// ------------------------------------------------------------ lista
export function vistaPedidos(alSesionVencida: () => void): HTMLElement {
  const resumen = h("div", { clase: "tarjetas-resumen" });
  const pestanas = h("div", { clase: "pestanas", role: "tablist" });
  const lista = h("div", { clase: "lista", role: "list" });
  const contador = h("p", { clase: "contador" });

  const recargarYpintar = async () => {
    try {
      await recargarVentas();
      pintar();
    } catch (e) {
      avisar(mensajeDe(e), "error");
      if (esDeSesion(e)) alSesionVencida();
    }
  };

  function renglon(p: PedidoAdmin): HTMLElement {
    const wa = enlaceWhatsApp(p.clienteTelefono, mensajeParaCliente(p));
    return h(
      "article",
      { clase: `renglon renglon-pedido${esActivo(p.estado) ? "" : " de-baja"}`, role: "listitem" },
      h("a", { clase: "renglon-foto", href: `#/pedidos/${p.id}`, tabindex: -1, "aria-hidden": "true" }, miniatura(p.imagenUrl, "")),
      h(
        "div",
        { clase: "renglon-nombre" },
        h("p", { clase: "renglon-marca" }, `Pedido #${p.id} · ${fecha.format(new Date(p.creadoEn))}`),
        h("a", { clase: "renglon-titulo", href: `#/pedidos/${p.id}` }, `${nombrePerfume(p)}${p.ml ? ` · ${p.ml} ml` : ""}`),
        h("p", { clase: "renglon-detalle" }, `#${p.numeroCliente ?? "—"} ${p.clienteNombre ?? "Cliente"}${p.ciudadEntrega ? ` · ${p.ciudadEntrega}` : ""}`),
      ),
      h("div", { clase: "renglon-etiquetas" }, chipEstado(p.estado)),
      h(
        "dl",
        { clase: "renglon-cifras" },
        h("div", null, h("dt", null, "Precio"), h("dd", { clase: "precio" }, fmtPesos(p.precioPactado))),
        h("div", null, h("dt", null, "Pagado"), h("dd", null, fmtPesos(p.anticipo))),
        h("div", null, h("dt", null, "Saldo"), h("dd", { clase: p.saldo > 0 && esActivo(p.estado) ? "saldo" : undefined }, fmtPesos(p.saldo))),
      ),
      h(
        "div",
        { clase: "renglon-acciones" },
        wa ? h("a", { clase: "boton-wa", href: wa, target: "_blank", rel: "noopener", title: "Mandar mensaje por WhatsApp", "aria-label": "WhatsApp" }, iconoWhatsApp()) : null,
        botonAvanzar(p, () => void recargarYpintar(), alSesionVencida) ?? h("a", { clase: "boton boton-fantasma boton-chico", href: `#/pedidos/${p.id}` }, "Ver"),
      ),
    );
  }

  const buscador = h("input", {
    type: "search",
    clase: "buscador",
    placeholder: "Buscar #pedido, cliente o perfume…",
    "aria-label": "Buscar",
    value: busqueda,
    al: { input: () => { busqueda = buscador.value; pintarLista(); } },
  });

  function pintarLista() {
    const visibles = filtrarPedidos(estado.pedidos, vistaActual, busqueda);
    contador.textContent = `${visibles.length} ${visibles.length === 1 ? "pedido" : "pedidos"}`;
    vaciar(
      lista,
      ...(visibles.length
        ? visibles.map(renglon)
        : [
            h(
              "div",
              { clase: "vacio" },
              h("p", null, estado.pedidos.length ? "No hay pedidos en esta vista." : "Todavía no hay pedidos. Cuando un cliente aparte en la página, aparece aquí."),
              h("a", { clase: "boton boton-fantasma", href: "#/pedidos/nuevo" }, "Registrar un pedido"),
            ),
          ]),
    );
  }

  function pintar() {
    const r = resumirPedidos(estado.pedidos);
    const tarjeta = (titulo: string, valor: string, nota: string, vista?: VistaPedidos, alerta = false) =>
      h(
        vista ? "button" : "div",
        {
          clase: `tarjeta-resumen${alerta ? " alerta" : ""}`,
          type: vista ? "button" : undefined,
          al: vista ? { click: () => { vistaActual = vista; pintar(); } } : undefined,
        },
        h("p", { clase: "tarjeta-titulo" }, titulo),
        h("p", { clase: "tarjeta-valor" }, valor),
        h("p", { clase: "tarjeta-nota" }, nota),
      );
    vaciar(
      resumen,
      tarjeta("Por confirmar", String(r.solicitados), "solicitudes nuevas", "consultado", r.solicitados > 0),
      tarjeta("Por comprar", String(r.apartados), "ya dieron anticipo", "apartado"),
      tarjeta("Por entregar", String(r.comprados), "ya los tienes", "comprado"),
      tarjeta("Por cobrar", fmtPesos(r.porCobrar), `${fmtPesos(r.anticiposEnCurso)} en anticipos`),
    );
    const opciones: [VistaPedidos, string][] = [
      ["activos", `En curso (${r.solicitados + r.apartados + r.comprados})`],
      ["consultado", "Solicitados"],
      ["apartado", "Apartados"],
      ["comprado", "Comprados"],
      ["entregado", `Entregados (${r.conteo.entregado})`],
      ["cancelado", "Cancelados"],
      ["todos", "Todos"],
    ];
    vaciar(
      pestanas,
      ...opciones.map(([v, t]) =>
        h(
          "button",
          { type: "button", role: "tab", clase: `pestana${vistaActual === v ? " activa" : ""}`, "aria-selected": String(vistaActual === v), al: { click: () => { vistaActual = v; pintar(); } } },
          t,
        ),
      ),
    );
    pintarLista();
  }

  const vista = h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h("div", null, h("p", { clase: "rotulo" }, "Ventas"), h("h1", null, "Pedidos")),
      h("div", { clase: "vista-acciones" }, h("a", { clase: "boton boton-primario", href: "#/pedidos/nuevo" }, "+ Registrar pedido")),
    ),
    resumen,
    pestanas,
    h("div", { clase: "barra barra-sola" }, buscador),
    contador,
    lista,
  );
  pintar();
  return vista;
}

// ------------------------------------------------------------ piezas
/** Descuento: ninguno, 10 % de bienvenida u otra cantidad. */
function controlDescuento(opciones: { lista: () => number; inicial: number; primeraCompra: boolean; desactivado?: boolean; alCambiar: () => void }) {
  const { lista, inicial, primeraCompra, desactivado, alCambiar } = opciones;
  const modoInicial = inicial <= 0 ? "ninguno" : inicial === descuentoBienvenida(lista()) ? "bienvenida" : "otro";
  const monto = h("input", { type: "number", min: 0, step: 10, value: modoInicial === "otro" ? inicial : "", placeholder: "Pesos", disabled: desactivado, "aria-label": "Descuento en pesos" });
  const modo = selector(
    [
      { valor: "ninguno", texto: "Sin descuento" },
      { valor: "bienvenida", texto: `10 % de bienvenida${primeraCompra ? " (primera compra)" : ""}` },
      { valor: "otro", texto: "Otra cantidad" },
    ],
    modoInicial,
    () => {
      monto.hidden = modo.value !== "otro";
      if (modo.value === "otro") monto.focus();
      alCambiar();
    },
    { disabled: desactivado },
  );
  monto.hidden = modoInicial !== "otro";
  monto.addEventListener("input", alCambiar);
  const valor = () => {
    if (modo.value === "bienvenida") return descuentoBienvenida(lista());
    if (modo.value === "otro") return monto.value.trim() === "" ? 0 : Number(monto.value);
    return 0;
  };
  const elemento = h("div", { clase: "control-descuento" }, modo, monto);
  return { elemento, valor };
}

function selectorForma(valor: FormaPago | "" = ""): HTMLSelectElement {
  return selector(
    [{ valor: "", texto: "¿Cómo te pagó?" }, ...(Object.entries(FORMAS_PAGO) as [FormaPago, string][]).map(([v, t]) => ({ valor: v, texto: t }))],
    valor,
    () => {},
  );
}

/** Cobros del pedido: lista, "Pagó todo" y registrar un abono. */
function panelPagos(p: PedidoAdmin, alCambiar: () => Promise<void>, alSesionVencida: () => void): HTMLElement {
  const cancelado = p.estado === "cancelado";
  const quedaSaldo = p.saldo > 0 && !cancelado;
  const forma = selectorForma(p.pagos.at(-1)?.forma ?? "");
  const monto = h("input", { type: "number", min: 0, step: 10, value: quedaSaldo ? p.saldo : "", disabled: !quedaSaldo });
  const nota = h("input", { maxlength: 200, placeholder: "Opcional: referencia, quién recibió…", disabled: !quedaSaldo });
  const registrar = h("button", { clase: "boton boton-primario", type: "submit", disabled: !quedaSaldo }, "Registrar pago");
  const todo = h("button", { clase: "boton boton-fantasma", type: "button", disabled: !quedaSaldo }, `Pagó todo (${fmtPesos(p.saldo)})`);

  const ejecutar = async (b: HTMLButtonElement, tarea: () => Promise<void>, exito: string) => {
    marcarErrores(form, []);
    try {
      await conBotonOcupado(b, "Guardando…", async () => {
        await tarea();
        await alCambiar();
      });
      avisar(exito, "exito");
    } catch (err) {
      if (err instanceof ErrorDeValidacion) marcarErrores(form, err.problemas);
      else avisar(mensajeDe(err), "error");
      if (esDeSesion(err)) alSesionVencida();
    }
  };
  todo.addEventListener("click", () =>
    void ejecutar(todo, () => servicios.ventas.liquidar(p, (forma.value || null) as FormaPago | null), `Pedido #${p.id} pagado completo.`),
  );

  const lista = p.pagos.length
    ? h(
        "ul",
        { clase: "pagos-lista" },
        p.pagos.map((x) =>
          h(
            "li",
            null,
            h("span", { clase: "pago-fecha" }, fechaHora.format(new Date(x.fecha))),
            h("span", { clase: "pago-forma" }, FORMAS_PAGO[x.forma] ?? x.forma, x.nota ? h("small", null, ` · ${x.nota}`) : null),
            h("strong", { clase: "pago-monto" }, fmtPesos(x.monto)),
            h(
              "button",
              {
                type: "button",
                clase: "boton-icono",
                title: "Borrar este pago",
                "aria-label": `Borrar pago de ${fmtPesos(x.monto)}`,
                al: {
                  click: async (e) => {
                    if (!(await confirmar({ titulo: "¿Borrar este pago?", texto: `${fmtPesos(x.monto)} en ${FORMAS_PAGO[x.forma]?.toLowerCase() ?? x.forma}. El saldo del pedido vuelve a subir.`, aceptar: "Borrar", peligro: true }))) return;
                    await ejecutar(e.currentTarget as HTMLButtonElement, () => servicios.ventas.eliminarPago(x.id), "Pago borrado.");
                  },
                },
              },
              "×",
            ),
          ),
        ),
      )
    : h("p", { clase: "panel-ayuda" }, cancelado ? "Sin pagos." : "Todavía no hay pagos registrados.");

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "panel panel-pagos",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void ejecutar(
            registrar,
            () => servicios.ventas.registrarPago(p, monto.value.trim() === "" ? Number.NaN : Number(monto.value), (forma.value || null) as FormaPago | null, nota.value),
            "Pago registrado.",
          );
        },
      },
    },
    h(
      "div",
      { clase: "pagos-cabecera" },
      h("h2", null, "Pagos"),
      h(
        "dl",
        { clase: "pagos-totales" },
        h("div", null, h("dt", null, "Pagado"), h("dd", null, fmtPesos(p.anticipo))),
        h("div", null, h("dt", null, "Falta"), h("dd", { clase: quedaSaldo ? "saldo" : "saldo-cero" }, quedaSaldo ? fmtPesos(p.saldo) : "Nada ✓")),
      ),
    ),
    lista,
    quedaSaldo
      ? h(
          "div",
          { clase: "pagos-nuevo" },
          h("div", { clase: "campos-3" }, campo("Monto", monto, { nombre: "monto" }), campo("Forma de pago", forma, { nombre: "forma" }), campo("Nota", nota)),
          h("div", { clase: "panel-pie" }, todo, registrar),
        )
      : null,
  );
  return form;
}

// ------------------------------------------------------------ ficha
export function vistaPedido(id: number, navegar: (r: string) => void, alSesionVencida: () => void): HTMLElement {
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p) {
    return h("section", { clase: "vista" }, h("div", { clase: "vacio" }, h("p", null, "Ese pedido no existe."), h("a", { clase: "boton boton-fantasma", href: "#/pedidos" }, "Volver a pedidos")));
  }
  const cerrado = !esActivo(p.estado);
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

  // precio de lista = lo que pagó el pedido + lo que se le descontó
  const lista = h("input", { type: "number", min: 0, step: 10, value: p.precioPactado + p.descuento, disabled: cerrado });
  const precioFinal = h("strong", null, fmtPesos(p.precioPactado));
  const descuento = controlDescuento({
    lista: () => num(lista.value) || 0,
    inicial: p.descuento,
    primeraCompra: esPrimeraCompra(p.clienteId, estado.pedidos, p.id),
    desactivado: cerrado,
    alCambiar: () => actualizarPrecio(),
  });
  const final = () => (num(lista.value) || 0) - descuento.valor();
  const ciudad = h("input", { value: p.ciudadEntrega ?? "", maxlength: 60, disabled: cerrado });
  const notas = h("textarea", { rows: 2, maxlength: 500 }, p.notas ?? "");
  const notaInterna = h("textarea", { rows: 3, maxlength: 1000, placeholder: "Solo la ves tú: proveedor, acuerdos, recordatorios…" }, p.notaInterna ?? "");
  const costo = h("input", {
    type: "number",
    min: 0,
    step: 10,
    value: p.costoReal ?? "",
    placeholder: p.estado === "consultado" || p.estado === "apartado" ? "Se llena al marcar comprado" : "",
    disabled: p.estado === "cancelado",
  });
  const ganancia = h("strong", null, fmtPesos(gananciaDe(p)));
  const actualizarGanancia = () => {
    const c = num(costo.value);
    ganancia.textContent = Number.isFinite(c) ? fmtPesos(final() - c) : "—";
    ganancia.classList.toggle("negativa", Number.isFinite(c) && final() - c < 0);
  };
  const actualizarPrecio = () => {
    precioFinal.textContent = fmtPesos(final());
    actualizarGanancia();
  };
  costo.addEventListener("input", actualizarGanancia);
  lista.addEventListener("input", actualizarPrecio);

  const botonGuardar = h("button", { clase: "boton boton-primario", type: "submit" }, "Guardar cambios");
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "panel",
      novalidate: true,
      al: {
        submit: async (e) => {
          e.preventDefault();
          marcarErrores(form, []);
          const cambios = cerrado
            ? { notas: notas.value.trim() || null }
            : {
                precioPactado: final(),
                descuento: descuento.valor(),
                ciudadEntrega: ciudad.value.trim() || null,
                notas: notas.value.trim() || null,
              };
          try {
            await conBotonOcupado(botonGuardar, "Guardando…", async () => {
              await servicios.ventas.guardarCambios(p, cambios, notaInterna.value.trim() || null);
              if (p.estado !== "cancelado") await servicios.ventas.guardarCostoReal(p, costo.value);
              await recargarVentas();
            });
            avisar("Pedido actualizado.", "exito");
            navegar(`#/pedidos/${p.id}`);
          } catch (err) {
            if (err instanceof ErrorDeValidacion) marcarErrores(form, err.problemas);
            else avisar(mensajeDe(err), "error");
            if (esDeSesion(err)) alSesionVencida();
          }
        },
      },
    },
    h("h2", null, "Precio y entrega"),
    h(
      "div",
      { clase: "campos-3" },
      campo("Precio de lista", lista, { nombre: "precio" }),
      h("div", { clase: "campo", dataset: { campo: "descuento" } }, h("label", null, "Descuento"), descuento.elemento, h("p", { clase: "campo-error", role: "alert" })),
      h("div", { clase: "campo campo-saldo" }, h("label", null, "Precio final"), precioFinal),
    ),
    h(
      "div",
      { clase: "campos-3 fila-costo" },
      campo("Costo real", costo, {
        nombre: "costo",
        ayuda:
          p.costoOrigen === "catalogo"
            ? "Tomado del catálogo al comprarlo. Corrígelo si pagaste otra cantidad."
            : p.costoOrigen === "manual"
              ? "Capturado por ti. Solo tú lo ves."
              : "Lo que pagaste por el perfume. Solo tú lo ves.",
      }),
      h("div", { clase: "campo campo-saldo" }, h("label", null, "Ganancia"), ganancia),
      h("div"),
    ),
    h(
      "div",
      { clase: "campos-2" },
      campo("Ciudad de entrega", ciudad),
      p.direccionEnvio
        ? h("div", { clase: "campo dato-envio" }, h("label", null, "Dirección de envío"), h("p", null, p.direccionEnvio))
        : h("div"),
    ),
    campo("Notas del cliente", notas, { ayuda: "El cliente las ve en su cuenta." }),
    campo("Nota interna", notaInterna, { ayuda: "Privada. El cliente nunca la ve." }),
    h("div", { clase: "panel-pie" }, botonGuardar),
  );

  const wa = enlaceWhatsApp(p.clienteTelefono, mensajeParaCliente(p));
  const recargarFicha = async () => {
    await recargarVentas();
    navegar(`#/pedidos/${p.id}`);
  };

  const acciones = h(
    "div",
    { clase: "acciones-estado" },
    botonAvanzar(p, () => void recargarFicha(), alSesionVencida),
    transicionesDe(p.estado).includes("cancelado")
      ? h(
          "button",
          {
            type: "button",
            clase: "boton boton-fantasma boton-chico boton-texto-peligro",
            al: {
              click: async () => {
                if (!(await confirmar({ titulo: `¿Cancelar el pedido #${p.id}?`, texto: "Ya no se podrá reactivar. Si hubo anticipo, recuerda acordar con el cliente su devolución o cambio.", aceptar: "Cancelar pedido", peligro: true }))) return;
                try {
                  await servicios.ventas.cambiarEstado(p, "cancelado");
                  avisar(`Pedido #${p.id} cancelado.`, "info");
                  await recargarFicha();
                } catch (e) {
                  avisar(mensajeDe(e), "error");
                }
              },
            },
          },
          "Cancelar pedido",
        )
      : null,
  );

  const pasos: EstadoPedido[] = ["consultado", "apartado", "comprado", "entregado"];
  const cuando = (e: EstadoPedido) => p.historial.find((x) => x.estado === e)?.fecha;
  const historial = h(
    "ol",
    { clase: "historial" },
    [...pasos, ...(p.estado === "cancelado" ? (["cancelado"] as EstadoPedido[]) : [])].map((e) => {
      const f = cuando(e);
      return h(
        "li",
        { clase: `${f ? "hecho" : ""}${p.estado === e ? " actual" : ""}${e === "cancelado" ? " cancelado" : ""}` },
        h("span", { clase: "historial-punto", "aria-hidden": "true" }),
        h("span", { clase: "historial-estado" }, ESTADOS[e].nombre),
        h("span", { clase: "historial-fecha" }, f ? fechaHora.format(new Date(f)) : "—"),
      );
    }),
  );

  return h(
    "section",
    { clase: "vista" },
    h(
      "header",
      { clase: "vista-cabecera" },
      h(
        "div",
        null,
        h("a", { clase: "volver", href: "#/pedidos" }, "← Pedidos"),
        h("h1", null, `Pedido #${p.id}`),
        h("p", { clase: "vista-sub" }, chipEstado(p.estado), ` ${ESTADOS[p.estado].ayuda}`),
      ),
      acciones,
    ),
    h(
      "div",
      { clase: "formulario-rejilla" },
      h(
        "div",
        { clase: "formulario-principal" },
        h(
          "section",
          { clase: "panel panel-pedido" },
          miniatura(p.imagenUrl, "", "mini mini-grande"),
          h(
            "div",
            null,
            h("p", { clase: "renglon-marca" }, p.marca ?? ""),
            h("h2", null, p.perfume ?? "Perfume no disponible"),
            h("p", { clase: "renglon-detalle" }, `${p.ml ? `${p.ml} ml · ` : ""}solicitado el ${fechaHora.format(new Date(p.creadoEn))}`),
            p.perfumeId ? h("a", { clase: "enlace", href: `#/perfume/${p.perfumeId}` }, "Ver perfume en el catálogo") : null,
          ),
        ),
        panelPagos(p, recargarFicha, alSesionVencida),
        form,
      ),
      h(
        "aside",
        { clase: "formulario-lateral" },
        h(
          "section",
          { clase: "panel" },
          h("h2", null, "Cliente"),
          h("p", { clase: "cliente-nombre" }, p.clienteNombre ?? "—"),
          h("p", { clase: "renglon-detalle" }, `Cliente #${p.numeroCliente ?? "—"}${p.clienteTelefono ? ` · ${p.clienteTelefono}` : ""}`),
          h(
            "div",
            { clase: "foto-acciones" },
            h("a", { clase: "boton boton-fantasma boton-chico", href: `#/clientes/${p.clienteId}` }, "Ver ficha"),
            wa ? h("a", { clase: "boton boton-primario boton-chico", href: wa, target: "_blank", rel: "noopener" }, "Mensaje por WhatsApp") : h("span", { clase: "renglon-detalle" }, "Sin teléfono"),
          ),
          wa ? h("p", { clase: "panel-ayuda mensaje-previo" }, mensajeParaCliente(p)) : null,
        ),
        h("section", { clase: "panel" }, h("h2", null, "Historial"), historial),
      ),
    ),
  );
}

// ------------------------------------------------------------ alta
const OPCIONES_PAGO: { valor: PagoInicial; titulo: string; ayuda: string }[] = [
  { valor: "nada", titulo: "Aún no paga", ayuda: "Queda como Solicitado." },
  { valor: "anticipo", titulo: "Dejó anticipo", ayuda: "Queda Apartado; el resto se cobra al entregar." },
  { valor: "completo", titulo: "Pagó completo", ayuda: "Queda Apartado y pagado; falta comprarlo o entregarlo." },
  { valor: "venta-directa", titulo: "Venta en el momento", ayuda: "Se lo entregaste y te pagó: queda Entregado." },
];

export function vistaNuevoPedido(clienteInicial: number | null, navegar: (r: string) => void, alSesionVencida: () => void): HTMLElement {
  let clienteId = clienteInicial;
  let presentacionId: number | null = null;

  const lista = h("input", { type: "number", min: 0, step: 10 });
  const precioFinal = h("strong", null, "—");
  const anticipo = h("input", { type: "number", min: 0, step: 10 });
  const ayudaAnticipo = h("p", { clase: "campo-ayuda" });
  const forma = selectorForma();
  const ciudad = h("input", { maxlength: 60, value: estado.clientes.find((x) => x.id === clienteInicial)?.ciudad ?? "" });
  const notas = h("textarea", { rows: 2, maxlength: 500 });
  const notaInterna = h("textarea", { rows: 2, maxlength: 1000 });
  const boton = h("button", { clase: "boton boton-primario", type: "submit" }, "Registrar pedido");
  const resumenCobro = h("p", { clase: "resumen-cobro", "aria-live": "polite" });

  let pagoInicial: PagoInicial = "nada";
  const radios = OPCIONES_PAGO.map((o) =>
    h(
      "label",
      { clase: "opcion-pago" },
      h("input", {
        type: "radio",
        name: "pago-inicial",
        value: o.valor,
        checked: o.valor === "nada",
        al: { change: () => { pagoInicial = o.valor; refrescar(); } },
      }),
      h("span", { clase: "opcion-pago-titulo" }, o.titulo),
      h("span", { clase: "opcion-pago-ayuda" }, o.ayuda),
    ),
  );
  const filaAnticipo = h("div", { clase: "campo", dataset: { campo: "anticipo" } }, h("label", null, "¿Cuánto dejó?"), anticipo, ayudaAnticipo, h("p", { clase: "campo-error", role: "alert" }));
  const filaForma = campo("Forma de pago", forma, { nombre: "forma" });

  // el descuento se arma cada vez que cambia el cliente (para saber si es su primera compra)
  const cajaDescuento = h("div", { clase: "campo", dataset: { campo: "descuento" } });
  let descuento = controlDescuento({ lista: () => Number(lista.value) || 0, inicial: 0, primeraCompra: false, alCambiar: () => refrescar() });
  const armarDescuento = () => {
    const primera = esPrimeraCompra(clienteId, estado.pedidos);
    descuento = controlDescuento({
      lista: () => Number(lista.value) || 0,
      inicial: primera && Number(lista.value) > 0 ? descuentoBienvenida(Number(lista.value)) : 0,
      primeraCompra: primera,
      alCambiar: () => refrescar(),
    });
    vaciar(cajaDescuento, h("label", null, "Descuento"), descuento.elemento, h("p", { clase: "campo-error", role: "alert" }));
  };

  const datos = (): NuevoPedido => ({
    clienteId,
    presentacionId,
    precioLista: lista.value === "" ? Number.NaN : Number(lista.value),
    descuento: descuento.valor(),
    pagoInicial,
    anticipo: anticipo.value === "" ? Number.NaN : Number(anticipo.value),
    formaPago: (forma.value || null) as FormaPago | null,
    ciudadEntrega: ciudad.value,
    notas: notas.value,
    notaInterna: notaInterna.value,
  });

  function refrescar() {
    const d = datos();
    const final = precioFinalDe(d);
    precioFinal.textContent = Number.isFinite(final) && final > 0 ? fmtPesos(final) : "—";
    filaAnticipo.hidden = pagoInicial !== "anticipo";
    filaForma.hidden = pagoInicial === "nada";
    ayudaAnticipo.textContent = final > 0 ? `Sugerido: ${fmtPesos(anticipoSugerido(final))}` : "";
    const cobro = Number.isFinite(final) && final > 0 ? pagoInicialDe(d) : 0;
    resumenCobro.textContent =
      !(final > 0) ? "" :
      pagoInicial === "nada" ? `Total ${fmtPesos(final)}. No se registra ningún pago.` :
      pagoInicial === "anticipo" ? (cobro > 0 ? `Se registra un pago de ${fmtPesos(cobro)}; quedan ${fmtPesos(Math.max(0, final - cobro))} por cobrar.` : "") :
      `Se registra un pago de ${fmtPesos(final)}; no queda nada por cobrar.`;
    boton.textContent = pagoInicial === "venta-directa" ? "Registrar venta" : "Registrar pedido";
  }

  const cliente = selector(
    [
      { valor: "", texto: "Elige un cliente…" },
      ...[...estado.clientes]
        .filter((c) => c.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((c) => ({ valor: String(c.id), texto: `${c.nombre} · #${c.numeroCliente}${c.telefono ? ` · ${c.telefono}` : ""}` })),
    ],
    clienteInicial ? String(clienteInicial) : "",
    (v) => {
      clienteId = v ? Number(v) : null;
      const c = estado.clientes.find((x) => x.id === clienteId);
      if (c?.ciudad && !ciudad.value) ciudad.value = c.ciudad;
      armarDescuento();
      refrescar();
    },
  );

  const opcionesPerfume = [...estado.perfumes]
    .filter((p) => p.publicado)
    .sort((a, b) => `${a.marca} ${a.nombre}`.localeCompare(`${b.marca} ${b.nombre}`))
    .flatMap((p) => p.presentaciones.map((pr) => ({ valor: String(pr.id), texto: `${p.marca} ${p.nombre} · ${pr.ml} ml · ${fmtPesos(pr.precioVenta)}`, precio: pr.precioVenta })));
  const presentacion = selector([{ valor: "", texto: "Elige perfume y tamaño…" }, ...opcionesPerfume], "", (v) => {
    presentacionId = v ? Number(v) : null;
    const o = opcionesPerfume.find((x) => x.valor === v);
    if (o) lista.value = String(o.precio);
    armarDescuento();
    refrescar();
  });
  lista.addEventListener("input", () => { armarDescuento(); refrescar(); });
  anticipo.addEventListener("input", refrescar);

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "vista formulario",
      novalidate: true,
      al: {
        submit: async (e) => {
          e.preventDefault();
          marcarErrores(form, []);
          try {
            const id = await conBotonOcupado(boton, "Guardando…", async () => {
              const id = await servicios.ventas.crearPedido(datos());
              await recargarVentas();
              return id;
            });
            avisar(pagoInicial === "venta-directa" ? `Venta #${id} registrada.` : `Pedido #${id} registrado.`, "exito");
            navegar(`#/pedidos/${id}`);
          } catch (err) {
            if (err instanceof ErrorDeValidacion) marcarErrores(form, err.problemas);
            else avisar(mensajeDe(err), "error");
            if (esDeSesion(err)) alSesionVencida();
          }
        },
      },
    },
    h("header", { clase: "vista-cabecera" }, h("div", null, h("a", { clase: "volver", href: "#/pedidos" }, "← Pedidos"), h("h1", null, "Registrar pedido"))),
    h(
      "section",
      { clase: "panel panel-angosto" },
      h("p", { clase: "panel-ayuda" }, "Para pedidos que llegan por WhatsApp, Instagram o en persona. Los que se apartan en la página llegan solos."),
      campo("Cliente", cliente, { nombre: "cliente", ayuda: "¿No está? Dalo de alta primero en Clientes." }),
      campo("Perfume y tamaño", presentacion, { nombre: "presentacion" }),
      h(
        "div",
        { clase: "campos-3" },
        campo("Precio de lista", lista, { nombre: "precio" }),
        cajaDescuento,
        h("div", { clase: "campo campo-saldo" }, h("label", null, "Precio final"), precioFinal),
      ),
      h("fieldset", { clase: "opciones-pago", dataset: { campo: "pago" } }, h("legend", null, "¿Cómo va el pago?"), ...radios),
      h("div", { clase: "campos-2" }, filaAnticipo, filaForma),
      resumenCobro,
      campo("Ciudad de entrega", ciudad),
      campo("Notas del cliente", notas, { ayuda: "El cliente las ve en su cuenta." }),
      campo("Nota interna", notaInterna, { ayuda: "Privada." }),
    ),
    h("div", { clase: "barra-guardar" }, h("a", { clase: "boton boton-fantasma", href: "#/pedidos" }, "Cancelar"), boton),
  );
  armarDescuento();
  refrescar();
  if (estado.perfumes.length === 0) void recargar();
  return form;
}
