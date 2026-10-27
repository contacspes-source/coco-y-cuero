import { describe, expect, test } from "vitest";
import type { PerfumePublico } from "../compartido/tipos";
import {
  conPerfume,
  descripcionDe,
  leerPerfumeAbierto,
  mensajeWhatsAppTamano,
  notasPorFamilia,
  similares,
} from "../sitio/negocio/catalogo";
import {
  DIRECCION_VACIA,
  ErrorDeValidacion,
  ServicioCuenta,
  componerDireccion,
  etapasDe,
  normalizarTelefono,
  pedidosActivos,
  precioConBienvenida,
  primerNombre,
  sePuedeCancelar,
  separarDireccion,
  validarDireccion,
  validarRegistro,
  type DatosDeRegistro,
  type Direccion,
  type FormularioRegistro,
  type PedidoPropio,
} from "../sitio/negocio/cuenta";
import { OTRA_CIUDAD } from "../sitio/negocio/tienda";

// ------------------------------------------------------------------
// Detalle del perfume
// ------------------------------------------------------------------
const nota = (n: string, familia: string | null) => ({ nota: n, familia });
function p(x: Partial<PerfumePublico> & { id: number }): PerfumePublico {
  return {
    marca: "Lattafa",
    nombre: `Perfume ${x.id}`,
    tipo: "EDP",
    genero: "caballero",
    categoria: "arabes",
    imagenUrl: null,
    descripcion: null,
    presentaciones: [{ id: x.id * 10, ml: 100, precio: 1000 }],
    notas: [],
    ...x,
  };
}

describe("detalle del perfume", () => {
  test("usa la descripción escrita en el panel", () => {
    expect(descripcionDe(p({ id: 1, descripcion: "Mi texto." }))).toBe("Mi texto.");
  });

  test("si no hay, arma una frase con datos reales", () => {
    const d = descripcionDe(p({ id: 1, notas: [nota("vainilla", "Dulce y gourmand"), nota("ámbar", "Ámbar y cuero"), nota("cacao", null)] }));
    expect(d).toBe("Eau de Parfum árabe para caballero de Lattafa, con notas de vainilla, ámbar y cacao.");
  });

  test("sin notas no inventa ninguna", () => {
    expect(descripcionDe(p({ id: 1, tipo: "EDT", categoria: "disenador", genero: "dama", marca: "Versace" }))).toBe(
      "Eau de Toilette de diseñador para dama de Versace.",
    );
  });

  test("notas agrupadas en el orden de las familias", () => {
    const g = notasPorFamilia(p({ id: 1, notas: [nota("cítrico", "Fresco y cítrico"), nota("ámbar", "Ámbar y cuero"), nota("tabaco", "Ámbar y cuero")] }));
    expect(g.map((x) => [x.clave, x.notas])).toEqual([
      ["cuero", ["ámbar", "tabaco"]],
      ["fresco", ["cítrico"]],
    ]);
  });

  test("similares: mismo género o unisex, familias en común, nunca él mismo", () => {
    const base = p({ id: 1, notas: [nota("vainilla", "Dulce y gourmand")] });
    const lista = [
      base,
      p({ id: 2, notas: [nota("caramelo", "Dulce y gourmand")] }),
      p({ id: 3, genero: "dama", notas: [nota("vainilla", "Dulce y gourmand")] }),
      p({ id: 4, genero: "unisex", notas: [nota("vainilla", "Dulce y gourmand")] }),
      p({ id: 5, notas: [nota("madera", "Amaderado")] }),
    ];
    expect(similares(base, lista).map((x) => x.id)).toEqual([2, 4]);
  });

  test("mensaje con el tamaño elegido", () => {
    expect(mensajeWhatsAppTamano(p({ id: 1, nombre: "Asad" }), 50)).toBe("Hola, me interesa Asad de Lattafa en 50 ml. ¿Lo tienen disponible?");
  });

  test("?perfume=12 en la URL, conservando los filtros", () => {
    expect(leerPerfumeAbierto("?genero=dama&perfume=12")).toBe(12);
    expect(leerPerfumeAbierto("?perfume=abc")).toBeNull();
    expect(conPerfume("?genero=dama", 12)).toBe("?genero=dama&perfume=12");
    expect(conPerfume("?genero=dama&perfume=12", null)).toBe("?genero=dama");
    expect(conPerfume("?perfume=12", null)).toBe("");
  });
});

