/**
 * Pantallas de la cuenta del cliente dentro de la hoja lateral:
 * entrar, crear cuenta, recuperar contraseña, Mi cuenta y Apartar.
 */
import { avisar, campo, conBotonOcupado, h, marcarErrores, vaciar } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  ESTADO_CLIENTE,
  ErrorDeValidacion,
  LARGO_MINIMO_CONTRASENA,
  etapasDe,
  pedidosActivos,
  sePuedeCancelar,
  type PedidoPropio,
  type Perfil,
} from "../negocio/cuenta";
import { cuenta } from "../negocio/servicio";
import { CIUDADES, OTRA_CIUDAD } from "../negocio/tienda";
import { linkWhatsApp } from "./config";
import { abrirHoja, cerrarHoja, type Hoja } from "./hoja";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

let correo: string | null = null;
let botonCabecera: HTMLButtonElement | null = null;
let alCambiarSesion: () => void = () => {};

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error. Inténtalo de nuevo.");
const volverAqui = () => `${location.origin}/`;

function actualizarBoton() {
  if (!botonCabecera) return;
  botonCabecera.textContent = correo ? "Mi cuenta" : "Entrar";
  botonCabecera.classList.toggle("con-sesion", Boolean(correo));
}

export const haySesion = () => correo !== null;

/** Se llama al cargar la página: restaura la sesión si existe. */
export async function iniciarCuenta(boton: HTMLButtonElement, conSesionPrevia: boolean, alCambiar: () => void) {
  botonCabecera = boton;
  alCambiarSesion = alCambiar;
  boton.addEventListener("click", () => (correo ? abrirMiCuenta() : abrirEntrar()));
  actualizarBoton();
  if (!conSesionPrevia) return;
  await prepararSesion();
}

let preparada = false;
async function prepararSesion() {
  if (preparada) return;
  preparada = true;
  await cuenta.alCambiar(async (evento) => {
    if (evento === "recuperar-contrasena") abrirNuevaContrasena();
    if (evento === "salio") correo = null;
    if (evento === "entro") correo = await cuenta.correoActual();
    actualizarBoton();
    alCambiarSesion();
  });
  correo = await cuenta.correoActual();
  actualizarBoton();
  // venimos del enlace de confirmación del correo
  if (correo && /type=signup/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
    avisar("¡Cuenta confirmada! Ya puedes apartar perfumes.", "exito");
  }
}

// ------------------------------------------------------------ piezas
function encabezado(titulo: string, texto?: string): HTMLElement[] {
  const nodos: HTMLElement[] = [h("p", { clase: "rotulo" }, "Mi cuenta"), h("h2", { clase: "cta-titulo" }, titulo)];
  if (texto) nodos.push(h("p", { clase: "cta-texto" }, texto));
  return nodos;
}

function errorGeneral(): HTMLParagraphElement {
  return h("p", { clase: "cta-error", role: "alert" });
}

function selectorCiudad(valor: string | null): HTMLSelectElement {
  const s = h(
    "select",
    null,
    h("option", { value: "" }, "Elige…"),
    CIUDADES.map((c) => h("option", { value: c }, c)),
    h("option", { value: OTRA_CIUDAD }, OTRA_CIUDAD),
  );
  s.value = valor && [...CIUDADES, OTRA_CIUDAD].includes(valor) ? valor : valor ? OTRA_CIUDAD : "";
  return s;
}

async function manejar(form: HTMLFormElement, error: HTMLElement, boton: HTMLButtonElement, texto: string, tarea: () => Promise<void>) {
  error.textContent = "";
  marcarErrores(form, []);
  try {
    await conBotonOcupado(boton, texto, tarea);
  } catch (e) {
    if (e instanceof ErrorDeValidacion) marcarErrores(form, e.problemas);
    else error.textContent = mensaje(e);
  }
}

