/**
 * Pantallas de la cuenta del cliente dentro de la hoja lateral:
 * entrar, crear cuenta, recuperar contraseña, Mi cuenta y Apartar.
 */
import { montarCaptcha } from "../../compartido/captcha";
import { avisar, campo, conBotonOcupado, h, marcarErrores, vaciar } from "../../compartido/dom";
import { urlDeFoto } from "../../compartido/texto";
import type { PerfumePublico } from "../../compartido/tipos";
import {
  ErrorDeDatos,
  ESTADOS_DE_MEXICO,
  ESTADO_CLIENTE,
  ErrorDeValidacion,
  LARGO_MAXIMO_CANAL_DETALLE,
  LARGO_MINIMO_CONTRASENA,
  requiereDetalleDeCanal,
  etapasDe,
  pedidosActivos,
  precioConBienvenida,
  primerNombre,
  direccionVacia,
  formaDeEntrega,
  requiereDireccion,
  sePuedeCancelar,
  separarDireccion,
  type Direccion,
  type PedidoPropio,
  type Perfil,
  type SesionActual,
  validarRegistro,
} from "../negocio/cuenta";
import { cuenta, enlaceAlAbrir } from "../negocio/servicio";
import { CIUDADES, DESCUENTO_BIENVENIDA, OTRA_CIUDAD } from "../negocio/tienda";
import { linkWhatsApp } from "./config";
import { abrirHoja, cerrarHoja, guardaDeCierre, type Hoja } from "./hoja";

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

let sesion: SesionActual | null = null;
/** 0.1 mientras la cuenta no tenga su primera compra; 0 después. */
let descuento = 0;
let botonCabecera: HTMLButtonElement | null = null;
let botonCrear: HTMLButtonElement | null = null;
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
  // "Crear cuenta" solo tiene sentido sin sesión
  if (botonCrear) botonCrear.hidden = Boolean(sesion);
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
  crear: HTMLButtonElement | null,
  promo: HTMLElement | null,
  conSesionPrevia: boolean,
  alCambiar: () => void,
) {
  botonCabecera = boton;
  botonCrear = crear;
  barraPromo = promo;
  alCambiarSesion = alCambiar;
  boton.addEventListener("click", () => (sesion ? abrirMiCuenta() : abrirEntrar()));
  crear?.addEventListener("click", () => void abrirRegistro());
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
    } else {
      // el enlace se abrió en otro navegador o dispositivo: la cuenta ya
      // quedó confirmada, pero la sesión no se pudo crear aquí
      abrirEntrar(undefined, "¡Tu cuenta quedó confirmada! Entra con tu correo y contraseña.");
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
/**
 * Campos de dirección en dos modos:
 * - "opcional" (crear cuenta, Mis datos): plegados en "Agregar mi dirección";
 *   si escribe algo, se valida completa.
 * - "entrega" (apartar): visibles solo si es envío o a domicilio.
 */
function camposDireccion(
  inicial: Direccion,
  opciones: { modo: "opcional" } | { modo: "entrega"; visible: () => boolean; titulo: () => string },
) {
  const obligatorio = opciones.modo === "entrega";
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
  const leyenda = h("legend", null, opciones.modo === "entrega" ? opciones.titulo() : "Tu dirección");
  const campos = [
    campo("Calle y número", calle, { nombre: "calle", obligatorio }),
    h("div", { clase: "cta-dos" }, campo("Colonia", colonia, { nombre: "colonia", obligatorio }), campo("Código postal", cp, { nombre: "cp", obligatorio })),
    h("div", { clase: "cta-dos" }, campo("Ciudad o municipio", municipio, { nombre: "municipio", obligatorio }), campo("Estado", estado, { nombre: "estado", obligatorio })),
    campo("Referencias", referencias, { nombre: "referencias" }),
  ];
  const leer = (): Direccion => ({
    calle: calle.value,
    colonia: colonia.value,
    cp: cp.value,
    municipio: municipio.value,
    estado: estado.value,
    referencias: referencias.value,
  });

  if (opciones.modo === "opcional") {
    const nodo = h(
      "details",
      { clase: "cta-direccion-opcional", open: !direccionVacia(inicial) },
      h("summary", null, "Agregar mi dirección ", h("small", null, "(opcional)")),
      h(
        "fieldset",
        { clase: "cta-direccion" },
        leyenda,
        h("p", { clase: "cta-nota" }, "Te la pedimos al apartar si eliges envío o entrega a domicilio. Si la guardas ahora, ya no tienes que escribirla. Nunca la compartimos."),
        ...campos,
      ),
    );
    return { nodo, leer, sincronizar: () => {} };
  }
  const { visible, titulo } = opciones;
  const nodo = h("fieldset", { clase: "cta-direccion" }, leyenda, ...campos);
  const sincronizar = () => {
    nodo.hidden = !visible();
    leyenda.textContent = titulo();
  };
  sincronizar();
  return { nodo, leer, sincronizar };
}

/** WhatsApp con la lada de México fija (+52): solo se escriben los 10 dígitos. */
function campoTelefono(valor: string | null, ayuda?: string, obligatorio = false) {
  const input = h("input", {
    type: "tel",
    value: valor ?? "",
    autocomplete: "tel-national",
    inputmode: "numeric",
    maxlength: 16,
    placeholder: "33 1234 5678",
    "aria-describedby": "lada-mx",
  });
  // si pegan "+52 33…" o "521…", se quita la lada al salir del campo
  input.addEventListener("blur", () => {
    const d = input.value.replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("52")) input.value = d.slice(2);
    else if (d.length === 13 && d.startsWith("521")) input.value = d.slice(3);
  });
  const caja = h("div", { clase: "campo-lada" }, h("span", { clase: "lada", id: "lada-mx", title: "México" }, "+52"), input);
  const nodo = campo("WhatsApp", caja, { nombre: "telefono", obligatorio, ayuda: ayuda ?? "10 dígitos: lada + número." });
  return { nodo, input };
}

