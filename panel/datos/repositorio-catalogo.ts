import type {
  CambioDePrecio,
  Catalogos,
  Perfume,
  PerfumeEditable,
  TipoPerfume,
} from "../../compartido/tipos";
import type { RepositorioCatalogo } from "./contratos";
import { traducirError } from "./errores";
import { supabase } from "./supabase";

// Forma en que llegan los renglones de la base (snake_case).
interface FilaPerfume {
  id: number;
  nombre: string;
  tipo: TipoPerfume;
  genero_id: number;
  categoria_id: number;
  imagen_url: string | null;
  descripcion: string | null;
  publicado: boolean;
  actualizado_en: string;
  marca: { nombre: string } | null;
  presentacion: { id: number; ml: number; precio_venta: number }[];
  perfume_nota: { nota_id: number }[];
}

interface FilaNota {
  id: number;
  nombre: string;
  familia_olfativa: { nombre: string } | null;
}

/** Lanza el error ya traducido si la respuesta trae uno. */
function revisar<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw traducirError(r.error);
  return r.data as T;
}

export class RepositorioCatalogoSupabase implements RepositorioCatalogo {
  async cargarCatalogos(): Promise<Catalogos> {
    const db = supabase();
    try {
      const [generos, categorias, marcas, notas] = await Promise.all([
        db.from("genero").select("id, clave, nombre").order("orden"),
        db.from("categoria").select("id, clave, nombre").order("orden"),
        db.from("marca").select("nombre").order("nombre"),
        db.from("nota").select("id, nombre, familia_olfativa(nombre)").order("nombre"),
      ]);
      return {
        generos: revisar(generos),
        categorias: revisar(categorias),
        marcas: revisar(marcas).map((m: { nombre: string }) => m.nombre),
        notas: (revisar(notas) as unknown as FilaNota[]).map((n) => ({
          id: n.id,
          nombre: n.nombre,
          familia: n.familia_olfativa?.nombre ?? null,
        })),
      };
    } catch (e) {
      throw traducirError(e);
    }
  }

  async listarPerfumes(): Promise<Perfume[]> {
    const db = supabase();
    try {
      const [perfumes, costos] = await Promise.all([
        db
          .from("perfume")
          .select(
            "id, nombre, tipo, genero_id, categoria_id, imagen_url, descripcion, publicado, actualizado_en," +
              " marca(nombre), presentacion(id, ml, precio_venta), perfume_nota(nota_id)",
          )
          .order("id"),
        // la vista solo trae costos si quien pregunta es administrador
        db.from("margen_actual").select("presentacion_id, costo"),
      ]);

      const costoPorPresentacion = new Map<number, number | null>(
        revisar(costos).map((c: { presentacion_id: number; costo: number | null }) => [c.presentacion_id, c.costo]),
      );

      return (revisar(perfumes) as unknown as FilaPerfume[]).map((p) => ({
        id: p.id,
        marca: p.marca?.nombre ?? "",
        nombre: p.nombre,
        tipo: p.tipo,
        generoId: p.genero_id,
        categoriaId: p.categoria_id,
        imagenUrl: p.imagen_url,
        descripcion: p.descripcion,
        publicado: p.publicado,
        actualizadoEn: p.actualizado_en,
        notas: p.perfume_nota.map((n) => n.nota_id),
        presentaciones: p.presentacion
          .map((pr) => ({
            id: pr.id,
            ml: pr.ml,
            precioVenta: Number(pr.precio_venta),
            costo: costoPorPresentacion.get(pr.id) ?? null,
          }))
          .sort((a, b) => a.ml - b.ml),
      }));
    } catch (e) {
      throw traducirError(e);
    }
  }

  async guardarPerfume(d: PerfumeEditable): Promise<number> {
    try {
      const r = await supabase().rpc("guardar_perfume", {
        p_datos: {
          id: d.id ?? null,
          marca: d.marca,
          nombre: d.nombre,
          tipo: d.tipo,
          genero_id: d.generoId,
          categoria_id: d.categoriaId,
          imagen_url: d.imagenUrl,
          descripcion: d.descripcion,
          publicado: d.publicado,
          presentaciones: d.presentaciones.map((p) => ({
            id: p.id ?? null,
            ml: p.ml,
            precio_venta: p.precioVenta,
            costo: p.costo,
          })),
          notas: d.notas,
        },
      });
      return Number(revisar(r));
    } catch (e) {
      throw traducirError(e);
    }
  }

  async cambiarPublicado(perfumeId: number, publicado: boolean): Promise<void> {
    try {
      const r = await supabase().from("perfume").update({ publicado }).eq("id", perfumeId).select("id");
      const filas = revisar(r) as unknown[];
      if (filas.length === 0) throw traducirError({ code: "42501" });
    } catch (e) {
      throw traducirError(e);
    }
  }

  async actualizarPrecios(cambios: CambioDePrecio[]): Promise<number> {
    try {
      const r = await supabase().rpc("actualizar_precios", {
        p_cambios: cambios.map((c) => ({ presentacion_id: c.presentacionId, precio_venta: c.precioVenta })),
      });
      return Number(revisar(r));
    } catch (e) {
      throw traducirError(e);
    }
  }
}
