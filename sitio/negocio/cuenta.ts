/**
 * Reglas de la cuenta del cliente: validar el registro, explicar el
 * estado de cada pedido y armar su línea de tiempo. Lo puro se prueba
 * en pruebas/cuenta.test.ts; ServicioCuenta recibe su repositorio por
 * constructor para poder probarse con uno falso.
 */
import { ErrorDeDatos, ErrorDeValidacion, type ProblemaDeCampo } from "../../compartido/errores";
import type { DatosDeRegistro, EventoDeCuenta, PedidoPropio, Perfil, RepositorioCuenta } from "../datos/repositorio-cuenta";

export { ErrorDeDatos, ErrorDeValidacion };
export type { DatosDeRegistro, EventoDeCuenta, PedidoPropio, Perfil, ProblemaDeCampo };

export const LARGO_MINIMO_CONTRASENA = 8;

/** "+52 (33) 1234-5678" → "3312345678"; null si no son 10 dígitos. */
export function normalizarTelefono(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  const diez = digitos.length > 10 ? digitos.slice(-10) : digitos;
  return diez.length === 10 ? diez : null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarRegistro(d: DatosDeRegistro): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (d.nombre.trim().length < 3) p.push({ campo: "nombre", mensaje: "Escribe tu nombre completo." });
  if (!normalizarTelefono(d.telefono)) p.push({ campo: "telefono", mensaje: "Tu WhatsApp a 10 dígitos." });
  if (!CORREO.test(d.correo.trim())) p.push({ campo: "correo", mensaje: "Revisa tu correo." });
  if (d.contrasena.length < LARGO_MINIMO_CONTRASENA) {
    p.push({ campo: "contrasena", mensaje: `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` });
  } else if (!/\d/.test(d.contrasena) || !/[a-zA-Z]/.test(d.contrasena)) {
    p.push({ campo: "contrasena", mensaje: "Combina letras y números." });
  }
  if (!d.ciudad) p.push({ campo: "ciudad", mensaje: "Elige tu ciudad." });
  if (d.direccion.trim().length > 200) p.push({ campo: "direccion", mensaje: "La dirección es demasiado larga." });
  return p;
}

export function validarPerfil(p: { nombre: string; telefono: string }): ProblemaDeCampo[] {
  const r: ProblemaDeCampo[] = [];
  if (p.nombre.trim().length < 3) r.push({ campo: "nombre", mensaje: "Escribe tu nombre completo." });
  if (!normalizarTelefono(p.telefono)) r.push({ campo: "telefono", mensaje: "Tu WhatsApp a 10 dígitos." });
  return r;
}

// ------------------------------------------------------------------
// Estados del pedido, contados para el cliente
// ------------------------------------------------------------------

export const ETAPAS = ["consultado", "apartado", "comprado", "entregado"] as const;

export const ESTADO_CLIENTE: Record<string, { titulo: string; texto: string }> = {
  consultado: { titulo: "Solicitado", texto: "Recibimos tu solicitud. Te escribimos por WhatsApp para confirmar existencia y anticipo." },
  apartado: { titulo: "Apartado", texto: "Recibimos tu anticipo. Estamos comprando tu perfume." },
  comprado: { titulo: "En camino", texto: "Ya lo tenemos. Coordinamos contigo la entrega." },
  entregado: { titulo: "Entregado", texto: "¡Gracias por tu compra! Que lo disfrutes." },
  cancelado: { titulo: "Cancelado", texto: "Este pedido se canceló." },
};

export interface Etapa {
  estado: string;
  titulo: string;
  fecha: string | null;
  hecha: boolean;
  actual: boolean;
}

