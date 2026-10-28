/**
 * La portada del sitio: las diapositivas del carrusel y la franja de
 * beneficios. Es contenido del negocio: para cambiar un texto o el
 * orden de las diapositivas se edita aquí, no en la pantalla.
 */
import { DESCUENTO_BIENVENIDA } from "./tienda";

const PORCENTAJE = `${Math.round(DESCUENTO_BIENVENIDA * 100)} %`;

/** Cómo se ilustra cada diapositiva (lo dibuja la capa de presentación). */
export type Arte = "frascos" | "numero" | "pasos" | "pago" | "mapa" | "sello";
/** Paleta de cada diapositiva, todas de la marca. */
export type Tema = "cuero" | "caramelo" | "crema" | "ebano" | "arena" | "oscuro";

export interface Diapositiva {
  clave: string;
  tema: Tema;
  arte: Arte;
  rotulo: string;
  /** El texto entre *asteriscos* va en cursiva. */
  titulo: string;
  texto: string;
  accion: { texto: string; destino: "catalogo" | "registro" | "como-pedir" | "whatsapp" | "originales" };
  /** Solo se muestra a quien todavía puede usar el descuento. */
  soloSinCompras?: boolean;
}

export const DIAPOSITIVAS: Diapositiva[] = [
  {
    clave: "que-es",
    tema: "cuero",
    arte: "frascos",
    rotulo: "Perfumería · Guadalajara · Zamora · Morelia",
    titulo: "Perfumes árabes, *de nicho* y de diseñador.",
    texto: "Cada perfume se pide especialmente para ti: lo apartas, lo conseguimos y te lo entregamos.",
    accion: { texto: "Ver catálogo", destino: "catalogo" },
  },
  {
    clave: "bienvenida",
    tema: "caramelo",
    arte: "numero",
    rotulo: "Bienvenida",
    titulo: `*${PORCENTAJE}* en tu primera compra.`,
    texto: "Crea tu cuenta y el descuento se aplica solo al apartar tu perfume.",
    accion: { texto: "Crear mi cuenta", destino: "registro" },
    soloSinCompras: true,
  },
  {
    clave: "como-funciona",
    tema: "crema",
    arte: "pasos",
    rotulo: "Cómo funciona",
    titulo: "Apartas, acordamos *y lo recibes*.",
    texto: "Sin cobros en la página: te confirmamos disponibilidad y fecha por WhatsApp antes de pagar.",
    accion: { texto: "Ver cómo pedir", destino: "como-pedir" },
  },
  {
    clave: "pago",
    tema: "ebano",
    arte: "pago",
    rotulo: "Formas de pago",
    titulo: "Paga *como prefieras*.",
    texto: "Un anticipo para conseguirlo y el resto al recibirlo. Efectivo, transferencia o depósito.",
    accion: { texto: "Preguntar por WhatsApp", destino: "whatsapp" },
  },
  {
    clave: "entregas",
    tema: "arena",
    arte: "mapa",
    rotulo: "Entregas",
    titulo: "Recolecta gratis *o envío a toda la república*.",
    texto: "Punto de entrega en Guadalajara, Zamora y Morelia, a domicilio o por paquetería.",
    accion: { texto: "Ver catálogo", destino: "catalogo" },
  },
  {
    clave: "originales",
    tema: "oscuro",
    arte: "sello",
    rotulo: "Garantía",
    titulo: "*100 %* originales.",
    texto: "Caja sellada y código de lote. Si recibes algo distinto a lo que pediste, lo cambiamos o te devolvemos tu dinero.",
    accion: { texto: "Nuestra garantía", destino: "originales" },
  },
];

export const BENEFICIOS = [
  { icono: "sello", titulo: "100 % originales", texto: "Caja sellada y código de lote" },
  { icono: "camion", titulo: "Envíos a toda la república", texto: "Recolecta gratis en GDL, Zamora y Morelia" },
  { icono: "tarjeta", titulo: "Paga como prefieras", texto: "Efectivo, transferencia o depósito" },
  { icono: "regalo", titulo: `${PORCENTAJE} en tu primera compra`, texto: "Al crear tu cuenta" },
] as const;

/** Las diapositivas que le tocan a quien visita (el 10 % solo si aún aplica). */
export function diapositivasPara(puedeUsarBienvenida: boolean): Diapositiva[] {
  return DIAPOSITIVAS.filter((d) => !d.soloSinCompras || puedeUsarBienvenida);
}

/** "Perfumes *de nicho*" → partes normales y en cursiva, para pintarlas sin HTML. */
export function partesDelTitulo(titulo: string): { texto: string; cursiva: boolean }[] {
  return titulo
    .split("*")
    .map((texto, i) => ({ texto, cursiva: i % 2 === 1 }))
    .filter((p) => p.texto !== "");
}

// ------------------------------------------------------------------
// Carrusel
// ------------------------------------------------------------------

export const CADA_DIAPOSITIVA_MS = 6500;

/** Siguiente o anterior, dando la vuelta en los extremos. */
export function moverIndice(actual: number, total: number, paso: number): number {
  if (total <= 0) return 0;
  return (((actual + paso) % total) + total) % total;
}

/**
 * ¿Ese arrastre fue para cambiar de diapositiva? Debe ser sobre todo
 * horizontal y de al menos 48 px; si no, era scroll de la página.
 * Devuelve +1 (siguiente), −1 (anterior) o 0.
 */
export function direccionDeArrastre(dx: number, dy: number, minimo = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < minimo || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}