// ------------------------------------------------------------ entrar
export function abrirEntrar(continuar?: () => void, aviso?: string) {
  const hoja = abrirHoja({ etiqueta: "Entrar a mi cuenta", clase: "hoja-angosta" });
  const correoIn = h("input", { type: "email", autocomplete: "email", inputmode: "email", required: true });
  const clave = h("input", { type: "password", autocomplete: "current-password", required: true });
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Entrar");
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Entrando…", async () => {
            await prepararSesion();
            await cuenta.entrar(correoIn.value, clave.value);
            correo = await cuenta.correoActual();
            actualizarBoton();
            alCambiarSesion();
            if (continuar) continuar();
            else abrirMiCuenta();
          });
        },
      },
    },
    campo("Correo", correoIn, { nombre: "correo" }),
    campo("Contraseña", clave, { nombre: "contrasena" }),
    error,
    boton,
    h(
      "button",
      {
        type: "button",
        clase: "enlace",
        al: {
          click: () =>
            void manejar(form, error, boton, "Entrar", async () => {
              await prepararSesion();
              await cuenta.recuperar(correoIn.value, volverAqui());
              avisar("Te mandamos un correo para crear una contraseña nueva.", "exito");
            }),
        },
      },
      "¿Olvidaste tu contraseña?",
    ),
  );
  hoja.pintar(
    ...encabezado("Entrar", aviso ?? "Aparta perfumes y sigue tus pedidos."),
    form,
    h("p", { clase: "cta-cambio" }, "¿Primera vez? ", h("button", { type: "button", clase: "enlace", al: { click: () => abrirRegistro(continuar) } }, "Crea tu cuenta")),
  );
  queueMicrotask(() => correoIn.focus());
}

