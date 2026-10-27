/**
 * Casos de uso del panel. Reciben sus repositorios por constructor
 * (inyección de dependencias): en producción son los de Supabase, en
 * las pruebas son falsos en memoria.
 */
import type { Catalogos, Perfume, PerfumeEditable } from "../../compartido/tipos";
import type { RepositorioCatalogo, RepositorioFotos, RepositorioSesion, EventoDeSesion } from "../datos/contratos";
import { RepositorioCatalogoSupabase } from "../datos/repositorio-catalogo";
import { RepositorioFotosSupabase } from "../datos/repositorio-fotos";
import { RepositorioSesionSupabase } from "../datos/repositorio-sesion";
import { cambiosDe, slug, type RenglonDeAjuste } from "./catalogo";
import { ErrorDeAcceso, ErrorDeValidacion } from "./errores";
import { normalizar, validarPerfume } from "./validacion";
import { crearServicioReportes } from "./reportes";
import { crearServicioVentas } from "./ventas";

export class ServicioCatalogo {
  constructor(
    private readonly repo: RepositorioCatalogo,
    private readonly fotos: RepositorioFotos,
    private readonly ahora: () => number = Date.now,
  ) {}

  async cargar(): Promise<{ catalogos: Catalogos; perfumes: Perfume[] }> {
    const [catalogos, perfumes] = await Promise.all([this.repo.cargarCatalogos(), this.repo.listarPerfumes()]);
    return { catalogos, perfumes };
  }

  /** Valida y guarda. Devuelve el id del perfume. */
  async guardar(p: PerfumeEditable): Promise<number> {
    const problemas = validarPerfume(p);
    if (problemas.length) throw new ErrorDeValidacion(problemas);
    return this.repo.guardarPerfume(normalizar(p));
  }

  darDeBaja(perfumeId: number): Promise<void> {
    return this.repo.cambiarPublicado(perfumeId, false);
  }

  reactivar(perfumeId: number): Promise<void> {
    return this.repo.cambiarPublicado(perfumeId, true);
  }

  /** Aplica solo los renglones que cambian. Todos o ninguno. */
  async aplicarAjuste(renglones: RenglonDeAjuste[]): Promise<number> {
    const cambios = cambiosDe(renglones);
    if (cambios.length === 0) return 0;
    return this.repo.actualizarPrecios(cambios);
  }

  /** Sube una foto ya preparada (recortada y comprimida) y devuelve su URL. */
  subirFoto(foto: Blob, marca: string, nombre: string): Promise<string> {
    const extension = foto.type === "image/png" ? "png" : foto.type === "image/jpeg" ? "jpg" : "webp";
    // nombre único: nunca se pisa una foto que el sitio esté usando
    const ruta = `${slug(marca, nombre)}-${this.ahora().toString(36)}.${extension}`;
    return this.fotos.subir(foto, ruta);
  }
}

export const LARGO_MINIMO_CONTRASENA = 8;

export class ServicioSesion {
  constructor(private readonly repo: RepositorioSesion) {}

  /** ¿Quién está aquí? null = nadie o no es admin (y se le saca). */
  async adminActual(): Promise<string | null> {
    const u = await this.repo.usuarioActual();
    if (!u) return null;
    if ((await this.repo.rolDe(u)) !== "admin") {
      await this.repo.cerrarSesion();
      return null;
    }
    return u.correo;
  }

  async entrar(correo: string, contrasena: string): Promise<string> {
    const u = await this.repo.iniciarSesion(correo.trim().toLowerCase(), contrasena);
    if ((await this.repo.rolDe(u)) !== "admin") {
      await this.repo.cerrarSesion();
      throw new ErrorDeAcceso();
    }
    return u.correo;
  }

  salir(): Promise<void> {
    return this.repo.cerrarSesion();
  }

  recuperar(correo: string, volverA: string): Promise<void> {
    return this.repo.enviarCorreoDeRecuperacion(correo.trim().toLowerCase(), volverA);
  }

  async cambiarContrasena(nueva: string, confirmacion: string): Promise<void> {
    if (nueva.length < LARGO_MINIMO_CONTRASENA) {
      throw new ErrorDeValidacion([
        { campo: "contrasena", mensaje: `Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.` },
      ]);
    }
    if (nueva !== confirmacion) {
      throw new ErrorDeValidacion([{ campo: "confirmacion", mensaje: "Las contraseñas no coinciden." }]);
    }
    await this.repo.cambiarContrasena(nueva);
  }

  alCambiar(escucha: (evento: EventoDeSesion) => void): void {
    this.repo.alCambiar(escucha);
  }
}

/**
 * Raíz de composición: el único lugar que decide qué implementación
 * concreta se usa. La pantalla llama a esto y nunca ve a Supabase.
 */
export function crearServicios() {
  return {
    catalogo: new ServicioCatalogo(new RepositorioCatalogoSupabase(), new RepositorioFotosSupabase()),
    sesion: new ServicioSesion(new RepositorioSesionSupabase()),
    ventas: crearServicioVentas(),
    reportes: crearServicioReportes(),
  };
}

export type Servicios = ReturnType<typeof crearServicios>;
export type { EventoDeSesion };
