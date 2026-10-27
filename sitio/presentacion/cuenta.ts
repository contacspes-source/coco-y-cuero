/**
 * Pantallas de la cuenta del cliente dentro de la hoja lateral:
 * entrar, crear cuenta, recuperar contraseña, Mi cuenta y Apartar.
 */
import { avisar, campo, conBotonOcupado, h, marcarErrores, vaciar } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  ESTADOS_DE_MEXICO,
  ESTADO_CLIENTE,
  ErrorDeValidacion,
  LARGO_MINIMO_CONTRASENA,
  etapasDe,
  pedidosActivos,
  precioConBienvenida,
  primerNombre,
  requiereDireccion,
  sePuedeCancelar,
  separarDireccion,
  type Direccion,
  type PedidoPropio,
  type Perfil,
  type SesionActual,
} from "../negocio/cuenta";
import { cuenta, enlaceAlAbrir } from "../negocio/servicio";
import { CIUDADES, DESCUENTO_BIENVENIDA, OTRA_CIUDAD } from "../negocio/tienda";
import { linkWhatsApp } from "./config";
import { abrirHoja, cerrarHoja, type Hoja } from "./hoja";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

let sesion: SesionActual | null = null;
/** 0.1 mientras la cuenta no tenga su primera compra; 0 después. */
let descuento = 0;
let botonCabecera: HTMLButtonElement | null = null;
let barraPromo: HTMLElement | null = null;
let alCambiarSesion: () => void = () => {};

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error. Inténtalo de nuevo.");
const volverAqui = () => `${location.origin}/`;
const PORCENTAJE = `${Math.round(DESCUENTO_BIENVENIDA * 100)} %`;

export const haySesion = () => sesion !== null;

/**
 * Qué decirle al cliente sobre su 10 %: "invitado" (sin sesión: invítalo a
 * entrar), "disponible" (con sesión y sin compras) o "usado".
 */
export function estadoBienvenida(): "invitado" | "disponible" | "usado" {
  if (!sesion) return "invitado";
  return descuento > 0 ? "disponible" : "usado";
}

function nombreCorto(): string {
  return sesion ? primerNombre(sesion.nombre, sesion.correo) : "";
}

function actualizarBoton() {
  if (botonCabecera) {
    vaciar(
      botonCabecera,
      sesion ? h("span", { clase: "cuenta-hola" }, "Hola, ", h("strong", null, nombreCorto())) : document.createTextNode("Entrar"),
    );
    botonCabecera.classList.toggle("con-sesion", Boolean(sesion));
    botonCabecera.setAttribute("aria-label", sesion ? `Mi cuenta de ${nombreCorto()}` : "Entrar a mi cuenta");
  }
  pintarPromo();
}

/** Hasta saber si hay sesión guardada no pintamos la franja (evita un parpadeo). */
let sesionResuelta = false;
let promoCerrada = false;
try {
  promoCerrada = sessionStorage.getItem("promo-cerrada") === "1";
} catch {
  /* sin almacenamiento: se muestra siempre */
}

/** La franja de arriba: invita a entrar (10 %) o recuerda el descuento. */
function pintarPromo() {
  if (!barraPromo) return;
  const estado = estadoBienvenida();
  if (!sesionResuelta || promoCerrada || estado === "usado") {
    barraPromo.hidden = true;
    return;
  }
  const cerrar = h(
    "button",
    {
      type: "button",
      clase: "promo-cerrar",
      "aria-label": "Cerrar aviso",
      al: {
        click: () => {
          promoCerrada = true;
          try {
            sessionStorage.setItem("promo-cerrada", "1");
          } catch {
            /* nada */
          }
          pintarPromo();
        },
      },
    },
    "×",
  );
  if (estado === "invitado") {
    vaciar(
      barraPromo,
      h(
        "p",
        null,
        h("strong", null, "¿Ya iniciaste sesión? "),
        `Crea tu cuenta y llévate ${PORCENTAJE} de descuento en tu primera compra.`,
      ),
      h(
        "div",
        { clase: "promo-acciones" },
        h("button", { type: "button", clase: "promo-boton", al: { click: () => abrirRegistro() } }, "Crear cuenta"),
        h("button", { type: "button", clase: "promo-enlace", al: { click: () => abrirEntrar() } }, "Iniciar sesión"),
      ),
      cerrar,
    );
  } else {
    vaciar(
      barraPromo,
      h(
        "p",
        null,
        h("strong", null, `Hola, ${nombreCorto()}: `),
        `tienes ${PORCENTAJE} de descuento en tu primera compra. Se aplica solo al apartar.`,
      ),
      cerrar,
    );
  }
  barraPromo.hidden = false;
}

