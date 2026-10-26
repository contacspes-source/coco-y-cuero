/**
 * Reglas del catálogo que no dependen de la red: filtros, resumen,
 * ajuste masivo de precios y conversión para el formulario.
 * Todas puras (pruebas/catalogo.test.ts).
 */
import type {
  CambioDePrecio,
  Catalogos,
  ClaveCategoria,
  Perfume,
  PerfumeEditable,
} from "../../compartido/tipos";
import { sinAcentos } from "../../compartido/texto";
import { aplicarPorcentaje, margen, precioSugerido, semaforo, type Semaforo } from "./precios";

// ------------------------------------------------------------------
// Filtros
// ------------------------------------------------------------------

export interface FiltrosCatalogo {
  texto: string;
  generoId: number | null;
  categoriaId: number | null;
  estado: "todos" | "publicados" | "baja";
  alerta: "todas" | "margen-bajo" | "sin-costo" | "sin-foto";
}

export const FILTROS_INICIALES: FiltrosCatalogo = {
  texto: "",
  generoId: null,
  categoriaId: null,
  estado: "todos",
  alerta: "todas",
};


/** El peor semáforo entre las presentaciones del perfume. */
export function semaforoDe(p: Perfume): Semaforo {
  const orden: Semaforo[] = ["perdida", "bajo", "sin-costo", "justo", "sano"];
  let peor: Semaforo = "sano";
  for (const pr of p.presentaciones) {
    const s = semaforo(pr.precioVenta, pr.costo);
    if (orden.indexOf(s) < orden.indexOf(peor)) peor = s;
  }
  return p.presentaciones.length ? peor : "sin-costo";
}

export function filtrarPerfumes(perfumes: Perfume[], f: FiltrosCatalogo): Perfume[] {
  const palabras = sinAcentos(f.texto).split(/\s+/).filter(Boolean);
  return perfumes.filter((p) => {
    if (f.generoId !== null && p.generoId !== f.generoId) return false;
    if (f.categoriaId !== null && p.categoriaId !== f.categoriaId) return false;
    if (f.estado === "publicados" && !p.publicado) return false;
    if (f.estado === "baja" && p.publicado) return false;
    if (f.alerta === "margen-bajo" && !["perdida", "bajo"].includes(semaforoDe(p))) return false;
    if (f.alerta === "sin-costo" && !p.presentaciones.some((pr) => pr.costo === null)) return false;
    if (f.alerta === "sin-foto" && p.imagenUrl) return false;
    if (palabras.length) {
      const pajar = sinAcentos(`${p.marca} ${p.nombre} ${p.tipo}`);
      if (!palabras.every((w) => pajar.includes(w))) return false;
    }
    return true;
  });
}

// ------------------------------------------------------------------
// Resumen para la cabecera
// ------------------------------------------------------------------

export interface Resumen {
  total: number;
  publicados: number;
  deBaja: number;
  /** promedio del margen sobre precio de las presentaciones con costo */
  margenPromedio: number | null;
  conMargenBajo: number;
  sinCosto: number;
  sinFoto: number;
}

export function resumir(perfumes: Perfume[]): Resumen {
  const margenes: number[] = [];
  let sinCosto = 0;
  for (const p of perfumes) {
    for (const pr of p.presentaciones) {
      const m = margen(pr.precioVenta, pr.costo);
      if (m === null) sinCosto++;
      else margenes.push(m);
    }
  }
  return {
    total: perfumes.length,
    publicados: perfumes.filter((p) => p.publicado).length,
    deBaja: perfumes.filter((p) => !p.publicado).length,
    margenPromedio: margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null,
    conMargenBajo: perfumes.filter((p) => ["perdida", "bajo"].includes(semaforoDe(p))).length,
    sinCosto,
    sinFoto: perfumes.filter((p) => !p.imagenUrl).length,
  };
}

// ------------------------------------------------------------------
// Ajuste masivo de precios
// ------------------------------------------------------------------

export type ReglaDeAjuste = { modo: "porcentaje"; porcentaje: number } | { modo: "formula" };