// ------------------------------------------------------------ registro
export async function abrirRegistro(continuar?: () => void) {
  const hoja = abrirHoja({ etiqueta: "Crear cuenta", clase: "hoja-angosta" });
  hoja.pintar(...encabezado("Crear cuenta"), h("p", { clase: "cta-texto" }, "Cargando…"));
  await prepararSesion();
  let canales: { id: number; nombre: string }[] = [];
  try {
    canales = await cuenta.canales();
  } catch {
    /* si falla, el registro sigue sin esa pregunta */
  }

  const nombre = h("input", { autocomplete: "name", maxlength: 80 });
  const telefono = h("input", { type: "tel", autocomplete: "tel", inputmode: "tel", placeholder: "33 1234 5678" });
  const correoIn = h("input", { type: "email", autocomplete: "email", inputmode: "email" });
  const clave = h("input", { type: "password", autocomplete: "new-password" });
  const ciudad = selectorCiudad(null);
  const direccion = h("input", { autocomplete: "street-address", maxlength: 200, placeholder: "Opcional, para entregas a domicilio" });
  const canal = h(
    "select",
    null,
    h("option", { value: "" }, "Elige…"),
    canales.map((c) => h("option", { value: c.nombre }, c.nombre)),
  );
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Crear mi cuenta");

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Creando…", async () => {
            const r = await cuenta.registrar(
              {
                nombre: nombre.value,
                telefono: telefono.value,
                correo: correoIn.value,
                contrasena: clave.value,
                ciudad: ciudad.value,
                direccion: direccion.value,
                canal: canal.value,
              },
              volverAqui(),
            );
            if (r.requiereConfirmacion) {
              hoja.pintar(
                ...encabezado("Revisa tu correo", `Te mandamos un enlace a ${correoIn.value.trim()} para confirmar tu cuenta. Ábrelo desde este mismo teléfono o computadora.`),
                h("p", { clase: "cta-nota" }, "¿No llega? Revisa spam o promociones. Puede tardar un par de minutos."),
                h("button", { clase: "boton boton-linea boton-ancho", type: "button", al: { click: cerrarHoja } }, "Seguir viendo perfumes"),
              );
            } else {
              correo = await cuenta.correoActual();
              actualizarBoton();
              alCambiarSesion();
              avisar("¡Bienvenido a Coco & Cuero!", "exito");
              if (continuar) continuar();
              else abrirMiCuenta();
            }
          });
        },
      },
    },
    campo("Nombre completo", nombre, { nombre: "nombre" }),
    campo("WhatsApp", telefono, { nombre: "telefono", ayuda: "Ahí te confirmamos cada pedido." }),
    campo("Correo", correoIn, { nombre: "correo" }),
    campo("Contraseña", clave, { nombre: "contrasena", ayuda: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres, con letras y números.` }),
    h("div", { clase: "cta-dos" }, campo("Ciudad", ciudad, { nombre: "ciudad" }), campo("¿Cómo nos conociste?", canal, { nombre: "canal" })),
    campo("Dirección", direccion, { nombre: "direccion" }),
    error,
    boton,
    h("p", { clase: "cta-nota" }, "Usamos tus datos solo para tus pedidos. Nunca los compartimos."),
  );
  hoja.pintar(
    ...encabezado("Crear cuenta", "Recibes tu número de cliente y puedes apartar perfumes en línea."),
    form,
    h("p", { clase: "cta-cambio" }, "¿Ya tienes cuenta? ", h("button", { type: "button", clase: "enlace", al: { click: () => abrirEntrar(continuar) } }, "Entra")),
  );
  queueMicrotask(() => nombre.focus());
}

// ------------------------------------------------------------ nueva contraseña
export function abrirNuevaContrasena() {
  const hoja = abrirHoja({ etiqueta: "Contraseña nueva", clase: "hoja-angosta" });
  const nueva = h("input", { type: "password", autocomplete: "new-password" });
  const repetir = h("input", { type: "password", autocomplete: "new-password" });
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Guardar contraseña");
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Guardando…", async () => {
            await cuenta.cambiarContrasena(nueva.value, repetir.value);
            history.replaceState(null, "", location.pathname + location.search);
            avisar("Contraseña actualizada.", "exito");
            abrirMiCuenta();
          });
        },
      },
    },
    campo("Contraseña nueva", nueva, { nombre: "contrasena" }),
    campo("Repítela", repetir, { nombre: "confirmacion" }),
    error,
    boton,
  );
  hoja.pintar(...encabezado("Contraseña nueva"), form);
}

// ------------------------------------------------------------ mi cuenta
function tarjetaPedido(p: PedidoPropio, alCambiar: () => void): HTMLElement {
  const estado = ESTADO_CLIENTE[p.estado] ?? { titulo: p.estado, texto: "" };
  const foto = urlDeFoto(p.imagenUrl);
  const nombre = p.perfume ? `${p.marca ?? ""} ${p.perfume}`.trim() : "Perfume ya no disponible";
  const etapas = etapasDe(p);
  return h(
    "article",
    { clase: `pedido pedido-${p.estado}` },
    h(
      "div",
      { clase: "pedido-cabeza" },
      foto ? h("img", { src: foto, alt: "", loading: "lazy" }) : h("span", { clase: "pedido-sin-foto" }),
      h(
        "div",
        null,
        h("p", { clase: "pedido-numero" }, `Pedido #${p.id} · ${fecha.format(new Date(p.creadoEn))}`),
        h("p", { clase: "pedido-nombre" }, nombre, p.ml ? h("span", null, ` · ${p.ml} ml`) : null),
        h("p", { clase: "pedido-estado" }, h("span", { clase: "punto" }), estado.titulo),
      ),
    ),
    p.estado === "cancelado"
      ? h("p", { clase: "pedido-texto" }, estado.texto)
      : h(
          "ol",
          { clase: "linea" },
          etapas.map((e) =>
            h(
              "li",
              { clase: `${e.hecha ? "hecha" : ""}${e.actual ? " actual" : ""}` },
              h("span", { clase: "linea-punto", "aria-hidden": "true" }),
              h("span", { clase: "linea-titulo" }, e.titulo),
              h("span", { clase: "linea-fecha" }, e.fecha ? fecha.format(new Date(e.fecha)) : ""),
            ),
          ),
        ),
    p.estado !== "cancelado" ? h("p", { clase: "pedido-texto" }, estado.texto) : null,
    h(
      "dl",
      { clase: "pedido-cifras" },
      h("div", null, h("dt", null, "Precio"), h("dd", null, pesos.format(p.precioPactado))),
      h("div", null, h("dt", null, "Anticipo"), h("dd", null, pesos.format(p.anticipo))),
      h("div", null, h("dt", null, "Por pagar"), h("dd", null, pesos.format(p.saldo))),
    ),
    h(
      "div",
      { clase: "pedido-acciones" },
      h(
        "a",
        { clase: "enlace", target: "_blank", rel: "noopener", href: linkWhatsApp(`Hola, les escribo por mi pedido #${p.id} (${nombre}).`) },
        "Preguntar por WhatsApp",
      ),
      sePuedeCancelar(p)
        ? h(
            "button",
            {
              type: "button",
              clase: "enlace enlace-peligro",
              al: {
                click: async (ev) => {
                  const b = ev.currentTarget as HTMLButtonElement;
                  if (b.dataset.confirmar !== "si") {
                    b.dataset.confirmar = "si";
                    b.textContent = "¿Seguro? Toca otra vez para cancelar";
                    return;
                  }
                  try {
                    await conBotonOcupado(b, "Cancelando…", () => cuenta.cancelar(p.id));
                    avisar(`Pedido #${p.id} cancelado.`, "info");
                    alCambiar();
                  } catch (e) {
                    avisar(mensaje(e), "error");
                  }
                },
              },
            },
            "Cancelar solicitud",
          )
        : null,
    ),
  );
}

