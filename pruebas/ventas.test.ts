import { describe, expect, test } from "vitest";
import type { CambiosDePedido, ClienteAdmin, ClienteEditable, NuevoPedido, PedidoAdmin } from "../compartido/tipos";
import type { RepositorioVentas } from "../panel/datos/contratos";
import { ErrorDeValidacion } from "../panel/negocio/errores";
import {
  duplicadosPorTelefono,
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
  gananciaDe,
  descuentoBienvenida,
  esPrimeraCompra,
  pagoInicialDe,
  validarCambios,
  validarPago,
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
    costoReal: null,
    costoOrigen: null,
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
    pagos: [],
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
    canalDetalle: null,
    correo: null,
    rol: "cliente",
    conCuenta: false,
    activo: true,
    bajaEn: null,
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
    precioLista: 1000,
    descuento: 0,
    pagoInicial: "nada",
    anticipo: Number.NaN,
    formaPago: null,
    ciudadEntrega: "",
    notas: "",
    notaInterna: "",
    ...n,
  });
  const campos = (n: NuevoPedido) => validarNuevoPedido(n).map((p) => p.campo);

  test("pedido completo", () => expect(campos(nuevo())).toEqual([]));
  test("falta cliente y perfume", () => expect(campos(nuevo({ clienteId: null, presentacionId: null }))).toEqual(["cliente", "presentacion"]));
  test("anticipo igual o mayor que el precio final: que elija pagó completo", () =>
    expect(campos(nuevo({ pagoInicial: "anticipo", anticipo: 900, descuento: 100, formaPago: "efectivo" }))).toEqual(["anticipo"]));
  test("anticipo sin monto", () => expect(campos(nuevo({ pagoInicial: "anticipo", formaPago: "efectivo" }))).toEqual(["anticipo"]));
  test("con pago hay que decir cómo pagó", () => expect(campos(nuevo({ pagoInicial: "completo" }))).toEqual(["forma"]));
  test("precio cero", () => expect(campos(nuevo({ precioLista: 0 }))).toEqual(["precio"]));
  test("descuento del tamaño del precio", () => expect(campos(nuevo({ descuento: 1000 }))).toEqual(["descuento"]));
  test("lo que se cobra al registrar", () => {
    expect(pagoInicialDe(nuevo({ descuento: 100 }))).toBe(0);
    expect(pagoInicialDe(nuevo({ pagoInicial: "anticipo", anticipo: 300 }))).toBe(300);
    expect(pagoInicialDe(nuevo({ pagoInicial: "completo", descuento: 100 }))).toBe(900);
    expect(pagoInicialDe(nuevo({ pagoInicial: "venta-directa", descuento: 100, anticipo: 5 }))).toBe(900);
  });

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
    bajas: number[] = [];
    async darDeBajaCliente(id: number) { this.bajas.push(id); }
    async reactivarCliente(id: number) { this.bajas = this.bajas.filter((x) => x !== id); }
    async listarPedidos() { return []; }
    async crearPedido(p: NuevoPedido) { this.creados.push(p); return 1; }
    pagos: [number, number, string, string][] = [];
    async registrarPago(id: number, monto: number, forma: string, nota: string) { this.pagos.push([id, monto, forma, nota]); }
    async eliminarPago() {}
    async actualizarPedido(id: number, c: CambiosDePedido) { this.cambios.push([id, c]); }
    async guardarNotaInterna(id: number, n: string | null) { this.notas.push([id, n]); }
    costos: [number, number | null][] = [];
    async guardarCostoReal(id: number, c: number | null) { this.costos.push([id, c]); }
  }

  test("costo real: se guarda, se borra con vacío y no se repite si no cambió", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await s.guardarCostoReal(pedido({ id: 4, precioPactado: 1300 }), " 690 ");
    await s.guardarCostoReal(pedido({ id: 4, precioPactado: 1300, costoReal: 690 }), "690");
    await s.guardarCostoReal(pedido({ id: 4, precioPactado: 1300, costoReal: 690 }), "");
    expect(repo.costos).toEqual([[4, 690], [4, null]]);
  });

  test("costo real inválido no llega a la base", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await expect(s.guardarCostoReal(pedido({ id: 5 }), "-5")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await expect(s.guardarCostoReal(pedido({ id: 5 }), "abc")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await expect(s.guardarCostoReal(pedido({ id: 5, precioPactado: 1000 }), "9000")).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(repo.costos).toEqual([]);
  });

  test("ganancia del pedido", () => {
    expect(gananciaDe(pedido({ id: 6, precioPactado: 1310, costoReal: 690 }))).toBe(620);
    expect(gananciaDe(pedido({ id: 6 }))).toBeNull();
  });

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

  test("el precio no baja de lo ya pagado", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    await expect(s.guardarCambios(pedido({ id: 3, anticipo: 800, saldo: 200 }), { precioPactado: 700, descuento: 300 })).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(repo.cambios).toEqual([]);
    await s.guardarCambios(pedido({ id: 3, anticipo: 500, saldo: 500 }), { precioPactado: 900, descuento: 100 });
    expect(repo.cambios).toEqual([[3, { precioPactado: 900, descuento: 100 }]]);
  });

  test("pagos: valida y 'pagó todo' cobra el saldo", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    const p = pedido({ id: 8, estado: "apartado", anticipo: 300, saldo: 700 });
    await expect(s.registrarPago(p, 800, "efectivo")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await expect(s.registrarPago(p, 100, null)).rejects.toBeInstanceOf(ErrorDeValidacion);
    await s.registrarPago(p, 200, "transferencia", "  ref 123 ");
    await s.liquidar(p, "efectivo");
    expect(repo.pagos).toEqual([[8, 200, "transferencia", "ref 123"], [8, 700, "efectivo", ""]]);
  });

  test("alta: manda el cobro calculado y sin forma si no pagó", async () => {
    const repo = new Falso();
    const s = new ServicioVentas(repo);
    const base: NuevoPedido = { clienteId: 1, presentacionId: 10, precioLista: 1000, descuento: 100, pagoInicial: "venta-directa", anticipo: Number.NaN, formaPago: "tarjeta", ciudadEntrega: " Zamora ", notas: "", notaInterna: "" };
    await s.crearPedido(base);
    await s.crearPedido({ ...base, pagoInicial: "nada" });
    expect(repo.creados.map((n) => [n.anticipo, n.formaPago, n.ciudadEntrega])).toEqual([[900, "tarjeta", "Zamora"], [0, null, "Zamora"]]);
  });

  test("el teléfono del cliente se guarda normalizado", async () => {
    const repo = new Falso();
    await new ServicioVentas(repo).guardarCliente({ nombre: " Ana   Martínez ", telefono: "+52 33 1234 5678", direccion: "", ciudad: "", canalId: null });
    expect(repo.clientes[0]).toMatchObject({ nombre: "Ana Martínez", telefono: "3312345678" });
  });
});

