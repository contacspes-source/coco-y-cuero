/**
 * Punto de entrada del Worker. Cloudflare trata cada `export` de este
 * archivo como un servicio, así que aquí solo va el `default`; la lógica
 * (y lo que se prueba) vive en manejador.ts.
 */
import { manejar, type Cache, type Contexto, type Entorno } from "./manejador";

export default {
  fetch(peticion: Request, entorno: Entorno, ctx: Contexto): Promise<Response> {
    const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
    return manejar(peticion, entorno, ctx, { pedir: (u, i) => fetch(u, i), cache });
  },
};