function formularioDatos(perfil: Perfil, canales: { id: number; nombre: string }[], alGuardar: () => void): HTMLElement {
  const nombre = h("input", { value: perfil.nombre, autocomplete: "name" });
  const telefono = h("input", { type: "tel", value: perfil.telefono ?? "", autocomplete: "tel" });
  const ciudad = selectorCiudad(perfil.ciudad);
  const direccion = h("input", { value: perfil.direccion ?? "", autocomplete: "street-address", maxlength: 200 });
  const canal = h(
    "select",
    null,
    h("option", { value: "" }, "—"),
    canales.map((c) => h("option", { value: String(c.id) }, c.nombre)),
  );
  canal.value = perfil.canalId ? String(perfil.canalId) : "";
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro", type: "submit" }, "Guardar cambios");
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Guardando…", async () => {
            await cuenta.guardarPerfil({
              nombre: nombre.value,
              telefono: telefono.value,
              ciudad: ciudad.value,
              direccion: direccion.value,
              canalId: canal.value ? Number(canal.value) : null,
            });
            avisar("Datos guardados.", "exito");
            alGuardar();
          });
        },
      },
    },
    campo("Nombre completo", nombre, { nombre: "nombre" }),
    campo("WhatsApp", telefono, { nombre: "telefono" }),
    h("div", { clase: "cta-dos" }, campo("Ciudad", ciudad, { nombre: "ciudad" }), campo("¿Cómo nos conociste?", canal)),
    campo("Dirección", direccion, { nombre: "direccion" }),
    h("p", { clase: "cta-nota" }, `Correo de la cuenta: ${perfil.correo}`),
    error,
    boton,
  );
  return form;
}

export async function abrirMiCuenta(pestana: "pedidos" | "datos" = "pedidos") {
  const hoja = abrirHoja({ etiqueta: "Mi cuenta", clase: "hoja-angosta" });
  hoja.pintar(h("p", { clase: "cta-texto" }, "Cargando tu cuenta…"));
  await prepararSesion();
  let perfil: Perfil | null;
  let pedidos: PedidoPropio[];
  let canales: { id: number; nombre: string }[];
  try {
    [perfil, pedidos, canales] = await Promise.all([cuenta.perfil(), cuenta.misPedidos(), cuenta.canales()]);
  } catch (e) {
    hoja.pintar(...encabezado("Mi cuenta"), h("p", { clase: "cta-error" }, mensaje(e)));
    return;
  }
  if (!perfil) {
    correo = null;
    actualizarBoton();
    abrirEntrar();
    return;
  }
  pintarCuenta(hoja, perfil, pedidos, canales, pestana);
}

function pintarCuenta(hoja: Hoja, perfil: Perfil, pedidos: PedidoPropio[], canales: { id: number; nombre: string }[], pestana: "pedidos" | "datos") {
  const contenido = h("div", { clase: "cta-contenido" });
  const recargar = () => void abrirMiCuenta(pestana);
  const pestanas = h("div", { clase: "cta-pestanas", role: "tablist" });
  const mostrar = (cual: "pedidos" | "datos") => {
    pestana = cual;
    for (const b of pestanas.querySelectorAll("button")) {
      const activa = b.dataset.p === cual;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", String(activa));
    }
    if (cual === "datos") vaciar(contenido, formularioDatos(perfil, canales, recargar));
    else
      vaciar(
        contenido,
        ...(pedidos.length
          ? pedidos.map((p) => tarjetaPedido(p, recargar))
          : [
              h(
                "div",
                { clase: "cta-vacio" },
                h("p", null, "Todavía no tienes pedidos."),
                h("button", { type: "button", clase: "boton boton-linea", al: { click: () => { cerrarHoja(); document.getElementById("catalogo")?.scrollIntoView(); } } }, "Ver catálogo"),
              ),
            ]),
      );
  };
  pestanas.append(
    h("button", { type: "button", role: "tab", dataset: { p: "pedidos" }, al: { click: () => mostrar("pedidos") } }, `Mis pedidos${pedidos.length ? ` (${pedidos.length})` : ""}`),
    h("button", { type: "button", role: "tab", dataset: { p: "datos" }, al: { click: () => mostrar("datos") } }, "Mis datos"),
  );
  const activos = pedidosActivos(pedidos);
  hoja.pintar(
    h("p", { clase: "rotulo" }, "Mi cuenta"),
    h("h2", { clase: "cta-titulo" }, `Hola, ${perfil.nombre.split(" ")[0]}`),
    h(
      "div",
      { clase: "cta-tarjeta" },
      h("div", null, h("span", null, "Número de cliente"), h("strong", null, `#${perfil.numeroCliente}`)),
      h("div", null, h("span", null, "Pedidos en curso"), h("strong", null, String(activos))),
    ),
    pestanas,
    contenido,
    h(
      "button",
      {
        type: "button",
        clase: "enlace cta-salir",
        al: {
          click: async () => {
            await cuenta.salir();
            correo = null;
            actualizarBoton();
            alCambiarSesion();
            cerrarHoja();
            avisar("Cerraste sesión.", "info");
          },
        },
      },
      "Cerrar sesión",
    ),
  );
  mostrar(pestana);
}

