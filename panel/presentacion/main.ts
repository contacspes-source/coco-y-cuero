/**
 * Arranque del panel y enrutador por hash (#/, #/perfume/12, #/precios).
 * Con hash no hace falta configurar nada en el servidor: siempre se
 * sirve el mismo panel/index.html.
 */
import "../estilos.css";
import { esDeSesion, mensajeDe } from "../negocio/errores";
import { estado, recargar, recargarVentas, servicios } from "./estado";
import { avisar, cargando, confirmar, h, vaciar } from "./ui";
import { vistaLogin, vistaNuevaContrasena } from "./vistas/acceso";
import { vistaCatalogo } from "./vistas/catalogo";
import { vistaFormulario } from "./vistas/formulario";
import { vistaPrecios } from "./vistas/precios";
import { vistaCliente, vistaClientes } from "./vistas/clientes";
import { vistaNuevoPedido, vistaPedido, vistaPedidos } from "./vistas/pedidos";
import { vistaReportes } from "./vistas/reportes";

const raiz = document.getElementById("app")!;

// Supabase deja los datos de recuperación en el hash del enlace del
// correo. Se lee antes de que la librería lo limpie.
let enRecuperacion = /type=recovery/.test(location.hash);

// ------------------------------------------------------------ sesión
function mostrarLogin() {
  estado.correo = null;
  estado.sucio = false;
  vaciar(raiz, vistaLogin((correo) => void entrar(correo)));
}

function sesionVencida() {
  avisar("Tu sesión terminó. Vuelve a entrar.", "error");
  void servicios.sesion.salir().finally(mostrarLogin);
}

