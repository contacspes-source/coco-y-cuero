import { describe, expect, test } from "vitest";
import type { CambioDePrecio, PerfumeEditable, Rol, Usuario } from "../compartido/tipos";
import type { RepositorioCatalogo, RepositorioFotos, RepositorioSesion } from "../panel/datos/contratos";
import { ErrorDeAcceso, ErrorDeValidacion } from "../panel/negocio/errores";
import { ServicioCatalogo, ServicioSesion } from "../panel/negocio/servicios";
import { aEditable, planearAjuste } from "../panel/negocio/catalogo";
import { CATALOGOS, perfume } from "./fabrica";

// Repositorios falsos: guardan en memoria lo que se les pide.
class CatalogoFalso implements RepositorioCatalogo {
  guardados: PerfumeEditable[] = [];
  publicados: [number, boolean][] = [];
  precios: CambioDePrecio[][] = [];
  async cargarCatalogos() { return CATALOGOS; }
  async listarPerfumes() { return [perfume({ id: 1 })]; }
  async guardarPerfume(d: PerfumeEditable) { this.guardados.push(d); return d.id ?? 99; }
  async cambiarPublicado(id: number, v: boolean) { this.publicados.push([id, v]); }
  fotos: [number, string][] = [];
  async cambiarFoto(id: number, url: string) { this.fotos.push([id, url]); }
  async actualizarPrecios(c: CambioDePrecio[]) { this.precios.push(c); return c.length; }
}

class FotosFalsas implements RepositorioFotos {
  rutas: string[] = [];
  async subir(_: Blob, ruta: string) { this.rutas.push(ruta); return `https://cdn.mx/${ruta}`; }
}

class SesionFalsa implements RepositorioSesion {
  usuario: Usuario | null = null;
  rol: Rol | null = "admin";
  cerrada = 0;
  contrasena = "";
  async usuarioActual() { return this.usuario; }
  async rolDe() { return this.rol; }
  async iniciarSesion(correo: string) { this.usuario = { id: "u1", correo }; return this.usuario; }
  async cerrarSesion() { this.cerrada++; this.usuario = null; }
  async enviarCorreoDeRecuperacion() {}
  async cambiarContrasena(n: string) { this.contrasena = n; }
  alCambiar() {}
}

describe("ServicioCatalogo", () => {
  test("no llama a la base si el formulario es inválido", async () => {
    const repo = new CatalogoFalso();
    const s = new ServicioCatalogo(repo, new FotosFalsas());
    const malo = { ...aEditable(perfume()), nombre: "" };
    await expect(s.guardar(malo)).rejects.toBeInstanceOf(ErrorDeValidacion);
    expect(repo.guardados).toHaveLength(0);
  });

  test("guarda normalizado", async () => {
    const repo = new CatalogoFalso();
    const s = new ServicioCatalogo(repo, new FotosFalsas());
    await s.guardar({ ...aEditable(perfume({ id: 7 })), nombre: "  Mi   Perfume " });
    expect(repo.guardados[0]?.nombre).toBe("Mi Perfume");
  });

  test("ajustar fotos: solo las subidas al panel, y una mala no detiene a las demás", async () => {
    const repo = new CatalogoFalso();
    const fotos = new FotosFalsas();
    const s = new ServicioCatalogo(repo, fotos, () => 1000);
    const lista = [
      perfume({ id: 1, nombre: "Asad", imagenUrl: "https://x.supabase.co/a.webp" }),
      perfume({ id: 2, nombre: "Yara", imagenUrl: "assets/img/lattafa-yara.jpg" }),
      perfume({ id: 3, nombre: "Rota", imagenUrl: "https://x.supabase.co/rota.webp" }),
      perfume({ id: 4, nombre: "Sin foto", imagenUrl: null }),
      perfume({ id: 5, nombre: "Ya ajustada", imagenUrl: "https://x.supabase.co/asad-abc-enc.webp" }),
    ];
    const avance: string[] = [];
    const r = await s.ajustarFotos(
      lista,
      async (url) => {
        if (url.includes("rota")) throw new Error("no se pudo leer");
        return new Blob(["x"], { type: "image/webp" });
      },
      (h, t) => avance.push(`${h}/${t}`),
    );
    expect(r).toEqual({ ajustadas: 1, fallidas: ["Rota"] });
    expect(repo.fotos.map(([id]) => id)).toEqual([1]);
    expect(avance).toEqual(["0/2", "1/2", "2/2"]);
  });

  test("baja y reactivación son lógicas, no borran", async () => {
    const repo = new CatalogoFalso();
    const s = new ServicioCatalogo(repo, new FotosFalsas());
    await s.darDeBaja(3);
    await s.reactivar(3);
    expect(repo.publicados).toEqual([[3, false], [3, true]]);
  });

  test("el ajuste masivo solo manda lo que cambia, y nada si no hay cambios", async () => {
    const repo = new CatalogoFalso();
    const s = new ServicioCatalogo(repo, new FotosFalsas());
    const lista = [perfume({ id: 1 }), perfume({ id: 2, presentaciones: [{ id: 20, ml: 100, precioVenta: 1000, costo: 990 }] })];
    const plan = planearAjuste(lista, CATALOGOS, { categoriaId: null, generoId: null, soloPublicados: false }, {
      modo: "porcentaje",
      porcentaje: -5,
    });
    expect(await s.aplicarAjuste(plan)).toBe(1);
    expect(repo.precios[0]).toEqual([{ presentacionId: 10, precioVenta: 950 }]);
    expect(await s.aplicarAjuste([])).toBe(0);
    expect(repo.precios).toHaveLength(1);
  });

  test("las fotos reciben un nombre único y legible", async () => {
    const fotos = new FotosFalsas();
    const s = new ServicioCatalogo(new CatalogoFalso(), fotos, () => 1_700_000_000_000);
    const url = await s.subirFoto(new Blob(["x"], { type: "image/webp" }), "Lattafa", "Asad Bourbon");
    expect(fotos.rutas[0]).toMatch(/^lattafa-asad-bourbon-[a-z0-9]+-enc\.webp$/);
    expect(url).toContain("lattafa-asad-bourbon");
  });
});

describe("ServicioSesion", () => {
  test("un cliente que entra es expulsado de inmediato", async () => {
    const repo = new SesionFalsa();
    repo.rol = "cliente";
    const s = new ServicioSesion(repo);
    await expect(s.entrar("ana@prueba.mx", "x")).rejects.toBeInstanceOf(ErrorDeAcceso);
    expect(repo.cerrada).toBe(1);
    expect(repo.usuario).toBeNull();
  });

  test("el admin entra con su correo normalizado", async () => {
    const s = new ServicioSesion(new SesionFalsa());
    expect(await s.entrar("  Jorge@Prueba.MX ", "x")).toBe("jorge@prueba.mx");
  });

  test("una sesión guardada de cliente no abre el panel", async () => {
    const repo = new SesionFalsa();
    repo.usuario = { id: "u2", correo: "beto@prueba.mx" };
    repo.rol = "cliente";
    expect(await new ServicioSesion(repo).adminActual()).toBeNull();
    expect(repo.cerrada).toBe(1);
  });

  test("contraseña nueva: largo mínimo y confirmación", async () => {
    const repo = new SesionFalsa();
    const s = new ServicioSesion(repo);
    await expect(s.cambiarContrasena("corta", "corta")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await expect(s.cambiarContrasena("suficiente1", "otra-cosa1")).rejects.toBeInstanceOf(ErrorDeValidacion);
    await s.cambiarContrasena("suficiente1", "suficiente1");
    expect(repo.contrasena).toBe("suficiente1");
  });
});
