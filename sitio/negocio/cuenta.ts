/**
 * Reglas de la cuenta del cliente: validar el registro, explicar el
 * estado de cada pedido y armar su línea de tiempo. Lo puro se prueba
 * en pruebas/cuenta.test.ts; ServicioCuenta recibe su repositorio por
 * constructor para poder probarse con uno falso.
 */
import { ErrorDeDatos, ErrorDeValidacion, type ProblemaDeCampo } from "../../compartido/errores";
import type {
  DatosDeRegistro,
  EventoDeCuenta,
  PedidoPropio,
  Perfil,
  RepositorioCuenta,
  SesionActual,
} from "../datos/repositorio-cuenta";
import { DESCUENTO_BIENVENIDA, OTRA_CIUDAD } from "./tienda";

export { ErrorDeDatos, ErrorDeValidacion };
export type { DatosDeRegistro, EventoDeCuenta, PedidoPropio, Perfil, ProblemaDeCampo, SesionActual };

export const LARGO_MINIMO_CONTRASENA = 8;

/** "+52 (33) 1234-5678" → "3312345678"; null si no son 10 dígitos. */
export function normalizarTelefono(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  const diez = digitos.length > 10 ? digitos.slice(-10) : digitos;
  return diez.length === 10 ? diez : null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ------------------------------------------------------------------
// Dirección de envío: solo se pide para envíos a otra ciudad de la
// república. En Guadalajara, Zamora y Morelia se entrega en un punto
// acordado por WhatsApp, así que no hace falta.
// ------------------------------------------------------------------

export interface Direccion {
  calle: string;
  colonia: string;
  cp: string;
  municipio: string;
  estado: string;
  referencias: string;
}

export const DIRECCION_VACIA: Direccion = { calle: "", colonia: "", cp: "", municipio: "", estado: "", referencias: "" };

export const ESTADOS_DE_MEXICO = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua",
  "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México", "Guanajuato", "Guerrero",
  "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla",
  "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas",
  "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
] as const;

export const LARGO_MAXIMO_DIRECCION = 300;
const SEPARADOR = " · ";

export const requiereDireccion = (ciudad: string | null) => ciudad === OTRA_CIUDAD;

const limpio = (t: string) => t.trim().replace(/\s+/g, " ").replaceAll("·", "-");

export function validarDireccion(d: Direccion): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (limpio(d.calle).length < 4) p.push({ campo: "calle", mensaje: "Calle y número." });
  if (limpio(d.colonia).length < 2) p.push({ campo: "colonia", mensaje: "Escribe la colonia." });
  if (!/^\d{5}$/.test(d.cp.trim())) p.push({ campo: "cp", mensaje: "Código postal de 5 dígitos." });
  if (limpio(d.municipio).length < 2) p.push({ campo: "municipio", mensaje: "Ciudad o municipio." });
  if (!(ESTADOS_DE_MEXICO as readonly string[]).includes(d.estado)) p.push({ campo: "estado", mensaje: "Elige el estado." });
  if (!p.length && componerDireccion(d).length > LARGO_MAXIMO_DIRECCION) {
    p.push({ campo: "referencias", mensaje: "Acorta las referencias." });
  }
  return p;
}

/** "Av. Juárez 120 · Col. Centro · C.P. 72000 · Puebla, Puebla · Ref. portón negro" */
export function componerDireccion(d: Direccion): string {
  const partes = [
    limpio(d.calle),
    `Col. ${limpio(d.colonia)}`,
    `C.P. ${d.cp.trim()}`,
    `${limpio(d.municipio)}, ${d.estado}`,
  ];
  if (limpio(d.referencias)) partes.push(`Ref. ${limpio(d.referencias)}`);
  return partes.join(SEPARADOR);
}

/** El camino de regreso para editar. Un texto libre viejo cae completo en "calle". */
export function separarDireccion(texto: string | null): Direccion {
  if (!texto) return { ...DIRECCION_VACIA };
  const partes = texto.split(SEPARADOR);
  const col = partes[1]?.startsWith("Col. ") ? partes[1].slice(5) : null;
  const cp = partes[2]?.match(/^C\.P\. (\d{5})$/)?.[1] ?? null;
  const lugar = partes[3]?.match(/^(.*), ([^,]+)$/);
  if (col === null || cp === null || !lugar) return { ...DIRECCION_VACIA, calle: texto };
  return {
    calle: partes[0]!,
    colonia: col,
    cp,
    municipio: lugar[1]!,
    estado: lugar[2]!,
    referencias: partes[4]?.startsWith("Ref. ") ? partes[4].slice(5) : "",
  };
}

// ------------------------------------------------------------------
// Registro
// ------------------------------------------------------------------

/** Lo que llena el cliente; la dirección se compone antes de enviarse. */
export type FormularioRegistro = Omit<DatosDeRegistro, "direccion"> & {
  direccion: Direccion;
  aceptaTerminos: boolean;
};

