import { describe, expect, test } from "vitest";
import type { CambiosDePedido, ClienteAdmin, ClienteEditable, NuevoPedido, PedidoAdmin } from "../compartido/tipos";
import type { RepositorioVentas } from "../panel/datos/contratos";
import { ErrorDeValidacion } from "../panel/negocio/errores";
import {
  ServicioVentas,
  advertenciaAlAvanzar,
  anticipoSugerido,
  enlaceWhatsApp,
  filtrarClientes,
  filtrarPedidos,
  mensajeParaCliente,
  normalizarTelefono,
  resumirPedidos,
  siguienteEstado,
  transicionesDe,
  validarCliente,
  validarNuevoPedido,
} from "../panel/negocio/ventas";

function pedido(p: Partial<PedidoAdmin> & { id: number }): PedidoAdmin {
  return {
    estado: "consultado",
    precioPactado: 1000,
    descuento: 0,
    anticipo: 0,
    saldo: 1000,
    ciudadEntrega: "Zamora",
    direccionEnvio: null,
    notas: null,
    notaInterna: null,
    creadoEn: "2026-10-20T10:00:00Z",
    actualizadoEn: "2026-10-20T10:00:00Z",
    clienteId: 1,
    numeroCliente: 1011,
    clienteNombre: "Ana Martínez",
    clienteTelefono: "3312345678",
    presentacionId: 10,
    ml: 100,
    perfumeId: 1,
    perfume: "Asad",
    marca: "Lattafa",
    imagenUrl: null,
    historial: [],
    ...p,
  };
}

function cliente(c: Partial<ClienteAdmin> & { id: number }): ClienteAdmin {
  return {
    numeroCliente: 1000 + c.id,
    nombre: `Cliente ${c.id}`,
    telefono: null,
    direccion: null,
    ciudad: null,
    canal: null,
    correo: null,
    rol: "cliente",
    conCuenta: false,
    creadoEn: "2026-10-01T00:00:00Z",
    pedidos: 0,
    pedidosActivos: 0,
    totalEntregado: 0,
    ...c,
  };
}

describe("estados del pedido (los mismos que valida la base)", () => {
  test("avance en orden", () => {
    expect(siguienteEstado("consultado")).toBe("apartado");
    expect(siguienteEstado("apartado")).toBe("comprado");
    expect(siguienteEstado("comprado")).toBe("entregado");
    expect(siguienteEstado("entregado")).toBeNull();
  });
  test("se puede cancelar mientras esté en curso", () => {
    expect(transicionesDe("consultado")).toEqual(["apartado", "cancelado"]);
    expect(transicionesDe("comprado")).toEqual(["entregado", "cancelado"]);
  });
  test("entregado y cancelado ya no cambian", () => {
    expect(transicionesDe("entregado")).toEqual([]);
    expect(transicionesDe("cancelado")).toEqual([]);
  });
  test("aviso al apartar sin anticipo y al entregar con saldo", () => {
    expect(advertenciaAlAvanzar({ anticipo: 0, saldo: 1000 }, "apartado")).toContain("anticipo");
    expect(advertenciaAlAvanzar({ anticipo: 500, saldo: 500 }, "apartado")).toBeNull();
    expect(advertenciaAlAvanzar({ anticipo: 500, saldo: 500 }, "entregado")).toContain("$500");
    expect(advertenciaAlAvanzar({ anticipo: 1000, saldo: 0 }, "entregado")).toBeNull();
  });
});

describe("anticipo y mensajes", () => {
  test("anticipo sugerido: mitad, en decenas", () => {
    expect(anticipoSugerido(1050)).toBe(530);
    expect(anticipoSugerido(1000)).toBe(500);
  });

  test("cada estado tiene su mensaje con datos reales", () => {
    const m = mensajeParaCliente(pedido({ id: 7 }));
    expect(m).toContain("Hola Ana");
    expect(m).toContain("#7");
    expect(m).toContain("Lattafa Asad de 100 ml");
    expect(m).toContain("$500");
    expect(mensajeParaCliente(pedido({ id: 7, estado: "comprado", saldo: 400 }))).toContain("$400");
    expect(mensajeParaCliente(pedido({ id: 7, estado: "entregado" }))).toContain("gracias");
  });

  test("enlace de WhatsApp con lada de México", () => {
    expect(enlaceWhatsApp("3312345678", "hola")).toBe("https://wa.me/523312345678?text=hola");
    expect(enlaceWhatsApp(null, "hola")).toBeNull();
  });
});