async function refrescarSesion() {
  sesion = await cuenta.sesionActual().catch(() => null);
  sesionResuelta = true;
  descuento = 0;
  if (sesion) {
    try {
      descuento = await cuenta.descuentoBienvenida();
    } catch {
      /* si falla, no prometemos descuento */
    }
  }
  actualizarBoton();
  alCambiarSesion();
}

/** Se llama al cargar la página: restaura la sesión si existe. */
export async function iniciarCuenta(
  boton: HTMLButtonElement,
  promo: HTMLElement | null,
  conSesionPrevia: boolean,
  alCambiar: () => void,
) {
  botonCabecera = boton;
  barraPromo = promo;
  alCambiarSesion = alCambiar;
  boton.addEventListener("click", () => (sesion ? abrirMiCuenta() : abrirEntrar()));
  sesionResuelta = !conSesionPrevia;
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
    if (evento === "salio") {
      sesion = null;
      descuento = 0;
      actualizarBoton();
      alCambiarSesion();
    }
    if (evento === "entro") await refrescarSesion();
  });
  await refrescarSesion();

  // venimos de un enlace del correo: Supabase ya leyó el #token
  if (enlaceAlAbrir && enlaceAlAbrir !== "contrasena") {
    history.replaceState(null, "", location.pathname + location.search);
    if (enlaceAlAbrir === "vencido" && !sesion) {
      abrirEntrar(undefined, "Ese enlace ya venció o ya se usó. Entra con tu correo y contraseña.");
    } else if (sesion) {
      avisar(`¡Cuenta confirmada! Bienvenido, ${nombreCorto()}.`, "exito");
      void abrirMiCuenta();
    }
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

/**
 * Los campos de dirección completa. Solo se muestran cuando la entrega
 * es por envío a otra ciudad; en GDL, Zamora y Morelia no hacen falta.
 */
function camposDireccion(inicial: Direccion, ciudad: HTMLSelectElement) {
  const calle = h("input", { value: inicial.calle, autocomplete: "address-line1", maxlength: 120, placeholder: "Av. Juárez 120 int. 3" });
  const colonia = h("input", { value: inicial.colonia, autocomplete: "address-level3", maxlength: 80 });
  const cp = h("input", { value: inicial.cp, autocomplete: "postal-code", inputmode: "numeric", maxlength: 5, placeholder: "00000" });
  const municipio = h("input", { value: inicial.municipio, autocomplete: "address-level2", maxlength: 60 });
  const estado = h(
    "select",
    { autocomplete: "address-level1" },
    h("option", { value: "" }, "Elige…"),
    ESTADOS_DE_MEXICO.map((e) => h("option", { value: e }, e)),
  );
  estado.value = inicial.estado;
  const referencias = h("input", { value: inicial.referencias, maxlength: 80, placeholder: "Opcional: entre calles, color de fachada" });
  const nodo = h(
    "fieldset",
    { clase: "cta-direccion" },
    h("legend", null, "Dirección de envío"),
    h("p", { clase: "cta-nota" }, "Solo para envíos por paquetería a otra ciudad de la república."),
    campo("Calle y número", calle, { nombre: "calle" }),
    h("div", { clase: "cta-dos" }, campo("Colonia", colonia, { nombre: "colonia" }), campo("Código postal", cp, { nombre: "cp" })),
    h("div", { clase: "cta-dos" }, campo("Ciudad o municipio", municipio, { nombre: "municipio" }), campo("Estado", estado, { nombre: "estado" })),
    campo("Referencias", referencias, { nombre: "referencias" }),
  );
  const sincronizar = () => (nodo.hidden = !requiereDireccion(ciudad.value));
  ciudad.addEventListener("change", sincronizar);
  sincronizar();
  const leer = (): Direccion => ({
    calle: calle.value,
    colonia: colonia.value,
    cp: cp.value,
    municipio: municipio.value,
    estado: estado.value,
    referencias: referencias.value,
  });
  return { nodo, leer };
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
            await refrescarSesion();
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
    ...encabezado("Entrar", aviso ?? `Aparta perfumes, sigue tus pedidos y obtén ${PORCENTAJE} en tu primera compra.`),
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
  const direccion = camposDireccion(separarDireccion(null), ciudad);
  const canal = h(
    "select",
    null,
    h("option", { value: "" }, "Elige…"),
    canales.map((c) => h("option", { value: c.nombre }, c.nombre)),
  );
  const acepta = h("input", { type: "checkbox" });
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
                direccion: direccion.leer(),
                canal: canal.value,
                aceptaTerminos: acepta.checked,
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
              await refrescarSesion();
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
    direccion.nodo,
    h(
      "div",
      { clase: "campo cta-acepto", dataset: { campo: "terminos" } },
      h(
        "label",
        null,
        acepta,
        h(
          "span",
          null,
          "Acepto los ",
          h("a", { href: "/terminos.html", target: "_blank", rel: "noopener" }, "términos y condiciones de compra"),
          ".",
        ),
      ),
      h("p", { clase: "campo-error", role: "alert" }),
    ),
    error,
    boton,
    h("p", { clase: "cta-nota" }, "Usamos tus datos solo para tus pedidos. Nunca los compartimos."),
  );
  hoja.pintar(
    ...encabezado("Crear cuenta", `Recibes tu número de cliente, apartas en línea y te llevas ${PORCENTAJE} de descuento en tu primera compra.`),
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
    p.descuento > 0
      ? h("p", { clase: "pedido-extra" }, `Incluye tu ${PORCENTAJE} de bienvenida: ahorraste ${pesos.format(p.descuento)}.`)
      : null,
    p.direccionEnvio ? h("p", { clase: "pedido-extra" }, `Envío a: ${p.direccionEnvio}`) : null,
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
                    await refrescarSesion();
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
  const direccion = camposDireccion(separarDireccion(perfil.direccion), ciudad);
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
            const nuevo = await cuenta.guardarPerfil({
              nombre: nombre.value,
              telefono: telefono.value,
              ciudad: ciudad.value,
              direccion: direccion.leer(),
              canalId: canal.value ? Number(canal.value) : null,
            });
            if (sesion) sesion = { ...sesion, nombre: nuevo };
            actualizarBoton();
            avisar("Datos guardados.", "exito");
            alGuardar();
          });
        },
      },
    },
    campo("Nombre completo", nombre, { nombre: "nombre" }),
    campo("WhatsApp", telefono, { nombre: "telefono" }),
    h("div", { clase: "cta-dos" }, campo("Ciudad", ciudad, { nombre: "ciudad" }), campo("¿Cómo nos conociste?", canal)),
    direccion.nodo,
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
    sesion = null;
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
    h("h2", { clase: "cta-titulo" }, `Hola, ${primerNombre(perfil.nombre)}`),
    ...(estadoBienvenida() === "disponible"
      ? [h("p", { clase: "cta-bienvenida" }, `Tienes ${PORCENTAJE} de descuento en tu primera compra. Se aplica solo al apartar.`)]
      : []),
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
            sesion = null;
            descuento = 0;
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
  if (!sesion) {
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
  const direccion = camposDireccion(separarDireccion(perfil?.direccion ?? null), ciudad);
  const conDescuento = descuento > 0;
  const precioFinal = conDescuento ? precioConBienvenida(pr.precio, descuento) : pr.precio;
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
            const id = await cuenta.apartar(pr.id, ciudad.value || null, notas.value, direccion.leer());
            if (conDescuento) {
              descuento = 0;
              actualizarBoton();
              alCambiarSesion();
            }
            const texto = `Hola, soy ${perfil?.nombre ?? ""} (cliente #${perfil?.numeroCliente ?? ""}). Acabo de apartar en la página el pedido #${id}: ${p.marca} ${p.nombre} ${pr.ml} ml.`;
            hoja.pintar(
              h("p", { clase: "rotulo" }, "Listo"),
              h("h2", { clase: "cta-titulo" }, `Pedido #${id} solicitado`),
              h("p", { clase: "cta-texto" }, "No se te cobró nada. Te escribimos por WhatsApp para acordar la compra y la fecha de entrega."),
              h("p", { clase: "cta-texto" }, "¿Lo quieres más rápido? Avísanos tú:"),
              h("a", { clase: "boton boton-oscuro boton-ancho", target: "_blank", rel: "noopener", href: linkWhatsApp(texto) }, "Avisar por WhatsApp"),
              h("button", { type: "button", clase: "boton boton-linea boton-ancho", al: { click: () => abrirMiCuenta() } }, "Ver mis pedidos"),
            );
          });
        },
      },
    },
    campo("Ciudad de entrega", ciudad, { nombre: "ciudad" }),
    direccion.nodo,
    campo("Notas para nosotros", notas, { nombre: "notas" }),
    error,
    boton,
    h("p", { clase: "cta-nota" }, "Al confirmar no se cobra nada. Te escribimos por WhatsApp para acordar la compra."),
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
        conDescuento
          ? h(
              "p",
              { clase: "cta-resumen-precio" },
              `${pr.ml} ml · `,
              h("s", null, pesos.format(pr.precio)),
              " ",
              h("strong", null, pesos.format(precioFinal)),
            )
          : h("p", { clase: "cta-resumen-precio" }, `${pr.ml} ml · ${pesos.format(pr.precio)}`),
        conDescuento ? h("p", { clase: "cta-resumen-descuento" }, `${PORCENTAJE} de bienvenida por tu primera compra`) : null,
      ),
    ),
    form,
  );
}