export function validarRegistro(d: FormularioRegistro): ProblemaDeCampo[] {
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
  if (requiereDireccion(d.ciudad)) p.push(...validarDireccion(d.direccion));
  if (!d.aceptaTerminos) p.push({ campo: "terminos", mensaje: "Acepta los términos para crear tu cuenta." });
  return p;
}

export interface FormularioPerfil {
  nombre: string;
  telefono: string;
  ciudad: string;
  direccion: Direccion;
  canalId: number | null;
}

export function validarPerfil(p: Pick<FormularioPerfil, "nombre" | "telefono"> & Partial<FormularioPerfil>): ProblemaDeCampo[] {
  const r: ProblemaDeCampo[] = [];
  if (p.nombre.trim().length < 3) r.push({ campo: "nombre", mensaje: "Escribe tu nombre completo." });
  if (!normalizarTelefono(p.telefono)) r.push({ campo: "telefono", mensaje: "Tu WhatsApp a 10 dígitos." });
  if (p.direccion && requiereDireccion(p.ciudad ?? null)) r.push(...validarDireccion(p.direccion));
  return r;
}

// ------------------------------------------------------------------
// 10 % de bienvenida. El cobro real lo decide la base (redondea a
// decenas igual que aquí y nunca baja del costo); esto es para mostrar.
// ------------------------------------------------------------------

export function precioConBienvenida(precio: number, porcentaje = DESCUENTO_BIENVENIDA): number {
  return Math.round((precio * (1 - porcentaje)) / 10) * 10;
}

/** "Jorge Duarte López" → "Jorge"; sin nombre, la parte del correo antes de la @. */
export function primerNombre(nombre: string | null | undefined, correo = ""): string {
  const n = (nombre ?? "").trim().split(/\s+/)[0];
  if (n && n.length > 1) return n.length > 14 ? `${n.slice(0, 13)}…` : n;
  return correo.split("@")[0] || "";
}

// ------------------------------------------------------------------
// Estados del pedido, contados para el cliente
// ------------------------------------------------------------------

export const ETAPAS = ["consultado", "apartado", "comprado", "entregado"] as const;

export const ESTADO_CLIENTE: Record<string, { titulo: string; texto: string }> = {
  consultado: { titulo: "Solicitado", texto: "Recibimos tu solicitud. Te escribimos por WhatsApp para acordar la compra." },
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
  | "sesionActual"
  | "descuentoBienvenida"
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
  | "actualizarNombreDeSesion"
>;

export class ServicioCuenta {
  constructor(private readonly repo: Repo) {}

  sesionActual = () => this.repo.sesionActual();
  descuentoBienvenida = () => this.repo.descuentoBienvenida();
  perfil = () => this.repo.perfil();
  canales = () => this.repo.canales();
  misPedidos = () => this.repo.misPedidos();
  salir = () => this.repo.salir();
  alCambiar = (e: (x: EventoDeCuenta) => void) => this.repo.alCambiar(e);

  async registrar(d: FormularioRegistro, volverA: string) {
    const problemas = validarRegistro(d);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.registrar(
      {
        nombre: d.nombre.trim().replace(/\s+/g, " "),
        telefono: normalizarTelefono(d.telefono)!,
        correo: d.correo.trim().toLowerCase(),
        contrasena: d.contrasena,
        ciudad: d.ciudad,
        canal: d.canal,
        direccion: requiereDireccion(d.ciudad) ? componerDireccion(d.direccion) : "",
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

  async guardarPerfil(p: FormularioPerfil) {
    const problemas = validarPerfil(p);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    const nombre = p.nombre.trim().replace(/\s+/g, " ");
    await this.repo.guardarPerfil({
      nombre,
      telefono: normalizarTelefono(p.telefono),
      direccion: requiereDireccion(p.ciudad) ? componerDireccion(p.direccion) : null,
      ciudad: p.ciudad || null,
      canalId: p.canalId,
    });
    await this.repo.actualizarNombreDeSesion(nombre).catch(() => {});
    return nombre;
  }

  /** Envío a otra ciudad exige dirección completa; en las tres ciudades no se pide. */
  async apartar(presentacionId: number | null, ciudad: string | null, notas: string, direccion: Direccion | null = null) {
    if (presentacionId === null) {
      throw new ErrorDeDatos("regla", "Este perfume no se puede apartar en línea. Pídelo por WhatsApp.");
    }
    let envio: string | null = null;
    if (requiereDireccion(ciudad)) {
      const problemas = validarDireccion(direccion ?? DIRECCION_VACIA);
      if (problemas.length) throw new ErrorDeValidacion(problemas);
      envio = componerDireccion(direccion!);
    }
    return this.repo.solicitar(presentacionId, ciudad, notas.trim() || null, envio);
  }

  cancelar(pedidoId: number) {
    return this.repo.cancelar(pedidoId);
  }
}