describe("descuento y pagos", () => {
  test("10 % de bienvenida redondeado a decenas, como en la página", () => {
    expect(descuentoBienvenida(1000)).toBe(100);
    expect(descuentoBienvenida(1290)).toBe(130); // 1161 → 1160
    expect(descuentoBienvenida(0)).toBe(0);
  });

  test("primera compra: no cuentan los cancelados ni el pedido que se edita", () => {
    const ps = [pedido({ id: 1, clienteId: 5, estado: "cancelado" }), pedido({ id: 2, clienteId: 5 })];
    expect(esPrimeraCompra(5, ps)).toBe(false);
    expect(esPrimeraCompra(5, ps, 2)).toBe(true);
    expect(esPrimeraCompra(6, ps)).toBe(true);
    expect(esPrimeraCompra(null, ps)).toBe(false);
  });

  test("validar pago", () => {
    const p = { estado: "apartado" as const, saldo: 500 };
    expect(validarPago(p, 500, "efectivo")).toEqual([]);
    expect(validarPago(p, 0, "efectivo").map((x) => x.campo)).toEqual(["monto"]);
    expect(validarPago({ estado: "cancelado", saldo: 500 }, 100, "efectivo").map((x) => x.campo)).toEqual(["monto"]);
  });

  test("descuento negativo", () =>
    expect(validarCambios({ precioPactado: 1000, anticipo: 0 }, { descuento: -5 }).map((x) => x.campo)).toEqual(["descuento"]));
});

describe("duplicados por WhatsApp", () => {
  test("marca a los que comparten número, sin importar el formato", () => {
    const d = duplicadosPorTelefono([
      { id: 1, numeroCliente: 101, telefono: "33 1234 5678", activo: true },
      { id: 2, numeroCliente: 102, telefono: "+52 3312345678", activo: true },
      { id: 3, numeroCliente: 103, telefono: "3399999999", activo: true },
      { id: 4, numeroCliente: 104, telefono: "3312345678", activo: false },
    ]);
    expect(d.get(1)).toEqual(["#102"]);
    expect(d.get(2)).toEqual(["#101"]);
    expect(d.has(3)).toBe(false);
    expect(d.has(4)).toBe(false); // los dados de baja no cuentan
  });
});
