/**
 * CAPTCHA con Cloudflare Turnstile, compartido por el sitio y el panel.
 *
 * Por qué existe: sin esto, cualquiera puede llamar directo a la API de
 * Supabase (signUp, signIn, resetPassword) con un script y crear miles
 * de cuentas o probar contraseñas sin parar. Con Turnstile, Supabase
 * rechaza cada llamada que no traiga un token válido (se activa en
 * Supabase → Authentication → Attack Protection → Enable Captcha).
 *
 * Cómo se usa desde una pantalla:
 *
 *   const captcha = montarCaptcha(contenedor);   // dibuja el widget
 *   const token = await captcha.token();         // espera a que lo resuelva
 *   await servicio.entrar(correo, clave, token);
 *   captcha.reiniciar();                         // cada token sirve UNA vez
 *
 * Si TURNSTILE_SITE_KEY está vacío, el CAPTCHA queda apagado (útil en
 * desarrollo). Ver docs/SEGURIDAD.md para configurarlo.
 */
import { TURNSTILE_SITE_KEY } from "./config";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Cuánto se espera a que la persona resuelva el reto antes de rendirse. */
const ESPERA_MAXIMA_MS = 120_000;

interface Turnstile {
  render(
    contenedor: HTMLElement,
    opciones: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      /** devolver true evita que Turnstile muestre su propio error */
      "error-callback"?: () => boolean | void;
      theme?: "light" | "dark" | "auto";
      language?: string;
      appearance?: "always" | "execute" | "interaction-only";
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export interface Captcha {
  /** Resuelve con el token en cuanto la persona pasa el reto. */
  token(): Promise<string>;
  /** Pide un token nuevo (los tokens son de un solo uso). */
  reiniciar(): void;
  /** Quita el widget de la página. */
  quitar(): void;
}

export class ErrorDeCaptcha extends Error {
  constructor(mensaje = "No pudimos comprobar que eres una persona. Recarga la página e inténtalo de nuevo.") {
    super(mensaje);
    this.name = "ErrorDeCaptcha";
  }
}

export const captchaActivo = () => (TURNSTILE_SITE_KEY as string) !== "";

let cargando: Promise<Turnstile> | null = null;

function cargarLibreria(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  cargando ??= new Promise((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolver(window.turnstile) : rechazar(new ErrorDeCaptcha()));
    s.onerror = () => {
      cargando = null;
      rechazar(new ErrorDeCaptcha("No se pudo cargar la verificación. Revisa tu conexión o desactiva el bloqueador de anuncios."));
    };
    document.head.append(s);
  });
  return cargando;
}

/** Un CAPTCHA que siempre pasa, para cuando está apagado (desarrollo). */
const apagado: Captcha = {
  token: () => Promise.resolve(""),
  reiniciar: () => {},
  quitar: () => {},
};

/**
 * Dibuja el widget dentro de `contenedor` y devuelve un objeto para
 * pedirle el token. Dibujarlo no bloquea: la librería se carga aparte.
 */
export function montarCaptcha(contenedor: HTMLElement): Captcha {
  if (!captchaActivo()) return apagado;

  let id: string | null = null;
  let tokenListo: string | null = null;
  let esperando: { resolver: (t: string) => void; rechazar: (e: Error) => void }[] = [];
  let fallo: Error | null = null;
  let reintentos = 0;

  const entregar = (t: string) => {
    // un token nuevo borra cualquier error anterior: Turnstile se recupera
    // solo (reintenta) y antes el formulario seguía "atorado" en el error
    fallo = null;
    tokenListo = t;
    esperando.forEach((e) => e.resolver(t));
    esperando = [];
  };
  const fallar = (e: Error) => {
    fallo = e;
    esperando.forEach((x) => x.rechazar(e));
    esperando = [];
  };

  const listo = cargarLibreria()
    .then((ts) => {
      id = ts.render(contenedor, {
        sitekey: TURNSTILE_SITE_KEY,
        language: "es",
        theme: "light",
        callback: entregar,
        "expired-callback": () => {
          tokenListo = null;
        },
        // si la librería ya está y el widget falló, se pide uno nuevo en vez
        // de dejar el formulario sin salida; si vuelve a fallar, se avisa
        "error-callback": () => {
          if (reintentos < 1 && id) {
            reintentos++;
            tokenListo = null;
            void listo.then((ts) => id && ts.reset(id)).catch(() => {});
            return true; // le dice a Turnstile que ya lo manejamos
          }
          fallar(new ErrorDeCaptcha());
          return true;
        },
      });
      return ts;
    })
    .catch((e: Error) => {
      fallar(e);
      throw e;
    });

  return {
    token() {
      if (tokenListo) return Promise.resolve(tokenListo);
      // falló antes: se intenta de nuevo al pedirlo, en vez de rechazar para siempre
      if (fallo && id) {
        fallo = null;
        reintentos = 0;
        void listo.then((ts) => id && ts.reset(id)).catch(() => {});
      } else if (fallo) {
        return Promise.reject(fallo);
      }
      return new Promise<string>((resolver, rechazar) => {
        const reloj = setTimeout(() => {
          esperando = esperando.filter((e) => e.resolver !== resolver);
          rechazar(new ErrorDeCaptcha("La verificación tardó demasiado. Recarga la página e inténtalo de nuevo."));
        }, ESPERA_MAXIMA_MS);
        esperando.push({
          resolver: (t) => (clearTimeout(reloj), resolver(t)),
          rechazar: (e) => (clearTimeout(reloj), rechazar(e)),
        });
        void listo.catch(() => {});
      });
    },
    reiniciar() {
      tokenListo = null;
      fallo = null;
      reintentos = 0;
      void listo.then((ts) => id && ts.reset(id)).catch(() => {});
    },
    quitar() {
      void listo.then((ts) => id && ts.remove(id)).catch(() => {});
    },
  };
}
