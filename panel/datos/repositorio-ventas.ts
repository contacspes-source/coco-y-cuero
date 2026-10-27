import type {
  CambiosDePedido,
  ClienteAdmin,
  ClienteEditable,
  EstadoPedido,
  NuevoPedido,
  PedidoAdmin,
  Rol,
} from "../../compartido/tipos";
import type { RepositorioVentas } from "./contratos";
import { traducirError } from "./errores";
import { supabase } from "./supabase";

function revisar<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw traducirError(r.error);
  return r.data as T;
}

const num = (v: unknown) => Number(v ?? 0);
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));

function aPedido(f: Record<string, unknown>): PedidoAdmin {
  return {
    id: num(f.id),
    estado: f.estado as EstadoPedido,
    precioPactado: num(f.precio_pactado),
    descuento: num(f.descuento),
    anticipo: num(f.anticipo),
    saldo: num(f.saldo),
    ciudadEntrega: texto(f.ciudad_entrega),
    direccionEnvio: texto(f.direccion_envio),
    costoReal: f.costo_real === null || f.costo_real === undefined ? null : num(f.costo_real),
    costoOrigen: (f.costo_origen as "catalogo" | "manual" | null | undefined) ?? null,
    notas: texto(f.notas),
    notaInterna: texto(f.nota_interna),
    creadoEn: String(f.creado_en),
    actualizadoEn: String(f.actualizado_en),
    clienteId: num(f.cliente_id),
    numeroCliente: f.numero_cliente === null ? null : num(f.numero_cliente),
    clienteNombre: texto(f.cliente_nombre),
    clienteTelefono: texto(f.cliente_telefono),
    presentacionId: num(f.presentacion_id),
    ml: f.ml === null ? null : num(f.ml),
    perfumeId: f.perfume_id === null ? null : num(f.perfume_id),
    perfume: texto(f.perfume),
    marca: texto(f.marca),
    imagenUrl: texto(f.imagen_url),
    historial: (f.historial as PedidoAdmin["historial"] | null) ?? [],
  };
}

export class RepositorioVentasSupabase implements RepositorioVentas {
  async listarClientes(): Promise<ClienteAdmin[]> {
    const filas = revisar(await supabase().rpc("clientes_admin")) as Record<string, unknown>[];
    return filas.map((f) => ({
      id: num(f.id),
      numeroCliente: num(f.numero_cliente),
      nombre: String(f.nombre),
      telefono: texto(f.telefono),
      direccion: texto(f.direccion),
      ciudad: texto(f.ciudad),
      canal: texto(f.canal),
      correo: texto(f.correo),
      rol: f.rol as Rol,
      conCuenta: Boolean(f.con_cuenta),
      creadoEn: String(f.creado_en),
      pedidos: num(f.pedidos),
      pedidosActivos: num(f.pedidos_activos),
      totalEntregado: num(f.total_entregado),
    }));
  }

  async guardarCliente(c: ClienteEditable): Promise<number> {
    const datos = {
      nombre: c.nombre,
      telefono: c.telefono || null,
      direccion: c.direccion || null,
      ciudad: c.ciudad || null,
      canal_id: c.canalId,
    };
    const db = supabase().from("cliente");
    const r = c.id ? await db.update(datos).eq("id", c.id).select("id").single() : await db.insert(datos).select("id").single();
    return num((revisar(r) as { id: number }).id);
  }

  async canales(): Promise<{ id: number; nombre: string }[]> {
    return revisar(await supabase().from("canal_origen").select("id, nombre").order("id"));
  }

  async listarPedidos(): Promise<PedidoAdmin[]> {
    const filas = revisar(
      await supabase().from("pedido_detalle").select("*").order("creado_en", { ascending: false }),
    ) as Record<string, unknown>[];
    return filas.map(aPedido);
  }

  async crearPedido(p: NuevoPedido): Promise<number> {
    const r = await supabase()
      .from("pedido")
      .insert({
        cliente_id: p.clienteId,
        presentacion_id: p.presentacionId,
        precio_pactado: p.precioPactado,
        anticipo: p.anticipo,
        ciudad_entrega: p.ciudadEntrega || null,
        notas: p.notas || null,
        // si ya trae anticipo, nace apartado
        estado: p.anticipo > 0 ? "apartado" : "consultado",
      })
      .select("id")
      .single();
    const id = num((revisar(r) as { id: number }).id);
    if (p.notaInterna.trim()) await this.guardarNotaInterna(id, p.notaInterna);
    return id;
  }

  async actualizarPedido(id: number, c: CambiosDePedido): Promise<void> {
    const datos: Record<string, unknown> = {};
    if (c.estado !== undefined) datos.estado = c.estado;
    if (c.anticipo !== undefined) datos.anticipo = c.anticipo;
    if (c.precioPactado !== undefined) datos.precio_pactado = c.precioPactado;
    if (c.ciudadEntrega !== undefined) datos.ciudad_entrega = c.ciudadEntrega;
    if (c.notas !== undefined) datos.notas = c.notas;
    const r = await supabase().from("pedido").update(datos).eq("id", id).select("id");
    if ((revisar(r) as unknown[]).length === 0) throw traducirError({ code: "42501" });
  }

  async guardarNotaInterna(pedidoId: number, nota: string | null): Promise<void> {
    const tabla = supabase().from("pedido_nota_interna");
    const r = nota?.trim()
      ? await tabla.upsert({ pedido_id: pedidoId, nota: nota.trim(), actualizado_en: new Date().toISOString() })
      : await tabla.delete().eq("pedido_id", pedidoId);
    revisar(r);
  }

  async guardarCostoReal(pedidoId: number, costo: number | null): Promise<void> {
    const tabla = supabase().from("pedido_costo");
    const r =
      costo === null
        ? await tabla.delete().eq("pedido_id", pedidoId)
        : await tabla.upsert({ pedido_id: pedidoId, costo, origen: "manual", actualizado_en: new Date().toISOString() });
    revisar(r);
  }
}