async function manejar(
  form: HTMLFormElement,
  error: HTMLElement,
  boton: HTMLButtonElement,
  texto: string,
  tarea: () => Promise<void>,
  /** acciones para ofrecer junto al error (p. ej. "Reenviar correo") */
  acciones?: (e: unknown) => Node[],
) {
  vaciar(error);
  marcarErrores(form, []);
  try {
    await conBotonOcupado(boton, texto, tarea);
  } catch (e) {
    if (e instanceof ErrorDeValidacion) marcarErrores(form, e.problemas);
    else vaciar(error, document.createTextNode(mensaje(e)), ...(acciones?.(e) ?? []));
  }
}

const esDe = (e: unknown, cosa: "duplicado" | "sin-confirmar") =>
  e instanceof ErrorDeDatos && (cosa === "duplicado" ? e.tipo === "duplicado" : e.pista === "correo_sin_confirmar");

// ------------------------------------------------------------ confirmar correo
const ESPERA_REENVIO_S = 60;

/**
 * "Revisa tu correo" con la opción de reenviarlo. Supabase deja mandar
 * uno por minuto por correo, así que el botón espera 60 s entre envíos.
 */
function pintarConfirmacion(hoja: Hoja, correo: string, continuar?: () => void, recienEnviado = true, corregir?: () => void) {
  const cajaCaptcha = h("div", { clase: "captcha" });
  const captcha = montarCaptcha(cajaCaptcha);
  const error = errorGeneral();
  const reenviar = h("button", { clase: "boton boton-oscuro boton-ancho", type: "button" }, "Reenviar correo");
  let reloj: number | undefined;
  const esperar = (s: number) => {
    clearInterval(reloj);
    let faltan = s;
    const tic = () => {
      if (!reenviar.isConnected || faltan <= 0) {
        clearInterval(reloj);
        reenviar.disabled = false;
        reenviar.textContent = "Reenviar correo";
        return;
      }
      reenviar.disabled = true;
      reenviar.textContent = `Reenviar correo en ${faltan} s`;
      faltan--;
    };
    tic();
    reloj = window.setInterval(tic, 1000);
  };
  reenviar.addEventListener("click", async () => {
    vaciar(error);
    try {
      await conBotonOcupado(reenviar, "Enviando…", async () => {
        const token = await captcha.token();
        try {
          await cuenta.reenviarConfirmacion(correo, volverAqui(), token);
        } finally {
          captcha.reiniciar();
        }
      });
      avisar(`Te lo volvimos a mandar a ${correo}.`, "exito");
      esperar(ESPERA_REENVIO_S);
    } catch (e) {
      error.textContent = e instanceof ErrorDeValidacion ? e.problemas.map((p) => p.mensaje).join(" ") : mensaje(e);
    }
  });

  hoja.pintar(
    ...encabezado(
      "Revisa tu correo",
      `Te mandamos un enlace a ${correo} para confirmar tu cuenta. Ábrelo desde este mismo teléfono o computadora.`,
    ),
    h("p", { clase: "cta-nota" }, "¿No llega? Revisa spam o promociones; puede tardar un par de minutos."),
    cajaCaptcha,
    error,
    reenviar,
    h(
      "p",
      { clase: "cta-cambio" },
      "¿Escribiste mal tu correo? ",
      h("button", { type: "button", clase: "enlace", al: { click: () => (corregir ? corregir() : void abrirRegistro(continuar)) } }, "Corrígelo"),
    ),
    h(
      "a",
      {
        clase: "boton boton-linea boton-ancho",
        href: linkWhatsApp(`Hola, me registré en Coco & Cuero con ${correo} y no me llega el correo de confirmación.`),
        target: "_blank",
        rel: "noopener",
      },
      "No me llega: escribir por WhatsApp",
    ),
    h("button", { clase: "enlace cta-seguir", type: "button", al: { click: cerrarHoja } }, "Seguir viendo perfumes"),
  );
  if (recienEnviado) esperar(ESPERA_REENVIO_S);
}

