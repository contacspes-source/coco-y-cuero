/** Pedidos: lista por estado, ficha con historial y alta manual. */
import type { EstadoPedido, NuevoPedido, PedidoAdmin } from "../../../compartido/tipos";
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
        h("div", null, h("dt", null, "Anticipo"), h("dd", null, fmtPesos(p.anticipo))),
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

// ------------------------------------------------------------ ficha
export function vistaPedido(id: number, navegar: (r: string) => void, alSesionVencida: () => void): HTMLElement {
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p) {
    return h("section", { clase: "vista" }, h("div", { clase: "vacio" }, h("p", null, "Ese pedido no existe."), h("a", { clase: "boton boton-fantasma", href: "#/pedidos" }, "Volver a pedidos")));
  }
  const cerrado = !esActivo(p.estado);
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

  const precio = h("input", { type: "number", min: 0, step: 10, value: p.precioPactado, disabled: cerrado });
  const anticipo = h("input", { type: "number", min: 0, step: 10, value: p.anticipo, disabled: cerrado });
  const ciudad = h("input", { value: p.ciudadEntrega ?? "", maxlength: 60, disabled: cerrado });
  const notas = h("textarea", { rows: 2, maxlength: 500 }, p.notas ?? "");
  const notaInterna = h("textarea", { rows: 3, maxlength: 1000, placeholder: "Solo la ves tú: proveedor, acuerdos, recordatorios…" }, p.notaInterna ?? "");
  const saldo = h("strong", null, fmtPesos(p.saldo));
  const actualizarSaldo = () => { saldo.textContent = fmtPesos((num(precio.value) || 0) - (num(anticipo.value) || 0)); };
  precio.addEventListener("input", actualizarSaldo);
  anticipo.addEventListener("input", actualizarSaldo);

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
                precioPactado: num(precio.value),
                anticipo: num(anticipo.value),
                ciudadEntrega: ciudad.value.trim() || null,
                notas: notas.value.trim() || null,
              };
          try {
            await conBotonOcupado(botonGuardar, "Guardando…", async () => {
              await servicios.ventas.guardarCambios(p, cambios, notaInterna.value.trim() || null);
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
    h("h2", null, "Cobro y entrega"),
    h(
      "div",
      { clase: "campos-3" },
      campo("Precio pactado", precio, { nombre: "precio" }),
      campo("Anticipo recibido", anticipo, {
        nombre: "anticipo",
        ayuda: cerrado ? undefined : `Sugerido: ${fmtPesos(anticipoSugerido(p.precioPactado))}`,
      }),
      h("div", { clase: "campo campo-saldo" }, h("label", null, "Saldo"), saldo),
    ),
    h(
      "div",
      { clase: "campos-2" },
      campo("Ciudad de entrega", ciudad),
      p.direccionEnvio
        ? h("div", { clase: "campo dato-envio" }, h("label", null, "Dirección de envío"), h("p", null, p.direccionEnvio))
        : h("div"),
    ),
    p.descuento > 0
      ? h("p", { clase: "dato-descuento" }, `Primera compra: se aplicó 10 % de bienvenida (${fmtPesos(p.descuento)} menos que el precio de lista).`)
      : null,
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
export function vistaNuevoPedido(clienteInicial: number | null, navegar: (r: string) => void, alSesionVencida: () => void): HTMLElement {
  const nuevo: NuevoPedido = { clienteId: clienteInicial, presentacionId: null, precioPactado: 0, anticipo: 0, ciudadEntrega: "", notas: "", notaInterna: "" };

  const cliente = selector(
    [
      { valor: "", texto: "Elige un cliente…" },
      ...[...estado.clientes]
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((c) => ({ valor: String(c.id), texto: `${c.nombre} · #${c.numeroCliente}${c.telefono ? ` · ${c.telefono}` : ""}` })),
    ],
    clienteInicial ? String(clienteInicial) : "",
    (v) => {
      nuevo.clienteId = v ? Number(v) : null;
      const c = estado.clientes.find((x) => x.id === nuevo.clienteId);
      if (c?.ciudad && !ciudad.value) ciudad.value = c.ciudad;
    },
  );

  const opcionesPerfume = [...estado.perfumes]
    .filter((p) => p.publicado)
    .sort((a, b) => `${a.marca} ${a.nombre}`.localeCompare(`${b.marca} ${b.nombre}`))
    .flatMap((p) => p.presentaciones.map((pr) => ({ valor: String(pr.id), texto: `${p.marca} ${p.nombre} · ${pr.ml} ml · ${fmtPesos(pr.precioVenta)}`, precio: pr.precioVenta })));
  const precio = h("input", { type: "number", min: 0, step: 10 });
  const anticipo = h("input", { type: "number", min: 0, step: 10, value: 0 });
  const presentacion = selector([{ valor: "", texto: "Elige perfume y tamaño…" }, ...opcionesPerfume], "", (v) => {
    nuevo.presentacionId = v ? Number(v) : null;
    const o = opcionesPerfume.find((x) => x.valor === v);
    if (o) {
      precio.value = String(o.precio);
      ayudaAnticipo.textContent = `Sugerido: ${fmtPesos(anticipoSugerido(o.precio))}`;
    }
  });
  const ayudaAnticipo = h("p", { clase: "campo-ayuda" }, "Si ya pagó anticipo, el pedido nace como Apartado.");
  const ciudad = h("input", { maxlength: 60, value: estado.clientes.find((x) => x.id === clienteInicial)?.ciudad ?? "" });
  const notas = h("textarea", { rows: 2, maxlength: 500 });
  const notaInterna = h("textarea", { rows: 2, maxlength: 1000 });
  const boton = h("button", { clase: "boton boton-primario", type: "submit" }, "Registrar pedido");

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "vista formulario",
      novalidate: true,
      al: {
        submit: async (e) => {
          e.preventDefault();
          marcarErrores(form, []);
          const datos: NuevoPedido = {
            ...nuevo,
            precioPactado: precio.value === "" ? Number.NaN : Number(precio.value),
            anticipo: anticipo.value === "" ? 0 : Number(anticipo.value),
            ciudadEntrega: ciudad.value,
            notas: notas.value,
            notaInterna: notaInterna.value,
          };
          try {
            const id = await conBotonOcupado(boton, "Guardando…", async () => {
              const id = await servicios.ventas.crearPedido(datos);
              await recargarVentas();
              return id;
            });
            avisar(`Pedido #${id} registrado.`, "exito");
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
        { clase: "campos-2" },
        campo("Precio pactado", precio, { nombre: "precio", ayuda: "Puedes ajustarlo si diste descuento." }),
        h("div", { clase: "campo", dataset: { campo: "anticipo" } }, h("label", null, "Anticipo recibido"), anticipo, ayudaAnticipo, h("p", { clase: "campo-error", role: "alert" })),
      ),
      campo("Ciudad de entrega", ciudad),
      campo("Notas del cliente", notas, { ayuda: "El cliente las ve en su cuenta." }),
      campo("Nota interna", notaInterna, { ayuda: "Privada." }),
    ),
    h("div", { clase: "barra-guardar" }, h("a", { clase: "boton boton-fantasma", href: "#/pedidos" }, "Cancelar"), boton),
  );
  if (estado.perfumes.length === 0) void recargar();
  return form;
}
