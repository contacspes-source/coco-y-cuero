/**
 * Reglas de pedidos y clientes del panel. Las transiciones de estado
 * repiten a propósito las de la base (validar_transicion_pedido): aquí
 * deciden qué botones mostrar; allá, qué se permite de verdad.
 * Pruebas en pruebas/ventas.test.ts.
 */
import type {
  CambiosDePedido,
  ClienteAdmin,
  ClienteEditable,
  EstadoPedido,
  FormaPago,
  NuevoPedido,
  PedidoAdmin,
} from "../../compartido/tipos";
import { sinAcentos } from "../../compartido/texto";
import type { RepositorioVentas } from "../datos/contratos";
import { RepositorioVentasSupabase } from "../datos/repositorio-ventas";
import { ErrorDeValidacion, type ProblemaDeCampo } from "./errores";
import { redondearADecenas } from "./precios";

// ------------------------------------------------------------------
// Estados
// ------------------------------------------------------------------

export const ESTADOS: Record<EstadoPedido, { nombre: string; accion: string; ayuda: string }> = {
  consultado: { nombre: "Solicitado", accion: "", ayuda: "El cliente preguntó o apartó en la página. Falta confirmar existencia y anticipo." },
  apartado: { nombre: "Apartado", accion: "Marcar apartado", ayuda: "Ya pagó anticipo. Toca comprarlo al proveedor." },
  comprado: { nombre: "Comprado", accion: "Marcar comprado", ayuda: "Ya lo tienes. Falta entregarlo y cobrar el saldo." },
  entregado: { nombre: "Entregado", accion: "Marcar entregado", ayuda: "Venta cerrada." },
  cancelado: { nombre: "Cancelado", accion: "Cancelar pedido", ayuda: "No se concretó." },
};

const SIGUIENTE: Partial<Record<EstadoPedido, EstadoPedido>> = {
  consultado: "apartado",
  apartado: "comprado",
  comprado: "entregado",
};

export const siguienteEstado = (e: EstadoPedido): EstadoPedido | null => SIGUIENTE[e] ?? null;
export const esFinal = (e: EstadoPedido) => e === "entregado" || e === "cancelado";
export const esActivo = (e: EstadoPedido) => !esFinal(e);

export function transicionesDe(e: EstadoPedido): EstadoPedido[] {
  if (esFinal(e)) return [];
  const sig = siguienteEstado(e);
  return sig ? [sig, "cancelado"] : ["cancelado"];
}

/** Lo que conviene revisar antes de avanzar (no bloquea; la persona decide). */
export function advertenciaAlAvanzar(p: Pick<PedidoAdmin, "anticipo" | "saldo">, a: EstadoPedido): string | null {
  if (a === "apartado" && p.anticipo <= 0) return "Este pedido no tiene pagos registrados. Anota el anticipo en Pagos antes de marcarlo apartado.";
  if (a === "entregado" && p.saldo > 0) return `Queda un saldo de $${p.saldo}. Regístralo en Pagos (botón "Pagó todo") para que el pedido cierre en ceros.`;
  return null;
}

// ------------------------------------------------------------------
// Anticipo y mensajes
// ------------------------------------------------------------------

/** Porcentaje del precio que se pide de anticipo. Cámbialo aquí. */
export const PORCENTAJE_ANTICIPO = 0.5;

export function anticipoSugerido(precio: number): number {
  return Math.min(precio, redondearADecenas(precio * PORCENTAJE_ANTICIPO));
}

// ------------------------------------------------------------------
// Descuento de bienvenida y pagos
// ------------------------------------------------------------------

/** El mismo 10 % que aplica la página (privado.porcentaje_bienvenida). */
export const PORCENTAJE_BIENVENIDA = 0.1;

/** Pesos de descuento: el precio final se redondea a decenas, igual que en la página. */
export function descuentoBienvenida(precioLista: number): number {
  if (!Number.isFinite(precioLista) || precioLista <= 0) return 0;
  return precioLista - redondearADecenas(precioLista * (1 - PORCENTAJE_BIENVENIDA));
}

/** ¿Le toca la bienvenida? Sí, si no tiene otro pedido que no esté cancelado. */
export function esPrimeraCompra(clienteId: number | null, pedidos: PedidoAdmin[], salvo?: number): boolean {
  if (!clienteId) return false;
  return !pedidos.some((p) => p.clienteId === clienteId && p.id !== salvo && p.estado !== "cancelado");
}

export const FORMAS_PAGO: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  deposito: "Depósito",
  otro: "Otro",
};

