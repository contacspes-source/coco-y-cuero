/**
 * Cuenta del cliente: registro, sesión, expediente y pedidos propios.
 * Lo que cada quien puede leer o escribir lo decide la base (RLS y las
 * funciones solicitar_pedido / cancelar_mi_pedido), no este archivo.
 */
import { ErrorDeDatos, traducirError } from "../../compartido/errores";
import { supabase } from "./supabase";

export interface DatosDeRegistro {
  correo: string;
  contrasena: string;
  nombre: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  canal: string;
}

export interface Perfil {
  numeroCliente: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  canalId: number | null;
  correo: string;
}

export interface SesionActual {
  correo: string;
  /** El nombre con que se registró (metadatos de la cuenta). */
  nombre: string | null;
}

export interface PedidoPropio {
  id: number;
  estado: string;
  precioPactado: number;
  descuento: number;
  direccionEnvio: string | null;
  anticipo: number;
  saldo: number;
  ciudadEntrega: string | null;
  notas: string | null;
  creadoEn: string;
  ml: number | null;
  perfume: string | null;
  marca: string | null;
  imagenUrl: string | null;
  historial: { estado: string; fecha: string }[];
}

export type EventoDeCuenta = "entro" | "salio" | "recuperar-contrasena";

function revisar<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw traducirError(r.error);
  return r.data as T;
}

export class RepositorioCuenta {
  async sesionActual(): Promise<SesionActual | null> {
    const db = await supabase();
    const { data } = await db.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const nombre = (u.user_metadata as { nombre?: unknown } | undefined)?.nombre;
    return { correo: u.email ?? "", nombre: typeof nombre === "string" ? nombre : null };
  }

  /** 0.1 si la cuenta aún no tiene compras (sin contar canceladas), 0 si ya tiene. */
  async descuentoBienvenida(): Promise<number> {
    const db = await supabase();
    return Number(revisar(await db.rpc("mi_descuento_bienvenida")) ?? 0);
  }

  async registrar(d: DatosDeRegistro, volverA: string): Promise<{ requiereConfirmacion: boolean }> {
    const db = await supabase();
    // los datos viajan como metadatos; el trigger de la base crea el
    // expediente y le asigna número de cliente (nunca el rol)
    const { data, error } = await db.auth.signUp({
      email: d.correo,
      password: d.contrasena,
      options: {
        emailRedirectTo: volverA,
        data: { nombre: d.nombre, telefono: d.telefono, direccion: d.direccion, ciudad: d.ciudad, canal: d.canal },
      },
    });
    if (error) {
      if (/already registered|already been registered/i.test(error.message)) {
        throw new ErrorDeDatos("duplicado", "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.");
      }
      if (/not authorized|email_address_not_authorized|rate limit/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
        throw new ErrorDeDatos("red", "No pudimos enviarte el correo de confirmación en este momento. Pide tu perfume por WhatsApp y te registramos nosotros.");
      }
      if (/password/i.test(error.message)) {
        throw new ErrorDeDatos("regla", "La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.");
      }
      throw traducirError(error);
    }
    return { requiereConfirmacion: !data.session };
  }

  async entrar(correo: string, contrasena: string): Promise<void> {
    const db = await supabase();
    const { error } = await db.auth.signInWithPassword({ email: correo, password: contrasena });
    if (error) throw traducirError(error);
  }

  async salir(): Promise<void> {
    const db = await supabase();
    await db.auth.signOut();
  }

  async recuperar(correo: string, volverA: string): Promise<void> {
    const db = await supabase();
    const { error } = await db.auth.resetPasswordForEmail(correo, { redirectTo: volverA });
    if (error) throw traducirError(error);
  }

  async cambiarContrasena(nueva: string): Promise<void> {
    const db = await supabase();
    const { error } = await db.auth.updateUser({ password: nueva });
    if (error) throw traducirError(error);
  }

  /** Mantiene el saludo de la cabecera al día cuando cambia su nombre. */
  async actualizarNombreDeSesion(nombre: string): Promise<void> {
    const db = await supabase();
    await db.auth.updateUser({ data: { nombre } });
  }

