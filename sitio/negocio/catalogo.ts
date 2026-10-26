/**
 * Reglas del catálogo público. Funciones puras, sin DOM ni red
 * (pruebas/sitio.test.ts).
 *
 * Jerarquía de navegación: género → categoría, y encima de eso,
 * filtros por aroma (familia olfativa) y búsqueda libre.
 */
import type { ClaveCategoria, PerfumePublico } from "../../compartido/tipos";
import { capitalizar, sinAcentos, slug } from "../../compartido/texto";

export const GENEROS = [
  { clave: "caballero", nombre: "Caballero" },
  { clave: "dama", nombre: "Dama" },
  { clave: "unisex", nombre: "Unisex" },
] as const;

export const CATEGORIAS: readonly { clave: ClaveCategoria; nombre: string; singular: string }[] = [
  { clave: "arabes", nombre: "Árabes", singular: "Árabe" },
  { clave: "nicho", nombre: "Nicho", singular: "Nicho" },
  { clave: "disenador", nombre: "Diseñador", singular: "Diseñador" },
];

/** Familias olfativas; el nombre es el de la tabla familia_olfativa. */
export const FAMILIAS = [
  { clave: "cuero", nombre: "Ámbar y cuero", corto: "Ámbar y cuero" },
  { clave: "dulce", nombre: "Dulce y gourmand", corto: "Dulce" },
  { clave: "floral", nombre: "Floral", corto: "Floral" },
  { clave: "amaderado", nombre: "Amaderado", corto: "Amaderado" },
  { clave: "fresco", nombre: "Fresco y cítrico", corto: "Fresco" },
] as const;

export type Orden = "recomendados" | "precio-menor" | "precio-mayor" | "nombre";

export interface Filtros {
  genero: string | null;
  categoria: ClaveCategoria | null;
  aromas: string[];
  texto: string;
  orden: Orden;
}

export const SIN_FILTROS: Filtros = { genero: null, categoria: null, aromas: [], texto: "", orden: "recomendados" };

// ------------------------------------------------------------------
// Datos derivados de un perfume
// ------------------------------------------------------------------

/** "Ámbar y cuero" → "cuero". Una familia nueva en la base recibe su slug. */
export function claveDeFamilia(nombre: string): string {
  return FAMILIAS.find((f) => sinAcentos(f.nombre) === sinAcentos(nombre))?.clave ?? slug(nombre);
}

export function familiasDe(p: PerfumePublico): string[] {
  return [...new Set(p.notas.filter((n) => n.familia).map((n) => claveDeFamilia(n.familia as string)))];
}

/**
 * La familia que más se repite en sus notas. En empate gana la que va
 * primero en FAMILIAS (de las más intensas a las más ligeras).
 */