// ------------------------------------------------------------------
// Cuenta del cliente
// ------------------------------------------------------------------
const registro = (d: Partial<FormularioRegistro> = {}): FormularioRegistro => ({
  nombre: "Ana Martínez",
  telefono: "33 1234 5678",
  correo: "ana@correo.mx",
  contrasena: "perfume2026",
  ciudad: "Zamora",
  direccion: { ...DIRECCION_VACIA },
  canal: "Instagram",
  aceptaTerminos: true,
  ...d,
});
const campos = (d: FormularioRegistro) => validarRegistro(d).map((x) => x.campo);
const puebla: Direccion = {
  calle: "Av. Juárez 120 int. 3",
  colonia: "Centro",
  cp: "72000",
  municipio: "Puebla",
  estado: "Puebla",
  referencias: "Portón negro",
};

describe("registro", () => {
  test("datos completos", () => expect(campos(registro())).toEqual([]));
  test("todo vacío señala cada campo", () =>
    expect(campos(registro({ nombre: "", telefono: "", correo: "", contrasena: "", ciudad: "" }))).toEqual([
      "nombre",
      "telefono",
      "correo",
      "contrasena",
      "ciudad",
    ]));
  test("sin aceptar términos no se crea", () => expect(campos(registro({ aceptaTerminos: false }))).toEqual(["terminos"]));
  test("en las tres ciudades no se pide dirección", () => expect(campos(registro({ ciudad: "Morelia" }))).toEqual([]));
  test("envío a otra ciudad exige dirección completa", () =>
    expect(campos(registro({ ciudad: OTRA_CIUDAD }))).toEqual(["calle", "colonia", "cp", "municipio", "estado"]));
  test("envío con dirección completa", () => expect(campos(registro({ ciudad: OTRA_CIUDAD, direccion: puebla }))).toEqual([]));
  test("código postal de 4 dígitos", () => expect(validarDireccion({ ...puebla, cp: "7200" }).map((x) => x.campo)).toEqual(["cp"]));
  test("contraseña solo con letras", () => expect(campos(registro({ contrasena: "perfumesss" }))).toEqual(["contrasena"]));
  test("correo sin dominio", () => expect(campos(registro({ correo: "ana@correo" }))).toEqual(["correo"]));
  test.each([
    ["+52 1 33 1234 5678", "3312345678"],
    ["3312345678", "3312345678"],
    ["331234", null],
  ])("teléfono %s", (t, e) => expect(normalizarTelefono(t)).toBe(e));
});

describe("dirección de envío", () => {
  test("se compone legible", () =>
    expect(componerDireccion(puebla)).toBe("Av. Juárez 120 int. 3 · Col. Centro · C.P. 72000 · Puebla, Puebla · Ref. Portón negro"));
  test("ida y vuelta para editarla", () => expect(separarDireccion(componerDireccion(puebla))).toEqual(puebla));
  test("sin referencias", () => {
    const d = { ...puebla, referencias: "" };
    expect(separarDireccion(componerDireccion(d))).toEqual(d);
  });
  test("municipio con coma", () => {
    const d = { ...puebla, municipio: "San Pedro, Cholula" };
    expect(separarDireccion(componerDireccion(d))).toEqual(d);
  });
  test("texto viejo libre cae en calle", () =>
    expect(separarDireccion("Hidalgo 45, Zamora")).toEqual({ ...DIRECCION_VACIA, calle: "Hidalgo 45, Zamora" }));
  test("un punto medio escrito por el cliente no rompe el formato", () => {
    const d = { ...puebla, calle: "Calle 5 · Lote 2" };
    expect(separarDireccion(componerDireccion(d)).calle).toBe("Calle 5 - Lote 2");
  });
});

describe("bienvenida y saludo", () => {
  test.each([
    [1310, 1180],
    [2090, 1880],
    [999, 900],
  ])("10 %% de %d redondeado a decenas = %d", (p, e) => expect(precioConBienvenida(p)).toBe(e));
  test("primer nombre", () => expect(primerNombre("  jorge Duarte López ")).toBe("jorge"));
  test("sin nombre usa el correo", () => expect(primerNombre(null, "ana.m@correo.mx")).toBe("ana.m"));
  test("nombre larguísimo se recorta", () => expect(primerNombre("Maximilianoooooo")).toBe("Maximilianooo…"));
});