/** Lo que falta por pagar si se aplica un precio nuevo. */
export function saldoCon(precioFinal: number, pagado: number): number {
  return Math.max(0, precioFinal - pagado);
}

export function validarPago(p: Pick<PedidoAdmin, "estado" | "saldo">, monto: number, forma: FormaPago | null): { campo: string; mensaje: string }[] {
  const r: { campo: string; mensaje: string }[] = [];
  if (p.estado === "cancelado") r.push({ campo: "monto", mensaje: "El pedido está cancelado." });
  else if (!Number.isFinite(monto) || monto <= 0) r.push({ campo: "monto", mensaje: "Escribe cuánto te pagó." });
  else if (monto > p.saldo) r.push({ campo: "monto", mensaje: `Es más de lo que falta por pagar (${pesos(p.saldo)}).` });
  if (!forma) r.push({ campo: "forma", mensaje: "Elige cómo te pagó." });
  return r;
}

const pesos = (n: number) => `$${n.toLocaleString("es-MX")}`;

/** Mensaje de WhatsApp listo para mandar según el estado del pedido. */
export function mensajeParaCliente(p: PedidoAdmin): string {
  const nombre = p.clienteNombre?.split(" ")[0] ?? "";
  const perfume = `${p.marca ?? ""} ${p.perfume ?? "tu perfume"}${p.ml ? ` de ${p.ml} ml` : ""}`.trim();
  switch (p.estado) {
    case "consultado":
      return `Hola ${nombre}, gracias por tu pedido #${p.id} de ${perfume} en Coco & Cuero. ¡Sí lo tenemos! El precio es ${pesos(p.precioPactado)}. Para apartarlo necesitamos un anticipo de ${pesos(anticipoSugerido(p.precioPactado))}. ¿Te paso los datos para transferir?`;
    case "apartado":
      return `Hola ${nombre}, recibimos tu anticipo de ${pesos(p.anticipo)} para el pedido #${p.id} (${perfume}). Ya lo estamos pidiendo; te aviso en cuanto lo tenga.`;
    case "comprado":
      return `Hola ${nombre}, ¡ya tenemos tu ${perfume}! (pedido #${p.id}). Quedan ${pesos(p.saldo)} por liquidar. ¿Cuándo y dónde te queda mejor la entrega${p.ciudadEntrega ? ` en ${p.ciudadEntrega}` : ""}?`;
    case "entregado":
      return `Hola ${nombre}, gracias por tu compra en Coco & Cuero. Esperamos que disfrutes tu ${perfume}. Si te gustó, nos ayudaría mucho que nos recomendaras.`;
    case "cancelado":
      return `Hola ${nombre}, sobre tu pedido #${p.id} (${perfume}): quedó cancelado. Si quieres otro perfume, aquí estoy para ayudarte.`;
  }
}

export function enlaceWhatsApp(telefono: string | null, texto: string): string | null {
  if (!telefono) return null;
  return `https://wa.me/52${telefono}?text=${encodeURIComponent(texto)}`;
}

// ------------------------------------------------------------------
// Validación
// ------------------------------------------------------------------

/** Igual que en la página: 10 dígitos de México, con o sin +52 / +521. */
export function normalizarTelefono(t: string): string | null {
  let d = t.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[2-9]\d{9}$/.test(d) ? d : null;
}

/**
 * Clientes que comparten WhatsApp con otro (p. ej. lo diste de alta tú
 * y luego creó su cuenta en la página). No se unen solos: cualquiera
 * podría escribir el teléfono de otra persona. Solo se avisa.
 * Devuelve, por id de cliente, los números de cliente con los que choca.
 */
export function duplicadosPorTelefono(clientes: Pick<ClienteAdmin, "id" | "numeroCliente" | "telefono" | "activo">[]): Map<number, string[]> {
  const porTel = new Map<string, Pick<ClienteAdmin, "id" | "numeroCliente">[]>();
  for (const c of clientes) {
    // los dados de baja no cuentan: ya se resolvió
    const t = c.activo && c.telefono ? normalizarTelefono(c.telefono) : null;
    if (!t) continue;
    porTel.set(t, [...(porTel.get(t) ?? []), c]);
  }
  const r = new Map<number, string[]>();
  for (const grupo of porTel.values()) {
    if (grupo.length < 2) continue;
    for (const c of grupo) r.set(c.id, grupo.filter((o) => o.id !== c.id).map((o) => `#${o.numeroCliente}`));
  }
  return r;
}