export function familiaPrincipal(p: PerfumePublico): string | null {
  const cuenta = new Map<string, number>();
  for (const n of p.notas) {
    if (!n.familia) continue;
    const c = claveDeFamilia(n.familia);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  if (cuenta.size === 0) return null;
  const orden = (c: string) => {
    const i = FAMILIAS.findIndex((f) => f.clave === c);
    return i < 0 ? 99 : i;
  };
  return [...cuenta].sort((a, b) => b[1] - a[1] || orden(a[0]) - orden(b[0]))[0]![0];
}

export function precioDesde(p: PerfumePublico): number | null {
  return p.presentaciones.length ? Math.min(...p.presentaciones.map((x) => x.precio)) : null;
}

export function textoNotas(p: PerfumePublico): string {
  return p.notas.map((n) => n.nota).slice(0, 4).map((n, i) => (i === 0 ? capitalizar(n) : n)).join(", ");
}

export function mensajeWhatsApp(p: PerfumePublico): string {
  const ml = p.presentaciones.map((x) => `${x.ml} ml`).join(" o ");
  return `Hola, me interesa ${p.nombre} de ${p.marca}${ml ? ` (${ml})` : ""}. ¿Lo tienen disponible?`;
}

// ------------------------------------------------------------------
// Filtrar, contar y ordenar
// ------------------------------------------------------------------

function coincideTexto(p: PerfumePublico, texto: string): boolean {
  const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const pajar = sinAcentos(`${p.marca} ${p.nombre} ${p.tipo} ${p.notas.map((n) => `${n.nota} ${n.familia ?? ""}`).join(" ")}`);
  return palabras.every((w) => pajar.includes(w));
}

/** Aromas se combinan con "o": floral o dulce muestra ambos. */
function coincideAroma(p: PerfumePublico, aromas: string[]): boolean {
  if (!aromas.length) return true;
  const propias = familiasDe(p);
  return aromas.some((a) => propias.includes(a));
}

/** Aplica todos los filtros menos los que se pidan ignorar (para contar). */
function pasa(p: PerfumePublico, f: Filtros, ignorar: "genero" | "categoria" | "aromas" | null = null): boolean {
  if (ignorar !== "genero" && f.genero && p.genero !== f.genero) return false;
  if (ignorar !== "categoria" && f.categoria && p.categoria !== f.categoria) return false;
  if (ignorar !== "aromas" && !coincideAroma(p, f.aromas)) return false;
  return coincideTexto(p, f.texto);
}

export function filtrar(perfumes: PerfumePublico[], f: Filtros): PerfumePublico[] {
  const visibles = perfumes.filter((p) => pasa(p, f));
  const nombre = (p: PerfumePublico) => sinAcentos(`${p.marca} ${p.nombre}`);
  const precio = (p: PerfumePublico) => precioDesde(p) ?? Number.POSITIVE_INFINITY;
  switch (f.orden) {
    case "precio-menor":
      return visibles.sort((a, b) => precio(a) - precio(b) || nombre(a).localeCompare(nombre(b)));
    case "precio-mayor":
      return visibles.sort((a, b) => precio(b) - precio(a) || nombre(a).localeCompare(nombre(b)));
    case "nombre":
      return visibles.sort((a, b) => nombre(a).localeCompare(nombre(b)));
    default:
      return visibles;
  }
}

/**
 * Cuántos perfumes habría en cada opción si se eligiera, respetando
 * los demás filtros. Sirve para mostrar "Nicho (0)" y desactivarlo.
 */
export function conteos(perfumes: PerfumePublico[], f: Filtros) {
  const contar = (ignorar: "genero" | "categoria" | "aromas", condicion: (p: PerfumePublico) => boolean) =>
    perfumes.filter((p) => pasa(p, f, ignorar) && condicion(p)).length;
  return {
    generos: Object.fromEntries([
      ["todos", contar("genero", () => true)],
      ...GENEROS.map((g) => [g.clave, contar("genero", (p) => p.genero === g.clave)]),
    ]) as Record<string, number>,
    categorias: Object.fromEntries([
      ["todas", contar("categoria", () => true)],
      ...CATEGORIAS.map((c) => [c.clave, contar("categoria", (p) => p.categoria === c.clave)]),
    ]) as Record<string, number>,
    aromas: Object.fromEntries(
      FAMILIAS.map((a) => [a.clave, contar("aromas", (p) => familiasDe(p).includes(a.clave))]),
    ) as Record<string, number>,
  };
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(f.genero || f.categoria || f.aromas.length || f.texto.trim());
}

// ------------------------------------------------------------------
// Filtros en la URL: un anuncio puede llevar directo a "dama · árabes"
// ------------------------------------------------------------------

const ORDENES: Orden[] = ["recomendados", "precio-menor", "precio-mayor", "nombre"];

export function leerFiltros(busqueda: string): Filtros {
  const q = new URLSearchParams(busqueda);
  const genero = q.get("genero");
  const categoria = q.get("categoria");
  const orden = q.get("orden") as Orden | null;
  const familias: string[] = FAMILIAS.map((a) => a.clave);
  return {
    genero: GENEROS.some((g) => g.clave === genero) ? genero : null,
    categoria: CATEGORIAS.some((c) => c.clave === categoria) ? (categoria as ClaveCategoria) : null,
    aromas: (q.get("aroma") ?? "").split(",").filter((a) => familias.includes(a)),
    texto: (q.get("q") ?? "").slice(0, 80),
    orden: orden && ORDENES.includes(orden) ? orden : "recomendados",
  };
}

/** Solo escribe lo que no es el valor por omisión, para URLs cortas. */
export function escribirFiltros(f: Filtros): string {
  const q = new URLSearchParams();
  if (f.genero) q.set("genero", f.genero);
  if (f.categoria) q.set("categoria", f.categoria);
  if (f.aromas.length) q.set("aroma", f.aromas.join(","));
  if (f.texto.trim()) q.set("q", f.texto.trim());
  if (f.orden !== "recomendados") q.set("orden", f.orden);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ------------------------------------------------------------------
// Detalle del perfume
// ------------------------------------------------------------------

export const TIPO_LARGO: Record<string, string> = {
  EDT: "Eau de Toilette",
  EDP: "Eau de Parfum",
  Parfum: "Parfum",
  Extrait: "Extrait de Parfum",
  Colonia: "Eau de Cologne",
};

const PARA: Record<string, string> = { caballero: "para caballero", dama: "para dama", unisex: "unisex" };
const ADJETIVO: Record<ClaveCategoria, string> = { arabes: "árabe", nicho: "de nicho", disenador: "de diseñador" };

/**
 * La descripción que escribiste en el panel; si no hay, una frase
 * armada con sus datos reales (nunca se inventan notas).
 */
export function descripcionDe(p: PerfumePublico): string {
  if (p.descripcion) return p.descripcion;
  const base = `${TIPO_LARGO[p.tipo] ?? "Perfume"} ${ADJETIVO[p.categoria] ?? ""} ${PARA[p.genero] ?? ""} de ${p.marca}`
    .replace(/\s+/g, " ")
    .trim();
  const notas = p.notas.map((n) => n.nota);
  if (notas.length === 0) return `${capitalizar(base)}.`;
  const lista = notas.length === 1 ? notas[0] : `${notas.slice(0, -1).join(", ")} y ${notas.at(-1)}`;
  return `${capitalizar(base)}, con notas de ${lista}.`;
}

/** Notas agrupadas por familia, en el orden de FAMILIAS. */
export function notasPorFamilia(p: PerfumePublico): { familia: string; clave: string; notas: string[] }[] {
  const grupos = new Map<string, string[]>();
  for (const n of p.notas) {
    const f = n.familia ?? "Otras notas";
    grupos.set(f, [...(grupos.get(f) ?? []), n.nota]);
  }
  const orden = (f: string) => {
    const i = FAMILIAS.findIndex((x) => x.nombre === f);
    return i < 0 ? 99 : i;
  };
  return [...grupos]
    .sort((a, b) => orden(a[0]) - orden(b[0]))
    .map(([familia, notas]) => ({ familia, clave: claveDeFamilia(familia), notas }));
}

/**
 * Perfumes parecidos para "También te puede gustar": mismo género
 * (o unisex) y que compartan familias; desempata la categoría y el
 * precio más cercano.
 */
export function similares(p: PerfumePublico, todos: PerfumePublico[], cuantos = 4): PerfumePublico[] {
  const propias = familiasDe(p);
  const precio = precioDesde(p) ?? 0;
  return todos
    .filter((o) => o.id !== p.id && (o.genero === p.genero || o.genero === "unisex" || p.genero === "unisex"))
    .map((o) => {
      const comunes = familiasDe(o).filter((f) => propias.includes(f)).length;
      const puntos =
        comunes * 10 +
        (familiaPrincipal(o) !== null && familiaPrincipal(o) === familiaPrincipal(p) ? 5 : 0) +
        (o.categoria === p.categoria ? 3 : 0) -
        Math.abs((precioDesde(o) ?? 0) - precio) / 1000;
      return { o, puntos, comunes };
    })
    // si el perfume tiene notas, el parecido debe compartir algún aroma;
    // si no tiene, basta con la misma categoría
    .filter((x) => (propias.length ? x.comunes > 0 : x.puntos > 0))
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantos)
    .map((x) => x.o);
}

export function mensajeWhatsAppTamano(p: PerfumePublico, ml: number): string {
  return `Hola, me interesa ${p.nombre} de ${p.marca} en ${ml} ml. ¿Lo tienen disponible?`;
}

/** ?perfume=12 abre el detalle; así se puede compartir o anunciar. */
export function leerPerfumeAbierto(busqueda: string): number | null {
  const n = Number(new URLSearchParams(busqueda).get("perfume"));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function conPerfume(busquedaActual: string, id: number | null): string {
  const q = new URLSearchParams(busquedaActual);
  if (id === null) q.delete("perfume");
  else q.set("perfume", String(id));
  const s = q.toString();
  return s ? `?${s}` : "";
}