describe("estado de mis pedidos", () => {
  const ped = (x: Partial<PedidoPropio>): PedidoPropio => ({
    id: 1,
    estado: "consultado",
    precioPactado: 1000,
    descuento: 0,
    direccionEnvio: null,
    anticipo: 0,
    saldo: 1000,
    ciudadEntrega: null,
    notas: null,
    creadoEn: "2026-10-20T00:00:00Z",
    ml: 100,
    perfume: "Asad",
    marca: "Lattafa",
    imagenUrl: null,
    historial: [],
    ...x,
  });

  test("línea de tiempo con fechas", () => {
    const e = etapasDe(
      ped({
        estado: "apartado",
        historial: [
          { estado: "consultado", fecha: "2026-10-20" },
          { estado: "apartado", fecha: "2026-10-21" },
        ],
      }),
    );
    expect(e.map((x) => [x.estado, x.hecha, x.actual, x.fecha])).toEqual([
      ["consultado", true, false, "2026-10-20"],
      ["apartado", true, true, "2026-10-21"],
      ["comprado", false, false, null],
      ["entregado", false, false, null],
    ]);
  });

  test("solo se cancela lo que aún no se aparta", () => {
    expect(sePuedeCancelar(ped({ estado: "consultado" }))).toBe(true);
    expect(sePuedeCancelar(ped({ estado: "apartado" }))).toBe(false);
  });

  test("activos", () =>
    expect(pedidosActivos([ped({ estado: "consultado" }), ped({ estado: "entregado" }), ped({ estado: "comprado" })])).toBe(2));
});

describe("ServicioCuenta", () => {
  const llamadas: unknown[][] = [];
  const repo = {
    sesionActual: async () => null,
    descuentoBienvenida: async () => 0.1,
    actualizarNombreDeSesion: async () => {},
    registrar: async (d: DatosDeRegistro) => (llamadas.push(["registrar", d]), { requiereConfirmacion: true }),
    entrar: async () => {},
    salir: async () => {},
    recuperar: async () => {},
    cambiarContrasena: async () => {},
    alCambiar: async () => {},
    canales: async () => [],
    perfil: async () => null,
    guardarPerfil: async () => {},
    misPedidos: async () => [],
    solicitar: async (...a: unknown[]) => (llamadas.push(["solicitar", ...a]), 7),
    cancelar: async () => {},
  };
  const s = new ServicioCuenta(repo);

  test("un registro inválido no llega al servidor", async () => {
    await expect(s.registrar(registro({ telefono: "123" }), "/")).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(llamadas).toEqual([]);
  });

  test("el registro viaja limpio", async () => {
    await s.registrar(registro({ correo: " Ana@Correo.MX ", telefono: "+52 33 1234 5678", nombre: " Ana   Martínez " }), "/");
    expect(llamadas.at(-1)![1]).toMatchObject({ correo: "ana@correo.mx", telefono: "3312345678", nombre: "Ana Martínez" });
  });

  test("apartar sin id de presentación (respaldo viejo) pide WhatsApp", async () => {
    await expect(s.apartar(null, null, "")).rejects.toThrow(/WhatsApp/);
  });

  test("apartar manda notas vacías como null", async () => {
    expect(await s.apartar(10, "Zamora", "   ")).toBe(7);
    expect(llamadas.at(-1)).toEqual(["solicitar", 10, "Zamora", null, null]);
  });

  test("envío a otra ciudad sin dirección no llega al servidor", async () => {
    const antes = llamadas.length;
    await expect(s.apartar(10, OTRA_CIUDAD, "")).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(llamadas.length).toBe(antes);
  });

  test("envío manda la dirección compuesta", async () => {
    await s.apartar(10, OTRA_CIUDAD, "", puebla);
    expect(llamadas.at(-1)).toEqual(["solicitar", 10, OTRA_CIUDAD, null, componerDireccion(puebla)]);
  });

  test("el registro local no manda dirección y el de envío sí", async () => {
    await s.registrar(registro({ direccion: puebla }), "/");
    expect((llamadas.at(-1)![1] as DatosDeRegistro).direccion).toBe("");
    await s.registrar(registro({ ciudad: OTRA_CIUDAD, direccion: puebla }), "/");
    expect((llamadas.at(-1)![1] as DatosDeRegistro).direccion).toBe(componerDireccion(puebla));
  });
});
