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
  if (a === "apartado" && p.anticipo <= 0) return "Este pedido no tiene anticipo registrado. Anótalo antes de marcarlo apartado.";
  if (a === "entregado" && p.saldo > 0) return `Queda un saldo de $${p.saldo}. Al entregar, registra que ya se pagó completo.`;
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

export function normalizarTelefono(t: string): string | null {
  const d = t.replace(/\D/g, "");
  const diez = d.length > 10 ? d.slice(-10) : d;
  return diez.length === 10 ? diez : null;
}

export function validarCliente(c: ClienteEditable): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (c.nombre.trim().length < 2) p.push({ campo: "nombre", mensaje: "Escribe el nombre." });
  if (c.telefono.trim() && !normalizarTelefono(c.telefono)) p.push({ campo: "telefono", mensaje: "El teléfono debe tener 10 dígitos." });
  if (c.direccion.length > 200) p.push({ campo: "direccion", mensaje: "Dirección demasiado larga." });
  return p;
}

export function validarNuevoPedido(n: NuevoPedido): ProblemaDeCampo[] {
  const p: ProblemaDeCampo[] = [];
  if (!n.clienteId) p.push({ campo: "cliente", mensaje: "Elige el cliente." });
  if (!n.presentacionId) p.push({ campo: "presentacion", mensaje: "Elige el perfume y tamaño." });
  if (!Number.isFinite(n.precioPactado) || n.precioPactado <= 0) p.push({ campo: "precio", mensaje: "El precio debe ser mayor que cero." });
  if (!Number.isFinite(n.anticipo) || n.anticipo < 0) p.push({ campo: "anticipo", mensaje: "El anticipo no puede ser negativo." });
  else if (n.anticipo > n.precioPactado) p.push({ campo: "anticipo", mensaje: "El anticipo no puede ser mayor que el precio." });
  return p;
}

export function validarCambios(p: Pick<PedidoAdmin, "precioPactado">, c: CambiosDePedido): ProblemaDeCampo[] {
  const r: ProblemaDeCampo[] = [];
  const precio = c.precioPactado ?? p.precioPactado;
  if (!Number.isFinite(precio) || precio <= 0) r.push({ campo: "precio", mensaje: "El precio debe ser mayor que cero." });
  if (c.anticipo !== undefined) {
    if (!Number.isFinite(c.anticipo) || c.anticipo < 0) r.push({ campo: "anticipo", mensaje: "El anticipo no puede ser negativo." });
    else if (c.anticipo > precio) r.push({ campo: "anticipo", mensaje: "El anticipo no puede ser mayor que el precio." });
  }
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
    return this.repo.crearPedido({ ...n, ciudadEntrega: n.ciudadEntrega.trim(), notas: n.notas.trim() });
  }

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
