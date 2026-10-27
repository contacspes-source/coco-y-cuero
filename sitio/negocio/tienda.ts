/**
 * Cómo se compra en Coco & Cuero. Es contenido del negocio: si cambia
 * una forma de pago o una ciudad, se cambia aquí y se actualiza en
 * todo el sitio (detalle del perfume, registro, Mi cuenta).
 */

export const CIUDADES = ["Guadalajara", "Zamora", "Morelia"] as const;
export const OTRA_CIUDAD = "Otra ciudad (envío)";

/** 10 % en la primera compra con cuenta. Debe coincidir con privado.porcentaje_bienvenida() en la base. */
export const DESCUENTO_BIENVENIDA = 0.1;

export const PASOS_DE_COMPRA = [
  { titulo: "Apártalo", texto: "Con tu cuenta o por WhatsApp. Te confirmamos disponibilidad y fecha de entrega." },
  { titulo: "Acordamos la compra", texto: "Definimos contigo anticipo, forma de pago y entrega." },
  { titulo: "Recíbelo", texto: "Liquidas el resto al recibirlo, revisado y sellado." },
] as const;

export const FORMAS_DE_PAGO = [
  { titulo: "Efectivo", texto: "Al entregar en punto de recolecta o a domicilio." },
  { titulo: "Transferencia", texto: "SPEI desde cualquier banco. Te mandamos los datos por WhatsApp." },
  { titulo: "Depósito", texto: "En ventanilla o tienda de conveniencia." },
] as const;

export const FORMAS_DE_ENTREGA = [
  { titulo: "Punto de recolecta", texto: "En Guadalajara, Zamora y Morelia. Sin costo." },
  { titulo: "A domicilio", texto: "Dentro de esas tres ciudades. Pregunta disponibilidad por zona." },
  { titulo: "Envío a la república", texto: "Por paquetería a tu domicilio. El costo depende del destino." },
] as const;

export const GARANTIA =
  "Originales, en caja sellada y con código de lote. Si recibes algo distinto a lo que pediste, lo cambiamos o te devolvemos tu dinero.";
