/**
 * Reglas del formulario de perfume. Puras y probadas
 * (pruebas/validacion.test.ts).
 *
 * La base de datos vuelve a revisar lo importante (precio >= costo,
 * tipos válidos, ml únicos), pero revisar aquí primero permite señalar
 * el campo exacto y no gastar un viaje al servidor.
 */
import { TIPOS_PERFUME, type PerfumeEditable } from "../../compartido/tipos";
import type { ProblemaDeCampo } from "./errores";

export const ML_MAXIMO = 1000;
export const PRECIO_MAXIMO = 200_000;
export const LARGO_DESCRIPCION = 1200;

export function validarPerfume(p: PerfumeEditable): ProblemaDeCampo[] {
  const problemas: ProblemaDeCampo[] = [];
  const agregar = (campo: string, mensaje: string) => problemas.push({ campo, mensaje });

  if (p.marca.trim().length < 2) agregar("marca", "Escribe la marca.");
  if (p.nombre.trim().length < 2) agregar("nombre", "Escribe el nombre del perfume.");
  if (p.nombre.trim().length > 120) agregar("nombre", "El nombre es demasiado largo.");
  if ((p.descripcion ?? "").length > LARGO_DESCRIPCION) agregar("descripcion", `La descripción admite hasta ${LARGO_DESCRIPCION} caracteres.`);
  if (!TIPOS_PERFUME.includes(p.tipo)) agregar("tipo", "Elige un tipo válido.");
  if (!(p.generoId > 0)) agregar("genero", "Elige el género.");
  if (!(p.categoriaId > 0)) agregar("categoria", "Elige la categoría.");

  if (p.presentaciones.length === 0) {
    agregar("presentaciones", "Agrega al menos una presentación.");
  }

  const mlVistos = new Set<number>();
  p.presentaciones.forEach((pr, i) => {
    const c = `presentacion.${i}`;
    if (!Number.isInteger(pr.ml) || pr.ml <= 0 || pr.ml > ML_MAXIMO) {
      agregar(`${c}.ml`, `Los ml deben ser un número entero entre 1 y ${ML_MAXIMO}.`);
    } else if (mlVistos.has(pr.ml)) {
      agregar(`${c}.ml`, `Ya hay otra presentación de ${pr.ml} ml.`);
    }
    mlVistos.add(pr.ml);

    if (!Number.isFinite(pr.precioVenta) || pr.precioVenta <= 0) {
      agregar(`${c}.precio`, "El precio debe ser mayor que cero.");
    } else if (pr.precioVenta > PRECIO_MAXIMO) {
      agregar(`${c}.precio`, "Ese precio parece un error de dedo.");
    }

    if (pr.costo !== null) {
      if (!Number.isFinite(pr.costo) || pr.costo <= 0) {
        agregar(`${c}.costo`, "El costo debe ser mayor que cero, o déjalo vacío.");
      } else if (Number.isFinite(pr.precioVenta) && pr.precioVenta > 0 && pr.precioVenta < pr.costo) {
        agregar(`${c}.precio`, `Venderías con pérdida: el costo es $${pr.costo}.`);
      }
    }
  });

  return problemas;
}

/** Limpia espacios dobles y orillas antes de guardar. */
export function normalizar(p: PerfumeEditable): PerfumeEditable {
  const limpiar = (s: string) => s.trim().replace(/\s+/g, " ");
  return {
    ...p,
    marca: limpiar(p.marca),
    nombre: limpiar(p.nombre),
    imagenUrl: p.imagenUrl?.trim() || null,
    descripcion: p.descripcion?.trim() || null,
    notas: [...new Set(p.notas)].sort((a, b) => a - b),
    presentaciones: [...p.presentaciones].sort((a, b) => a.ml - b.ml),
  };
}