export interface AlcanceDeAjuste {
  categoriaId: number | null;
  generoId: number | null;
  soloPublicados: boolean;
}

export interface RenglonDeAjuste {
  perfumeId: number;
  presentacionId: number;
  etiqueta: string;
  costo: number | null;
  antes: number;
  despues: number;
  semaforoDespues: Semaforo;
  estado: "cambia" | "igual" | "rechazado";
  motivo?: string;
}

export function claveDeCategoria(catalogos: Catalogos, categoriaId: number): ClaveCategoria {
  const clave = catalogos.categorias.find((c) => c.id === categoriaId)?.clave;
  return (clave as ClaveCategoria | undefined) ?? "disenador";
}

export function planearAjuste(
  perfumes: Perfume[],
  catalogos: Catalogos,
  alcance: AlcanceDeAjuste,
  regla: ReglaDeAjuste,
): RenglonDeAjuste[] {
  const renglones: RenglonDeAjuste[] = [];
  for (const p of perfumes) {
    if (alcance.categoriaId !== null && p.categoriaId !== alcance.categoriaId) continue;
    if (alcance.generoId !== null && p.generoId !== alcance.generoId) continue;
    if (alcance.soloPublicados && !p.publicado) continue;

    for (const pr of p.presentaciones) {
      const base = {
        perfumeId: p.id,
        presentacionId: pr.id,
        etiqueta: `${p.marca} ${p.nombre} · ${pr.ml} ml`,
        costo: pr.costo,
        antes: pr.precioVenta,
      };

      if (regla.modo === "formula" && pr.costo === null) {
        renglones.push({
          ...base,
          despues: pr.precioVenta,
          semaforoDespues: "sin-costo",
          estado: "rechazado",
          motivo: "Sin costo registrado: no hay con qué calcular.",
        });
        continue;
      }

      const despues =
        regla.modo === "porcentaje"
          ? aplicarPorcentaje(pr.precioVenta, regla.porcentaje)
          : precioSugerido(pr.costo as number, claveDeCategoria(catalogos, p.categoriaId));

      const s = semaforo(despues, pr.costo);
      if (s === "perdida") {
        renglones.push({
          ...base,
          despues,
          semaforoDespues: s,
          estado: "rechazado",
          motivo: `Quedaría debajo del costo ($${pr.costo}).`,
        });
      } else {
        renglones.push({ ...base, despues, semaforoDespues: s, estado: despues === pr.precioVenta ? "igual" : "cambia" });
      }
    }
  }
  return renglones;
}

export function cambiosDe(renglones: RenglonDeAjuste[]): CambioDePrecio[] {
  return renglones
    .filter((r) => r.estado === "cambia")
    .map((r) => ({ presentacionId: r.presentacionId, precioVenta: r.despues }));
}

// ------------------------------------------------------------------
// Formulario
// ------------------------------------------------------------------

export function aEditable(p: Perfume): PerfumeEditable {
  return {
    id: p.id,
    marca: p.marca,
    nombre: p.nombre,
    tipo: p.tipo,
    generoId: p.generoId,
    categoriaId: p.categoriaId,
    imagenUrl: p.imagenUrl,
    publicado: p.publicado,
    descripcion: p.descripcion,
    notas: [...p.notas],
    presentaciones: p.presentaciones.map((pr) => ({ ...pr })),
  };
}

export function perfumeNuevo(catalogos: Catalogos): PerfumeEditable {
  return {
    marca: "",
    nombre: "",
    tipo: "EDP",
    generoId: catalogos.generos[0]?.id ?? 0,
    categoriaId: catalogos.categorias[0]?.id ?? 0,
    imagenUrl: null,
    publicado: true,
    descripcion: null,
    notas: [],
    presentaciones: [{ ml: 100, precioVenta: 0, costo: null }],
  };
}

export function hayCambios(a: PerfumeEditable, b: PerfumeEditable): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export { sinAcentos, slug } from "../../compartido/texto";