export function validarCliente(c: ClienteEditable): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (c.nombre.trim().length < 2) p.push({ campo: "nombre", mensaje: "Escribe el nombre." });
  if (c.telefono.trim() && !normalizarTelefono(c.telefono)) p.push({ campo: "telefono", mensaje: "WhatsApp de 10 dígitos (lada + número), sin el +52." });
  if (c.direccion.length > 200) p.push({ campo: "direccion", mensaje: "Dirección demasiado larga." });
  return p;
}

/** Precio final del alta (lista menos descuento). */
export const precioFinalDe = (n: Pick<NuevoPedido, "precioLista" | "descuento">) => n.precioLista - (n.descuento || 0);

/** Lo que se cobra al registrar, según la opción elegida. */
export function pagoInicialDe(n: NuevoPedido): number {
  const final = precioFinalDe(n);
  if (n.pagoInicial === "completo" || n.pagoInicial === "venta-directa") return final;
  if (n.pagoInicial === "anticipo") return n.anticipo;
  return 0;
}

export function validarNuevoPedido(n: NuevoPedido): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  const final = precioFinalDe(n);
  if (!n.clienteId) p.push({ campo: "cliente", mensaje: "Elige el cliente." });
  if (!n.presentacionId) p.push({ campo: "presentacion", mensaje: "Elige el perfume y tamaño." });
  if (!Number.isFinite(n.precioLista) || n.precioLista <= 0) p.push({ campo: "precio", mensaje: "El precio debe ser mayor que cero." });
  else if (!Number.isFinite(n.descuento) || n.descuento < 0) p.push({ campo: "descuento", mensaje: "El descuento no puede ser negativo." });
  else if (final <= 0) p.push({ campo: "descuento", mensaje: "El descuento no puede ser igual o mayor que el precio." });
  if (n.pagoInicial === "anticipo") {
    if (!Number.isFinite(n.anticipo) || n.anticipo <= 0) p.push({ campo: "anticipo", mensaje: "Escribe cuánto dejó de anticipo." });
    else if (final > 0 && n.anticipo >= final) p.push({ campo: "anticipo", mensaje: "Eso ya es el precio completo: elige \"Pagó completo\"." });
  }
  if (n.pagoInicial !== "nada" && !n.formaPago) p.push({ campo: "forma", mensaje: "Elige cómo te pagó." });
  return p;
}

export function validarCambios(p: Pick<PedidoAdmin, "precioPactado" | "anticipo">, c: CambiosDePedido): ProblemaDeCampo[] {
  const r: ProblemaDeCampo[] = [];
  const precio = c.precioPactado ?? p.precioPactado;
  if (c.descuento !== undefined && (!Number.isFinite(c.descuento) || c.descuento < 0)) {
    r.push({ campo: "descuento", mensaje: "El descuento no puede ser negativo." });
  }
  if (!Number.isFinite(precio) || precio <= 0) r.push({ campo: "precio", mensaje: "El precio final debe ser mayor que cero." });
  else if (precio < p.anticipo) r.push({ campo: "precio", mensaje: `Ya te pagó ${pesos(p.anticipo)}; el precio no puede quedar por debajo.` });
  return r;
}

// ------------------------------------------------------------------
// Listas
// ------------------------------------------------------------------

export type VistaPedidos = "activos" | EstadoPedido | "todos";

export function filtrarPedidos(lista: PedidoAdmin[], vista: VistaPedidos, texto: string): PedidoAdmin[] {
  const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
  return lista.filter((p) => {
    if (vista === "activos" && !esActivo(p.estado)) return false;
    if (vista !== "activos" && vista !== "todos" && p.estado !== vista) return false;
    if (!palabras.length) return true;
    const pajar = sinAcentos(`#${p.id} ${p.clienteNombre ?? ""} ${p.numeroCliente ?? ""} ${p.clienteTelefono ?? ""} ${p.marca ?? ""} ${p.perfume ?? ""}`);
    return palabras.every((w) => pajar.includes(w));
  });
}

export function resumirPedidos(lista: PedidoAdmin[]) {
  const de = (e: EstadoPedido) => lista.filter((p) => p.estado === e);
  const activos = lista.filter((p) => esActivo(p.estado));
  return {
    solicitados: de("consultado").length,
    apartados: de("apartado").length,
    comprados: de("comprado").length,
    porCobrar: activos.filter((p) => p.estado !== "consultado").reduce((s, p) => s + p.saldo, 0),
    anticiposEnCurso: activos.reduce((s, p) => s + p.anticipo, 0),
    conteo: Object.fromEntries((["consultado", "apartado", "comprado", "entregado", "cancelado"] as EstadoPedido[]).map((e) => [e, de(e).length])) as Record<EstadoPedido, number>,
  };
}