async function entrar(correo: string) {
  estado.correo = correo;
  vaciar(raiz, cargando("Cargando catálogo…"));
  try {
    await recargar();
  } catch (e) {
    vaciar(
      raiz,
      h(
        "div",
        { clase: "vacio vacio-pantalla" },
        h("p", null, mensajeDe(e)),
        h("button", { clase: "boton boton-primario", al: { click: () => void entrar(correo) } }, "Reintentar"),
      ),
    );
    return;
  }
  if (!/^#\//.test(location.hash)) history.replaceState(null, "", "#/");
  pintarMarco();
  enrutar();
}

// ------------------------------------------------------------ marco
const contenido = h("main", { id: "contenido", clase: "contenido", tabindex: -1 });

function pintarMarco() {
  const enlace = (ruta: string, texto: string) => h("a", { href: ruta, dataset: { ruta } }, texto);
  vaciar(
    raiz,
    h(
      "header",
      { clase: "barra-superior" },
      h(
        "a",
        { clase: "marca", href: "#/" },
        h("img", { src: "/assets/img/logo-marca.png", alt: "", width: 38, height: 38 }),
        h("span", null, "Coco & Cuero", h("small", null, "Panel")),
      ),
      h(
        "nav",
        { clase: "navegacion", "aria-label": "Secciones" },
        enlace("#/pedidos", "Pedidos"),
        enlace("#/clientes", "Clientes"),
        enlace("#/", "Catálogo"),
        enlace("#/precios", "Precios"),
        enlace("#/reportes", "Reportes"),
      ),
      h(
        "div",
        { clase: "usuario" },
        h("a", { href: "/", target: "_blank", rel: "noopener", clase: "ver-sitio" }, "Ver sitio ↗"),
        h("span", { clase: "usuario-correo", title: estado.correo ?? "" }, estado.correo ?? ""),
        h(
          "button",
          {
            clase: "boton boton-fantasma boton-chico",
            al: {
              click: async () => {
                if (estado.sucio && !(await confirmar({ titulo: "¿Salir sin guardar?", texto: "Tienes cambios sin guardar en este perfume.", aceptar: "Salir", peligro: true }))) return;
                await servicios.sesion.salir();
                mostrarLogin();
              },
            },
          },
          "Salir",
        ),
      ),
    ),
    contenido,
  );
}

// ------------------------------------------------------------ rutas
let rutaActual = "";

function navegar(ruta: string) {
  estado.sucio = false;
  if (location.hash === ruta) enrutar(true);
  else location.hash = ruta;
}

function enrutar(forzar = false) {
  if (!estado.correo) return;
  const ruta = location.hash || "#/";
  if (ruta === rutaActual && !forzar) return;
  rutaActual = ruta;

  document.querySelectorAll<HTMLElement>(".navegacion a").forEach((a) => {
    const r = a.dataset.ruta!;
    const seccion = /^#\/(pedidos|clientes|precios|reportes)/.exec(ruta)?.[0] ?? "#/";
    a.classList.toggle("activo", r === seccion);
  });

  // secciones de ventas: se recargan al entrar para ver siempre lo último
  const ventas = /^#\/(pedidos|clientes)/.test(ruta);
  if (ventas) {
    vaciar(contenido, cargando());
    recargarVentas()
      .then(() => {
        if (rutaActual === ruta) pintarRuta(ruta);
      })
      .catch((e) => {
        avisar(mensajeDe(e), "error");
        if (esDeSesion(e)) sesionVencida();
      });
    return;
  }
  pintarRuta(ruta);
}

function pintarRuta(ruta: string) {
  let vista: HTMLElement;
  let titulo = "Catálogo";
  const perfume = ruta.match(/^#\/perfume\/(nuevo|\d+)$/);
  const pedido = ruta.match(/^#\/pedidos\/(\d+)$/);
  const nuevoPedido = ruta.match(/^#\/pedidos\/nuevo(?:\?cliente=(\d+))?$/);
  const cliente = ruta.match(/^#\/clientes\/(nuevo|\d+)$/);
  if (perfume) {
    vista = vistaFormulario(perfume[1]!, navegar, sesionVencida);
    titulo = "Perfume";
  } else if (ruta === "#/reportes") {
    vista = vistaReportes(sesionVencida);
    titulo = "Reportes";
  } else if (ruta === "#/precios") {
    vista = vistaPrecios(sesionVencida);
    titulo = "Precios";
  } else if (nuevoPedido) {
    vista = vistaNuevoPedido(nuevoPedido[1] ? Number(nuevoPedido[1]) : null, navegar, sesionVencida);
    titulo = "Nuevo pedido";
  } else if (pedido) {
    vista = vistaPedido(Number(pedido[1]), navegar, sesionVencida);
    titulo = `Pedido #${pedido[1]}`;
  } else if (ruta.startsWith("#/pedidos")) {
    vista = vistaPedidos(sesionVencida);
    titulo = "Pedidos";
  } else if (cliente) {
    vista = vistaCliente(cliente[1]!, navegar, sesionVencida);
    titulo = "Cliente";
  } else if (ruta.startsWith("#/clientes")) {
    vista = vistaClientes();
    titulo = "Clientes";
  } else {
    vista = vistaCatalogo(sesionVencida);
  }
  document.title = `${titulo} · Panel Coco & Cuero`;
  vaciar(contenido, vista);
  window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", async () => {
  if (!/^#\//.test(location.hash)) return; // hash de Supabase, no es una ruta
  if (estado.sucio && location.hash !== rutaActual) {
    const destino = location.hash;
    history.replaceState(null, "", rutaActual); // regresa mientras decide
    const salir = await confirmar({
      titulo: "¿Salir sin guardar?",
      texto: "Tienes cambios sin guardar en este perfume. Si sales, se pierden.",
      aceptar: "Salir sin guardar",
      peligro: true,
    });
    if (!salir) return;
    estado.sucio = false;
    location.hash = destino;
    return;
  }
  enrutar();
});

window.addEventListener("beforeunload", (e) => {
  if (estado.sucio) e.preventDefault();
});

// ------------------------------------------------------------ arranque
servicios.sesion.alCambiar((evento) => {
  if (evento === "recuperar-contrasena") {
    enRecuperacion = true;
    vaciar(raiz, vistaNuevaContrasena(() => { enRecuperacion = false; void arrancar(); }));
  }
});

async function arrancar() {
  vaciar(raiz, cargando());
  try {
    const correo = await servicios.sesion.adminActual();
    if (enRecuperacion) {
      vaciar(raiz, vistaNuevaContrasena(() => { enRecuperacion = false; void arrancar(); }));
      return;
    }
    if (correo) await entrar(correo);
    else mostrarLogin();
  } catch (e) {
    avisar(mensajeDe(e), "error");
    mostrarLogin();
  }
}

void arrancar();