/** Línea de tiempo de 4 pasos con la fecha en que se cumplió cada uno. */
export function etapasDe(p: Pick<PedidoPropio, "estado" | "historial">): Etapa[] {
  const indice = ETAPAS.indexOf(p.estado as (typeof ETAPAS)[number]);
  const fecha = (e: string) => p.historial.find((h) => h.estado === e)?.fecha ?? null;
  return ETAPAS.map((e, i) => ({
    estado: e,
    titulo: ESTADO_CLIENTE[e]!.titulo,
    fecha: fecha(e),
    hecha: p.estado !== "cancelado" ? i <= indice : fecha(e) !== null,
    actual: i === indice,
  }));
}

export const sePuedeCancelar = (p: Pick<PedidoPropio, "estado">) => p.estado === "consultado";

export function pedidosActivos(lista: PedidoPropio[]): number {
  return lista.filter((p) => ["consultado", "apartado", "comprado"].includes(p.estado)).length;
}

// ------------------------------------------------------------------
// Casos de uso
// ------------------------------------------------------------------

type Repo = Pick<
  RepositorioCuenta,
  | "correoActual"
  | "registrar"
  | "entrar"
  | "salir"
  | "recuperar"
  | "cambiarContrasena"
  | "alCambiar"
  | "canales"
  | "perfil"
  | "guardarPerfil"
  | "misPedidos"
  | "solicitar"
  | "cancelar"
>;

export class ServicioCuenta {
  constructor(private readonly repo: Repo) {}

  correoActual = () => this.repo.correoActual();
  perfil = () => this.repo.perfil();
  canales = () => this.repo.canales();
  misPedidos = () => this.repo.misPedidos();
  salir = () => this.repo.salir();
  alCambiar = (e: (x: EventoDeCuenta) => void) => this.repo.alCambiar(e);

  async registrar(d: DatosDeRegistro, volverA: string) {
    const problemas = validarRegistro(d);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.registrar(
      {
        ...d,
        correo: d.correo.trim().toLowerCase(),
        nombre: d.nombre.trim().replace(/\s+/g, " "),
        telefono: normalizarTelefono(d.telefono)!,
        direccion: d.direccion.trim(),
      },
      volverA,
    );
  }

  async entrar(correo: string, contrasena: string) {
    if (!CORREO.test(correo.trim()) || !contrasena) {
      throw new ErrorDeValidacion([{ campo: "correo", mensaje: "Escribe tu correo y contraseña." }]);
    }
    return this.repo.entrar(correo.trim().toLowerCase(), contrasena);
  }

  async recuperar(correo: string, volverA: string) {
    if (!CORREO.test(correo.trim())) {
      throw new ErrorDeValidacion([{ campo: "correo", mensaje: "Escribe tu correo para mandarte el enlace." }]);
    }
    return this.repo.recuperar(correo.trim().toLowerCase(), volverA);
  }

  async cambiarContrasena(nueva: string, confirmacion: string) {
    if (nueva.length < LARGO_MINIMO_CONTRASENA) {
      throw new ErrorDeValidacion([{ campo: "contrasena", mensaje: `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` }]);
    }
    if (nueva !== confirmacion) throw new ErrorDeValidacion([{ campo: "confirmacion", mensaje: "No coinciden." }]);
    return this.repo.cambiarContrasena(nueva);
  }

  async guardarPerfil(p: { nombre: string; telefono: string; direccion: string; ciudad: string; canalId: number | null }) {
    const problemas = validarPerfil(p);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.guardarPerfil({
      nombre: p.nombre.trim().replace(/\s+/g, " "),
      telefono: normalizarTelefono(p.telefono),
      direccion: p.direccion.trim() || null,
      ciudad: p.ciudad || null,
      canalId: p.canalId,
    });
  }

  async apartar(presentacionId: number | null, ciudad: string | null, notas: string) {
    if (presentacionId === null) {
      throw new ErrorDeDatos("regla", "Este perfume no se puede apartar en línea. Pídelo por WhatsApp.");
    }
    return this.repo.solicitar(presentacionId, ciudad, notas.trim() || null);
  }

  cancelar(pedidoId: number) {
    return this.repo.cancelar(pedidoId);
  }
}
