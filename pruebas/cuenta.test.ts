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
  ErrorDeValidacion,
  ServicioCuenta,
  etapasDe,
  normalizarTelefono,
  pedidosActivos,
  sePuedeCancelar,
  validarRegistro,
  type DatosDeRegistro,
  type PedidoPropio,
} from "../sitio/negocio/cuenta";

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
const registro = (d: Partial<DatosDeRegistro> = {}): DatosDeRegistro => ({
  nombre: "Ana Martínez",
  telefono: "33 1234 5678",
  correo: "ana@correo.mx",
  contrasena: "perfume2026",
  ciudad: "Zamora",
  direccion: "",
  canal: "Instagram",
  ...d,
});
const campos = (d: DatosDeRegistro) => validarRegistro(d).map((x) => x.campo);

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
  test("contraseña solo con letras", () => expect(campos(registro({ contrasena: "perfumesss" }))).toEqual(["contrasena"]));
  test("correo sin dominio", () => expect(campos(registro({ correo: "ana@correo" }))).toEqual(["correo"]));
  test.each([
    ["+52 1 33 1234 5678", "3312345678"],
    ["3312345678", "3312345678"],
    ["331234", null],
  ])("teléfono %s", (t, e) => expect(normalizarTelefono(t)).toBe(e));
});

describe("estado de mis pedidos", () => {
  const ped = (x: Partial<PedidoPropio>): PedidoPropio => ({
    id: 1,
    estado: "consultado",
    precioPactado: 1000,
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
    correoActual: async () => null,
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
    expect(llamadas.at(-1)).toEqual(["solicitar", 10, "Zamora", null]);
  });
});