describe("validación", () => {
  const nuevo = (n: Partial<NuevoPedido> = {}): NuevoPedido => ({
    clienteId: 1,
    presentacionId: 10,
    precioPactado: 1000,
    anticipo: 0,
    ciudadEntrega: "",
    notas: "",
    notaInterna: "",
    ...n,
  });
  const campos = (n: NuevoPedido) => validarNuevoPedido(n).map((p) => p.campo);

  test("pedido completo", () => expect(campos(nuevo())).toEqual([]));
  test("falta cliente y perfume", () => expect(campos(nuevo({ clienteId: null, presentacionId: null }))).toEqual(["cliente", "presentacion"]));
  test("anticipo mayor que precio", () => expect(campos(nuevo({ anticipo: 1200 }))).toEqual(["anticipo"]));
  test("precio cero", () => expect(campos(nuevo({ precioPactado: 0 }))).toEqual(["precio"]));

  const cli = (c: Partial<ClienteEditable> = {}): ClienteEditable => ({ nombre: "Ana", telefono: "", direccion: "", ciudad: "", canalId: null, ...c });
  test("cliente sin teléfono es válido (llegó en persona)", () => expect(validarCliente(cli())).toEqual([]));
  test("teléfono incompleto", () => expect(validarCliente(cli({ telefono: "33 12" })).map((p) => p.campo)).toEqual(["telefono"]));
  test.each([
    ["+52 1 33 1234 5678", "3312345678"],
    ["(33) 1234-5678", "3312345678"],
    ["12345", null],
  ])("normaliza %s", (entrada, esperado) => expect(normalizarTelefono(entrada)).toBe(esperado));
});

describe("listas", () => {
  const lista = [
    pedido({ id: 1, estado: "consultado" }),
    pedido({ id: 2, estado: "apartado", anticipo: 500, saldo: 500, clienteNombre: "Beto Ruiz" }),
    pedido({ id: 3, estado: "comprado", anticipo: 300, saldo: 700 }),
    pedido({ id: 4, estado: "entregado", anticipo: 1000, saldo: 0 }),
    pedido({ id: 5, estado: "cancelado" }),
  ];

  test("en curso = los que no han terminado", () =>
    expect(filtrarPedidos(lista, "activos", "").map((p) => p.id)).toEqual([1, 2, 3]));
  test("por estado", () => expect(filtrarPedidos(lista, "entregado", "").map((p) => p.id)).toEqual([4]));
  test("búsqueda por cliente sin acentos", () => expect(filtrarPedidos(lista, "todos", "beto").map((p) => p.id)).toEqual([2]));
  test("búsqueda por número de pedido", () => expect(filtrarPedidos(lista, "todos", "#3").map((p) => p.id)).toEqual([3]));

  test("resumen: por cobrar no cuenta solicitudes sin confirmar", () => {
    const r = resumirPedidos(lista);
    expect(r).toMatchObject({ solicitados: 1, apartados: 1, comprados: 1, porCobrar: 1200, anticiposEnCurso: 800 });
    expect(r.conteo.cancelado).toBe(1);
  });

  test("clientes por nombre, número o teléfono", () => {
    const cs = [cliente({ id: 1, nombre: "José Pérez", telefono: "4431112233" }), cliente({ id: 2, nombre: "Ana" })];
    expect(filtrarClientes(cs, "jose").map((c) => c.id)).toEqual([1]);
    expect(filtrarClientes(cs, "1002").map((c) => c.id)).toEqual([2]);
    expect(filtrarClientes(cs, "443111").map((c) => c.id)).toEqual([1]);
  });
});

describe("ServicioVentas", () => {
  class Falso implements RepositorioVentas {
    cambios: [number, CambiosDePedido][] = [];
    notas: [number, string | null][] = [];
    creados: NuevoPedido[] = [];
    clientes: ClienteEditable[] = [];
    async listarClientes() { return []; }
    async guardarCliente(c: ClienteEditable) { this.clientes.push(c); return 9; }
    async canales() { return []; }
    async listarPedidos() { return []; }
    async crearPedido(p: NuevoPedido) { this.creados.push(p); return 1; }
    async actualizarPedido(id: number, c: CambiosDePedido) { this.cambios.push([id, c]); }
    async guardarNotaInterna(id: number, n: string | null) { this.notas.push([id, n]); }
  }

  test("no deja saltarse estados", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await expect(s.cambiarEstado(pedido({ id: 1 }), "entregado")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await s.cambiarEstado(pedido({ id: 1 }), "apartado");
    expect(repo.cambios).toEqual([[1, { estado: "apartado" }]]);
  });

  test("la nota interna solo se guarda si cambió", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await s.guardarCambios(pedido({ id: 2, notaInterna: "hola" }), { notas: null }, "hola");
    await s.guardarCambios(pedido({ id: 2, notaInterna: "hola" }), { notas: null }, "adiós");
    expect(repo.notas).toEqual([[2, "adiós"]]);
  });

  test("anticipo mayor que el precio no llega a la base", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await expect(s.guardarCambios(pedido({ id: 3 }), { anticipo: 5000 })).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(repo.cambios).toEqual([]);
  });

  test("el teléfono del cliente se guarda normalizado", async () => {
    const repo = new Falso();
    await new ServicioVentas(repo).guardarCliente({ nombre: " Ana   Martínez ", telefono: "+52 33 1234 5678", direccion: "", ciudad: "", canalId: null });
    expect(repo.clientes[0]).toMatchObject({ nombre: "Ana Martínez", telefono: "3312345678" });
  });
});
