/** Pantallas de acceso: iniciar sesión, recuperar y cambiar contraseña. */
import { ErrorDeValidacion, mensajeDe } from "../../negocio/errores";
import { LARGO_MINIMO_CONTRASENA } from "../../negocio/servicios";
import { servicios } from "../estado";
import { avisar, campo, conBotonOcupado, h, marcarErrores } from "../ui";

function tarjeta(titulo: string, subtitulo: string, ...contenido: Node[]): HTMLElement {
  return h(
    "main",
    { clase: "acceso" },
    h(
      "div",
      { clase: "acceso-tarjeta" },
      h("img", { clase: "acceso-sello", src: "/assets/img/logo-marca.png", alt: "", width: 72, height: 72 }),
      h("p", { clase: "rotulo" }, "Coco & Cuero · Panel"),
      h("h1", null, titulo),
      h("p", { clase: "acceso-sub" }, subtitulo),
      ...contenido,
    ),
  );
}

export function vistaLogin(alEntrar: (correo: string) => void): HTMLElement {
  const correo = h("input", { type: "email", autocomplete: "username", required: true, inputmode: "email" });
  const contrasena = h("input", { type: "password", autocomplete: "current-password", required: true });
  const error = h("p", { clase: "acceso-error", role: "alert" });
  const boton = h("button", { clase: "boton boton-primario boton-ancho", type: "submit" }, "Entrar");

  const formulario = h(
    "form",
    {
      clase: "acceso-form",
      al: {
        submit: async (e) => {
          e.preventDefault();
          error.textContent = "";
          try {
            const quien = await conBotonOcupado(boton, "Entrando…", () =>
              servicios.sesion.entrar(correo.value, contrasena.value),
            );
            alEntrar(quien);
          } catch (err) {
            error.textContent = mensajeDe(err);
            contrasena.select();
          }
        },
      },
    },
    campo("Correo", correo),
    campo("Contraseña", contrasena),
    error,
    boton,
    h(
      "button",
      {
        type: "button",
        clase: "enlace",
        al: {
          click: async () => {
            if (!correo.checkValidity() || !correo.value) {
              error.textContent = "Escribe tu correo arriba y vuelve a tocar aquí.";
              correo.focus();
              return;
            }
            try {
              await servicios.sesion.recuperar(correo.value, `${location.origin}/panel/`);
              avisar("Te mandamos un correo con un enlace para crear una contraseña nueva.", "exito");
            } catch (err) {
              error.textContent = mensajeDe(err);
            }
          },
        },
      },
      "¿Olvidaste tu contraseña?",
    ),
  );

  queueMicrotask(() => correo.focus());
  return tarjeta("Bienvenido", "Inicia sesión para administrar el catálogo.", formulario);
}

export function vistaNuevaContrasena(alTerminar: () => void): HTMLElement {
  const nueva = h("input", { type: "password", autocomplete: "new-password", minlength: LARGO_MINIMO_CONTRASENA });
  const confirmacion = h("input", { type: "password", autocomplete: "new-password" });
  const boton = h("button", { clase: "boton boton-primario boton-ancho", type: "submit" }, "Guardar contraseña");

  const formulario: HTMLFormElement = h(
    "form",
    {
      clase: "acceso-form",
      al: {
        submit: async (e) => {
          e.preventDefault();
          try {
            await conBotonOcupado(boton, "Guardando…", () =>
              servicios.sesion.cambiarContrasena(nueva.value, confirmacion.value),
            );
            avisar("Listo, tu contraseña quedó cambiada.", "exito");
            alTerminar();
          } catch (err) {
            if (err instanceof ErrorDeValidacion) marcarErrores(formulario, err.problemas);
            else avisar(mensajeDe(err), "error");
          }
        },
      },
    },
    campo("Contraseña nueva", nueva, { nombre: "contrasena", ayuda: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` }),
    campo("Repítela", confirmacion, { nombre: "confirmacion" }),
    boton,
  );
  queueMicrotask(() => nueva.focus());
  return tarjeta("Contraseña nueva", "Elige una contraseña que no uses en otro lado.", formulario);
}