export function filtrarClientes(lista: ClienteAdmin[], texto: string): ClienteAdmin[] {
  const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return lista;
  return lista.filter((c) => {
    const pajar = sinAcentos(`#${c.numeroCliente} ${c.numeroCliente} ${c.nombre} ${c.telefono ?? ""} ${c.correo ?? ""} ${c.ciudad ?? ""}`);
    return palabras.every((w) => pajar.includes(w));
  });
}

// ------------------------------------------------------------------
// Casos de uso
// ------------------------------------------------------------------

export function validarCostoReal(costo: number | null, precio: number): ProblemaDeCampo[] {
  if (costo === null) return [];
  if (!Number.isFinite(costo) || costo < 0) return [{ campo: "costo", mensaje: "Escribe lo que pagaste, en pesos." }];
  if (costo > precio * 3 && precio > 0) return [{ campo: "costo", mensaje: "Revisa el costo: es más del triple del precio." }];
  return [];
}

/** Ganancia de un pedido: precio menos costo real. null si aún no hay costo. */
export function gananciaDe(p: Pick<PedidoAdmin, "precioPactado" | "costoReal">): number | null {
  return p.costoReal === null ? null : p.precioPactado - p.costoReal;
}

export class ServicioVentas {
  constructor(private readonly repo: RepositorioVentas) {}

  listarClientes = () => this.repo.listarClientes();
  darDeBajaCliente = (id: number) => this.repo.darDeBajaCliente(id);
  reactivarCliente = (id: number) => this.repo.reactivarCliente(id);
  borrarCliente = (id: number) => this.repo.borrarCliente(id);
  listarPedidos = () => this.repo.listarPedidos();
  canales = () => this.repo.canales();

  async guardarCliente(c: ClienteEditable): Promise<number> {
    const problemas = validarCliente(c);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.guardarCliente({
      ...c,
      nombre: c.nombre.trim().replace(/\s+/g, " "),
      telefono: c.telefono.trim() ? normalizarTelefono(c.telefono)! : "",
      direccion: c.direccion.trim(),
      ciudad: c.ciudad.trim(),
    });
  }

  async crearPedido(n: NuevoPedido): Promise<number> {
    const problemas = validarNuevoPedido(n);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.crearPedido({
      ...n,
      anticipo: pagoInicialDe(n),
      formaPago: n.pagoInicial === "nada" ? null : n.formaPago,
      ciudadEntrega: n.ciudadEntrega.trim(),
      notas: n.notas.trim(),
    });
  }

  async registrarPago(p: PedidoAdmin, monto: number, forma: FormaPago | null, nota = ""): Promise<void> {
    const problemas = validarPago(p, monto, forma);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    await this.repo.registrarPago(p.id, monto, forma!, nota.trim());
  }

  /** "Pagó todo": registra lo que falta. */
  liquidar = (p: PedidoAdmin, forma: FormaPago | null) => this.registrarPago(p, p.saldo, forma);

  eliminarPago = (pagoId: number) => this.repo.eliminarPago(pagoId);

  async guardarCambios(p: PedidoAdmin, c: CambiosDePedido, notaInterna?: string | null): Promise<void> {
    const problemas = validarCambios(p, c);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    if (Object.keys(c).length) await this.repo.actualizarPedido(p.id, c);
    if (notaInterna !== undefined && (notaInterna ?? "") !== (p.notaInterna ?? "")) {
      await this.repo.guardarNotaInterna(p.id, notaInterna);
    }
  }

  /**
   * Lo que realmente pagaste por el perfume. Texto vacío = borrar (vuelve
   * a usarse el costo de catálogo en los reportes).
   */
  async guardarCostoReal(p: PedidoAdmin, texto: string): Promise<void> {
    const limpio = texto.trim();
    const costo = limpio === "" ? null : Number(limpio);
    const problemas = validarCostoReal(costo, p.precioPactado);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    if (costo === p.costoReal) return;
    await this.repo.guardarCostoReal(p.id, costo);
  }

  async cambiarEstado(p: PedidoAdmin, a: EstadoPedido): Promise<void> {
    if (!transicionesDe(p.estado).includes(a)) {
      throw new ErrorDeValidacion([{ campo: "estado", mensaje: `No se puede pasar de ${ESTADOS[p.estado].nombre} a ${ESTADOS[a].nombre}.` }]);
    }
    await this.repo.actualizarPedido(p.id, { estado: a });
  }
}

export function crearServicioVentas() {
  return new ServicioVentas(new RepositorioVentasSupabase());
}