  async alCambiar(escucha: (e: EventoDeCuenta) => void): Promise<void> {
    const db = await supabase();
    db.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") escucha("recuperar-contrasena");
      else if (evento === "SIGNED_IN") escucha("entro");
      else if (evento === "SIGNED_OUT") escucha("salio");
    });
  }

  async canales(): Promise<{ id: number; nombre: string }[]> {
    const db = await supabase();
    return revisar(await db.from("canal_origen").select("id, nombre").order("id"));
  }

  async perfil(): Promise<Perfil | null> {
    const db = await supabase();
    const { data: sesion } = await db.auth.getSession();
    const usuario = sesion.session?.user;
    if (!usuario) return null;
    const fila = revisar(
      await db
        .from("cliente")
        .select("numero_cliente, nombre, telefono, direccion, ciudad, canal_id")
        .eq("auth_user_id", usuario.id)
        .maybeSingle(),
    ) as {
      numero_cliente: number;
      nombre: string;
      telefono: string | null;
      direccion: string | null;
      ciudad: string | null;
      canal_id: number | null;
    } | null;
    if (!fila) return null;
    return {
      numeroCliente: fila.numero_cliente,
      nombre: fila.nombre,
      telefono: fila.telefono,
      direccion: fila.direccion,
      ciudad: fila.ciudad,
      canalId: fila.canal_id,
      correo: usuario.email ?? "",
    };
  }

  async guardarPerfil(p: Pick<Perfil, "nombre" | "telefono" | "direccion" | "ciudad" | "canalId">): Promise<void> {
    const db = await supabase();
    const { data: sesion } = await db.auth.getSession();
    const id = sesion.session?.user.id;
    if (!id) throw new ErrorDeDatos("permiso", "Tu sesión terminó. Vuelve a entrar.");
    const r = await db
      .from("cliente")
      .update({ nombre: p.nombre, telefono: p.telefono, direccion: p.direccion, ciudad: p.ciudad, canal_id: p.canalId })
      .eq("auth_user_id", id)
      .select("id");
    if ((revisar(r) as unknown[]).length === 0) throw new ErrorDeDatos("permiso", "No se pudo guardar. Vuelve a entrar.");
  }

  async misPedidos(): Promise<PedidoPropio[]> {
    const db = await supabase();
    const filas = revisar(
      await db
        .from("pedido_detalle")
        .select("id, estado, precio_pactado, descuento, direccion_envio, anticipo, saldo, ciudad_entrega, notas, creado_en, ml, perfume, marca, imagen_url, historial")
        .order("creado_en", { ascending: false }),
    ) as Record<string, unknown>[];
    return filas.map((f) => ({
      id: Number(f.id),
      estado: String(f.estado),
      precioPactado: Number(f.precio_pactado),
      descuento: Number(f.descuento ?? 0),
      direccionEnvio: (f.direccion_envio as string | null) ?? null,
      anticipo: Number(f.anticipo),
      saldo: Number(f.saldo),
      ciudadEntrega: (f.ciudad_entrega as string | null) ?? null,
      notas: (f.notas as string | null) ?? null,
      creadoEn: String(f.creado_en),
      ml: f.ml === null ? null : Number(f.ml),
      perfume: (f.perfume as string | null) ?? null,
      marca: (f.marca as string | null) ?? null,
      imagenUrl: (f.imagen_url as string | null) ?? null,
      historial: (f.historial as { estado: string; fecha: string }[] | null) ?? [],
    }));
  }

  async solicitar(presentacionId: number, ciudad: string | null, notas: string | null, direccion: string | null): Promise<number> {
    const db = await supabase();
    const r = await db.rpc("solicitar_pedido", {
      p_presentacion_id: presentacionId,
      p_ciudad_entrega: ciudad,
      p_notas: notas,
      p_direccion: direccion,
    });
    return Number(revisar(r));
  }

  async cancelar(pedidoId: number): Promise<void> {
    const db = await supabase();
    revisar(await db.rpc("cancelar_mi_pedido", { p_pedido_id: pedidoId }));
  }
}