// ------------------------------------------------------------ apartar
export async function abrirApartar(p: PerfumePublico, pr: PerfumePublico["presentaciones"][number], volver: () => void) {
  if (!correo) {
    abrirEntrar(() => void abrirApartar(p, pr, volver), "Entra o crea tu cuenta para apartar. Es rápido.");
    return;
  }
  const hoja = abrirHoja({ etiqueta: `Apartar ${p.nombre}`, clase: "hoja-angosta" });
  hoja.pintar(h("p", { clase: "cta-texto" }, "Un momento…"));
  let perfil: Perfil | null = null;
  try {
    perfil = await cuenta.perfil();
  } catch {
    /* sigue sin ciudad sugerida */
  }
  const foto = urlDeFoto(p.imagenUrl);
  const ciudad = selectorCiudad(perfil?.ciudad ?? null);
  const notas = h("textarea", { rows: 3, maxlength: 500, placeholder: "Opcional: es para regalo, horario para entregar, etc." });
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Confirmar solicitud");
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Enviando…", async () => {
            const id = await cuenta.apartar(pr.id, ciudad.value || null, notas.value);
            const texto = `Hola, soy ${perfil?.nombre ?? ""} (cliente #${perfil?.numeroCliente ?? ""}). Acabo de apartar en la página el pedido #${id}: ${p.marca} ${p.nombre} ${pr.ml} ml.`;
            hoja.pintar(
              h("p", { clase: "rotulo" }, "Listo"),
              h("h2", { clase: "cta-titulo" }, `Pedido #${id} solicitado`),
              h("p", { clase: "cta-texto" }, "No se te cobró nada. Te escribimos por WhatsApp para confirmar existencia, fecha y anticipo."),
              h("p", { clase: "cta-texto" }, "¿Lo quieres más rápido? Avísanos tú:"),
              h("a", { clase: "boton boton-oscuro boton-ancho", target: "_blank", rel: "noopener", href: linkWhatsApp(texto) }, "Avisar por WhatsApp"),
              h("button", { type: "button", clase: "boton boton-linea boton-ancho", al: { click: () => abrirMiCuenta() } }, "Ver mis pedidos"),
            );
          });
        },
      },
    },
    campo("Ciudad de entrega", ciudad, { nombre: "ciudad" }),
    campo("Notas para nosotros", notas, { nombre: "notas" }),
    error,
    boton,
    h("p", { clase: "cta-nota" }, "Al confirmar no se cobra nada. Primero verificamos existencia con el proveedor."),
  );
  hoja.pintar(
    h("button", { type: "button", clase: "enlace cta-volver", al: { click: volver } }, `← ${p.nombre}`),
    h("p", { clase: "rotulo" }, "Apartar"),
    h(
      "div",
      { clase: "cta-resumen" },
      foto ? h("img", { src: foto, alt: "" }) : null,
      h(
        "div",
        null,
        h("p", { clase: "ficha-marca" }, p.marca),
        h("p", { clase: "cta-resumen-nombre" }, p.nombre),
        h("p", { clase: "cta-resumen-precio" }, `${pr.ml} ml · ${pesos.format(pr.precio)}`),
      ),
    ),
    form,
  );
}