// ------------------------------------------------------------ entrar
export function abrirEntrar(continuar?: () => void, aviso?: string, correo = "") {
  const hoja = abrirHoja({ etiqueta: "Entrar a mi cuenta", clase: "hoja-angosta" });
  const correoIn = h("input", { type: "email", autocomplete: "email", inputmode: "email", required: true, value: correo });
  const clave = h("input", { type: "password", autocomplete: "current-password", required: true });
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Entrar");
  const cajaCaptcha = h("div", { clase: "captcha" });
  const captcha = montarCaptcha(cajaCaptcha);
  // cada token de Turnstile sirve una sola vez: tras cada intento se pide otro
  const conCaptcha = (texto: string, tarea: (token: string) => Promise<void>) =>
    manejar(
      form,
      error,
      boton,
      texto,
      async () => {
        const token = await captcha.token();
        try {
          await tarea(token);
        } finally {
          captcha.reiniciar();
        }
      },
      // se registró pero no confirmó: ofrecer el correo otra vez
      (e) =>
        esDe(e, "sin-confirmar")
          ? [
              h(
                "button",
                { type: "button", clase: "enlace cta-error-accion", al: { click: () => pintarConfirmacion(hoja, correoIn.value.trim().toLowerCase(), continuar, false) } },
                "Reenviar el correo de confirmación",
              ),
            ]
          : [],
    );
  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          const faltan = [
            ...(correoIn.value.trim() ? [] : [{ campo: "correo", mensaje: "Escribe tu correo." }]),
            ...(clave.value ? [] : [{ campo: "contrasena", mensaje: "Escribe tu contraseña." }]),
          ];
          if (faltan.length) {
            marcarErrores(form, faltan);
            return;
          }
          void conCaptcha("Entrando…", async (token) => {
            await prepararSesion();
            await cuenta.entrar(correoIn.value, clave.value, token);
            await refrescarSesion();
            if (continuar) continuar();
            else abrirMiCuenta();
          });
        },
      },
    },
    campo("Correo", correoIn, { nombre: "correo" }),
    campo("Contraseña", clave, { nombre: "contrasena" }),
    cajaCaptcha,
    error,
    boton,
    h(
      "button",
      {
        type: "button",
        clase: "enlace",
        al: {
          click: () =>
            void conCaptcha("Entrar", async (token) => {
              await prepararSesion();
              await cuenta.recuperar(correoIn.value, volverAqui(), token);
              avisar("Si ese correo tiene cuenta, te mandamos un enlace para crear una contraseña nueva.", "exito");
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
  queueMicrotask(() => (correo ? clave : correoIn).focus());
}

// ------------------------------------------------------------ registro
export async function abrirRegistro(continuar?: () => void) {
  // Pantalla completa y con guarda: un toque fuera, Esc o "Atrás" ya no
  // borran lo que escribió sin preguntar.
  let escribioAlgo = () => false;
  const noSalirSinQuerer = () => !escribioAlgo() || window.confirm("¿Salir sin crear tu cuenta? Se borrará lo que escribiste.");
  const hoja = abrirHoja({ etiqueta: "Crear cuenta", clase: "hoja-completa", antesDeCerrar: noSalirSinQuerer });
  hoja.pintar(...encabezado("Crear cuenta"), h("p", { clase: "cta-texto" }, "Cargando…"));
  await prepararSesion();
  let canales: { id: number; nombre: string }[] = [];
  try {
    canales = await cuenta.canales();
  } catch {
    /* si falla, el registro sigue sin esa pregunta */
  }

  const nombre = h("input", { autocomplete: "name", maxlength: 80 });
  const tel = campoTelefono(null, "10 dígitos: lada + número. Ahí te confirmamos cada pedido.", true);
  const telefono = tel.input;
  const correoIn = h("input", { type: "email", autocomplete: "email", inputmode: "email" });
  const clave = h("input", { type: "password", autocomplete: "new-password" });
  const repetir = h("input", { type: "password", autocomplete: "new-password" });
  const ciudad = selectorCiudad(null);
  const direccion = camposDireccion(separarDireccion(null), { modo: "opcional" });
  const canal = h(
    "select",
    null,
    h("option", { value: "" }, "Elige…"),
    canales.map((c) => h("option", { value: c.nombre }, c.nombre)),
  );
  // "Otro": que diga dónde o con quién (sirve para saber qué anuncio funciona)
  const canalDetalle = h("input", { maxlength: LARGO_MAXIMO_CANAL_DETALLE, placeholder: "Ej. una amiga, un evento, un volante…" });
  const cajaDetalle = campo("¿Dónde o con quién?", canalDetalle, { nombre: "canalDetalle", obligatorio: true });
  const sincronizarDetalle = () => (cajaDetalle.hidden = !requiereDetalleDeCanal(canal.value));
  canal.addEventListener("change", sincronizarDetalle);
  sincronizarDetalle();
  const acepta = h("input", { type: "checkbox" });
  escribioAlgo = () => [nombre, telefono, correoIn, clave, repetir].some((x) => x.value.trim() !== "");
  const error = errorGeneral();
  const boton = h("button", { clase: "boton boton-oscuro boton-ancho", type: "submit" }, "Crear mi cuenta");
  const cajaCaptcha = h("div", { clase: "captcha" });
  const captcha = montarCaptcha(cajaCaptcha);

  const form: HTMLFormElement = h(
    "form",
    {
      clase: "cta-form",
      novalidate: true,
      al: {
        submit: (e) => {
          e.preventDefault();
          void manejar(form, error, boton, "Creando…", async () => {
            const datos = {
              nombre: nombre.value,
              telefono: telefono.value,
              correo: correoIn.value,
              contrasena: clave.value,
              confirmacion: repetir.value,
              ciudad: ciudad.value,
              direccion: direccion.leer(),
              canal: canal.value,
              canalDetalle: canalDetalle.value,
              aceptaTerminos: acepta.checked,
            };
            // los errores de los campos se ven antes de gastar la verificación
            const problemas = validarRegistro(datos);
            if (problemas.length) throw new ErrorDeValidacion(problemas);
            let r: { requiereConfirmacion: boolean };
            try {
              const token = await captcha.token();
              r = await cuenta.registrar(datos, volverAqui(), token);
            } catch (e) {
              captcha.reiniciar();
              throw e;
            }
            // la cuenta ya se creó: cerrar ya no pierde nada
            guardaDeCierre(null);
            if (r.requiereConfirmacion) {
              // "Corrígelo" regresa a este mismo formulario, con todo lo que ya escribió
              pintarConfirmacion(hoja, correoIn.value.trim().toLowerCase(), continuar, true, () => {
                guardaDeCierre(noSalirSinQuerer);
                pintarFormulario();
                captcha.reiniciar();
                correoIn.focus();
                correoIn.select();
              });
            } else {
              await refrescarSesion();
              avisar("¡Bienvenido a Coco & Cuero!", "exito");
              if (continuar) continuar();
              else abrirMiCuenta();
            }
          }, (e) => {
            // ya tiene cuenta: llevarlo a entrar o a recuperar su contraseña
            if (!esDe(e, "duplicado")) return [];
            const correo = correoIn.value.trim().toLowerCase();
            return [
              h(
                "span",
                { clase: "cta-error-acciones" },
                h("button", { type: "button", clase: "boton boton-oscuro", al: { click: () => abrirEntrar(continuar, `Ya tienes cuenta con ${correo}. Entra con tu contraseña.`, correo) } }, "Entrar con ese correo"),
                h(
                  "button",
                  {
                    type: "button",
                    clase: "boton boton-linea",
                    al: { click: () => abrirEntrar(continuar, "Escribe tu correo y toca «¿Olvidaste tu contraseña?» para crear una nueva.", correo) },
                  },
                  "Olvidé mi contraseña",
                ),
              ),
            ];
          });
        },
      },
    },
    h("p", { clase: "cta-nota cta-obligatorios" }, "Los campos con * son obligatorios."),
    campo("Nombre completo", nombre, { nombre: "nombre", obligatorio: true }),
    tel.nodo,
    campo("Correo", correoIn, { nombre: "correo", obligatorio: true }),
    campo("Contraseña", clave, { nombre: "contrasena", obligatorio: true, ayuda: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres, con letras y números.` }),
    campo("Repite la contraseña", repetir, { nombre: "confirmacion", obligatorio: true }),
    h("div", { clase: "cta-dos" }, campo("Ciudad", ciudad, { nombre: "ciudad", obligatorio: true }), campo("¿Cómo nos conociste?", canal, { nombre: "canal", obligatorio: true })),
    cajaDetalle,
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
    cajaCaptcha,
    error,
    boton,
    h("p", { clase: "cta-nota" }, "Usamos tus datos solo para tus pedidos. Nunca los compartimos."),
  );
  const pintarFormulario = () =>
    hoja.pintar(
      h(
        "div",
        { clase: "cta-barra-completa" },
        h("button", { type: "button", clase: "enlace cta-volver", al: { click: cerrarHoja } }, "← Volver a la tienda"),
        h("span", { clase: "cta-marca" }, "Coco & Cuero"),
      ),
      ...encabezado("Crear cuenta", `Recibes tu número de cliente, apartas en línea y te llevas ${PORCENTAJE} de descuento en tu primera compra.`),
      form,
      h("p", { clase: "cta-cambio" }, "¿Ya tienes cuenta? ", h("button", { type: "button", clase: "enlace", al: { click: () => abrirEntrar(continuar) } }, "Entra")),
    );
  pintarFormulario();
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
  const tel = campoTelefono(perfil.telefono);
  const telefono = tel.input;
  const ciudad = selectorCiudad(perfil.ciudad);
  const direccion = camposDireccion(separarDireccion(perfil.direccion), { modo: "opcional" });
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
    tel.nodo,
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
    ...(perfil.activo
      ? []
      : [h("p", { clase: "cta-error", role: "alert" }, "Tu cuenta está dada de baja: no puedes apartar perfumes. Si crees que es un error, escríbenos por WhatsApp.")]),
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
  // En las tres ciudades: punto acordado o a domicilio. Fuera: paquetería.
  const aDomicilio = h("input", { type: "radio", name: "entrega", value: "domicilio" });
  const enPunto = h("input", { type: "radio", name: "entrega", value: "punto", checked: true });
  const entrega = h(
    "fieldset",
    { clase: "cta-entrega", dataset: { campo: "entrega" } },
    h("legend", null, "¿Cómo te lo entregamos?"),
    h("label", { clase: "cta-opcion" }, enPunto, h("span", null, h("strong", null, "En un punto acordado"), h("small", null, "Quedamos por WhatsApp en un lugar céntrico."))),
    h("label", { clase: "cta-opcion" }, aDomicilio, h("span", null, h("strong", null, "A domicilio"), h("small", null, "Te lo llevamos a tu casa u oficina."))),
  );
  const direccion = camposDireccion(separarDireccion(perfil?.direccion ?? null), {
    modo: "entrega",
    visible: () => requiereDireccion(ciudad.value, aDomicilio.checked),
    titulo: () => (formaDeEntrega(ciudad.value, aDomicilio.checked) === "envio" ? "Dirección de envío (paquetería)" : "Dirección de entrega"),
  });
  const sincronizarEntrega = () => {
    entrega.hidden = !ciudad.value || formaDeEntrega(ciudad.value, false) === "envio";
    direccion.sincronizar();
  };
  for (const x of [ciudad, aDomicilio, enPunto]) x.addEventListener("change", sincronizarEntrega);
  sincronizarEntrega();
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
            const id = await cuenta.apartar(pr.id, ciudad.value || null, notas.value, direccion.leer(), aDomicilio.checked);
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
    entrega,
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

