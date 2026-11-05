/**
 * Reglas del catálogo público. Funciones puras, sin DOM ni red
 * (pruebas/sitio.test.ts).
 *
 * Jerarquía de navegación: género → categoría, y encima de eso,
 * filtros por aroma (familia olfativa) y búsqueda libre. "Más filtros"
 * agrega presentación (estuches), rango de precio, concentración y marca.
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

/** Estuche de regalo o el perfume solo. Se deduce del nombre ("… Estuche 3 piezas"). */
export const PRESENTACIONES = [
  { clave: "estuches", nombre: "Estuches de regalo", corto: "Estuches" },
  { clave: "frascos", nombre: "Solo el perfume", corto: "Solo perfume" },
] as const;

/** Rangos de precio sobre el precio de cualquiera de sus presentaciones. */
export const RANGOS_PRECIO = [
  { clave: "hasta-1000", nombre: "Hasta $999", corto: "Hasta $999", min: 0, max: 1000 },
  { clave: "1000-2000", nombre: "$1,000 a $1,999", corto: "$1,000–1,999", min: 1000, max: 2000 },
  { clave: "2000-3000", nombre: "$2,000 a $2,999", corto: "$2,000–2,999", min: 2000, max: 3000 },
  { clave: "3000-mas", nombre: "$3,000 o más", corto: "$3,000 o más", min: 3000, max: Number.POSITIVE_INFINITY },
] as const;

/** Concentraciones, de la más ligera a la más intensa. */
export const CONCENTRACIONES = [
  { clave: "colonia", tipo: "Colonia", nombre: "Eau de Cologne", corto: "Colonia" },
  { clave: "edt", tipo: "EDT", nombre: "Eau de Toilette", corto: "EDT" },
  { clave: "edp", tipo: "EDP", nombre: "Eau de Parfum", corto: "EDP" },
  { clave: "parfum", tipo: "Parfum", nombre: "Parfum", corto: "Parfum" },
  { clave: "extrait", tipo: "Extrait", nombre: "Extrait de Parfum", corto: "Extrait" },
] as const;

export type Orden = "recomendados" | "precio-menor" | "precio-mayor" | "nombre";

export interface Filtros {
  genero: string | null;
  categoria: ClaveCategoria | null;
  aromas: string[];
  texto: string;
  orden: Orden;
  /** "estuches" | "frascos" */
  presentacion: string | null;
  /** clave de RANGOS_PRECIO */
  precio: string | null;
  /** claves de CONCENTRACIONES; se combinan con "o" */
  tipos: string[];
  /** slug de la marca, p. ej. "paco-rabanne" */
  marca: string | null;
}

export const SIN_FILTROS: Filtros = {
  genero: null,
  categoria: null,
  aromas: [],
  texto: "",
  orden: "recomendados",
  presentacion: null,
  precio: null,
  tipos: [],
  marca: null,
};

/** Grupos que se pueden ignorar al contar (para mostrar "Estuches (12)"). */
type Grupo = "genero" | "categoria" | "aromas" | "presentacion" | "precio" | "tipos" | "marca";

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

export function esEstuche(p: PerfumePublico): boolean {
  return /\bestuche\b/i.test(sinAcentos(p.nombre));
}

export function claveDeMarca(marca: string): string {
  return slug(marca);
}

export function claveDeTipo(tipo: string): string {
  return CONCENTRACIONES.find((c) => c.tipo === tipo)?.clave ?? slug(tipo);
}

export function enRango(p: PerfumePublico, clave: string): boolean {
  const r = RANGOS_PRECIO.find((x) => x.clave === clave);
  if (!r) return true;
  return p.presentaciones.some((x) => x.precio >= r.min && x.precio < r.max);
}

/** Marcas del catálogo, de la A a la Z, con su clave para la URL. */
export function marcasDe(perfumes: PerfumePublico[]): { clave: string; nombre: string }[] {
  const m = new Map<string, string>();
  for (const p of perfumes) m.set(claveDeMarca(p.marca), p.marca);
  return [...m].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
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

/** Aplica todos los filtros menos el grupo que se pida ignorar (para contar). */
function pasa(p: PerfumePublico, f: Filtros, ignorar: Grupo | null = null): boolean {
  if (ignorar !== "genero" && f.genero && p.genero !== f.genero) return false;
  if (ignorar !== "categoria" && f.categoria && p.categoria !== f.categoria) return false;
  if (ignorar !== "aromas" && !coincideAroma(p, f.aromas)) return false;
  if (ignorar !== "presentacion" && f.presentacion && esEstuche(p) !== (f.presentacion === "estuches")) return false;
  if (ignorar !== "precio" && f.precio && !enRango(p, f.precio)) return false;
  if (ignorar !== "tipos" && f.tipos.length && !f.tipos.includes(claveDeTipo(p.tipo))) return false;
  if (ignorar !== "marca" && f.marca && claveDeMarca(p.marca) !== f.marca) return false;
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
  const contar = (ignorar: Grupo, condicion: (p: PerfumePublico) => boolean) =>
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
    presentaciones: Object.fromEntries(
      PRESENTACIONES.map((x) => [x.clave, contar("presentacion", (p) => esEstuche(p) === (x.clave === "estuches"))]),
    ) as Record<string, number>,
    precios: Object.fromEntries(RANGOS_PRECIO.map((r) => [r.clave, contar("precio", (p) => enRango(p, r.clave))])) as Record<
      string,
      number
    >,
    tipos: Object.fromEntries(CONCENTRACIONES.map((c) => [c.clave, contar("tipos", (p) => claveDeTipo(p.tipo) === c.clave)])) as Record<
      string,
      number
    >,
    marcas: Object.fromEntries(
      marcasDe(perfumes).map((m) => [m.clave, contar("marca", (p) => claveDeMarca(p.marca) === m.clave)]),
    ) as Record<string, number>,
  };
}

/** Cuántos de "Más filtros" están puestos (para el letrero del botón). */
export function cuantosExtra(f: Filtros): number {
  return (f.presentacion ? 1 : 0) + (f.precio ? 1 : 0) + f.tipos.length + (f.marca ? 1 : 0);
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(f.genero || f.categoria || f.aromas.length || f.texto.trim() || cuantosExtra(f));
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
  const presentacion = q.get("presentacion");
  const precio = q.get("precio");
  const tipos: string[] = CONCENTRACIONES.map((c) => c.clave);
  const marca = q.get("marca");
  return {
    genero: GENEROS.some((g) => g.clave === genero) ? genero : null,
    categoria: CATEGORIAS.some((c) => c.clave === categoria) ? (categoria as ClaveCategoria) : null,
    aromas: (q.get("aroma") ?? "").split(",").filter((a) => familias.includes(a)),
    texto: (q.get("q") ?? "").slice(0, 80),
    orden: orden && ORDENES.includes(orden) ? orden : "recomendados",
    presentacion: PRESENTACIONES.some((x) => x.clave === presentacion) ? presentacion : null,
    precio: RANGOS_PRECIO.some((r) => r.clave === precio) ? precio : null,
    tipos: [...new Set((q.get("tipo") ?? "").split(",").filter((t) => tipos.includes(t)))],
    // la marca se valida contra el catálogo al pintar; aquí solo la forma
    marca: marca && /^[a-z0-9-]{1,60}$/.test(marca) ? marca : null,
  };
}

/** Solo escribe lo que no es el valor por omisión, para URLs cortas. */
export function escribirFiltros(f: Filtros): string {
  const q = new URLSearchParams();
  if (f.genero) q.set("genero", f.genero);
  if (f.categoria) q.set("categoria", f.categoria);
  if (f.aromas.length) q.set("aroma", f.aromas.join(","));
  if (f.presentacion) q.set("presentacion", f.presentacion);
  if (f.precio) q.set("precio", f.precio);
  if (f.tipos.length) q.set("tipo", f.tipos.join(","));
  if (f.marca) q.set("marca", f.marca);
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

// ------------------------------------------------------------------
// Vitrina: fotos de referencia para el encabezado del catálogo y las
// tarjetas de filtro. Cambian cada día (semilla = día del año) pero no
// en cada recarga, para que la página no "brinque".
// ------------------------------------------------------------------

/** Número pseudoaleatorio estable a partir de una semilla (mulberry32). */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar<T>(lista: T[], semilla: number): T[] {
  const r = aleatorio(semilla);
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

/** Día del año (1–366): la semilla de la vitrina. */
export function semillaDelDia(fecha: Date): number {
  const inicio = new Date(fecha.getFullYear(), 0, 0);
  return fecha.getFullYear() * 1000 + Math.floor((fecha.getTime() - inicio.getTime()) / 86_400_000);
}

const conFoto = (p: PerfumePublico) => Boolean(p.imagenUrl);

/**
 * Hasta `cuantos` perfumes con foto, alternando categoría y género para
 * que la vitrina no salga toda de una sola marca o tipo.
 */
export function vitrina(perfumes: PerfumePublico[], cuantos: number, semilla: number): PerfumePublico[] {
  const grupos = new Map<string, PerfumePublico[]>();
  for (const p of barajar(perfumes.filter(conFoto), semilla)) {
    const clave = `${p.categoria}|${p.genero}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
  }
  const colas = barajar([...grupos.values()], semilla + 1);
  const elegidos: PerfumePublico[] = [];
  const marcas = new Set<string>();
  // primera vuelta: una marca distinta por grupo; luego lo que falte
  for (const pasada of [true, false]) {
    let quedan = true;
    while (elegidos.length < cuantos && quedan) {
      quedan = false;
      for (const cola of colas) {
        const i = cola.findIndex((p) => !elegidos.includes(p) && (!pasada || !marcas.has(p.marca)));
        if (i < 0) continue;
        const p = cola[i]!;
        elegidos.push(p);
        marcas.add(p.marca);
        quedan = true;
        if (elegidos.length === cuantos) break;
      }
    }
  }
  return elegidos;
}

/** Fotos de muestra para una tarjeta de filtro (p. ej. "Dama"). */
export function muestras(
  perfumes: PerfumePublico[],
  criterio: (p: PerfumePublico) => boolean,
  cuantos: number,
  semilla: number,
): PerfumePublico[] {
  return barajar(perfumes.filter((p) => conFoto(p) && criterio(p)), semilla).slice(0, cuantos);
}

// ------------------------------------------------------------------
// Filtros activos como "chips" que se quitan con un toque
// ------------------------------------------------------------------

export type FiltroActivo =
  | { tipo: "genero"; etiqueta: string }
  | { tipo: "categoria"; etiqueta: string }
  | { tipo: "aroma"; clave: string; etiqueta: string }
  | { tipo: "presentacion"; etiqueta: string }
  | { tipo: "precio"; etiqueta: string }
  | { tipo: "concentracion"; clave: string; etiqueta: string }
  | { tipo: "marca"; etiqueta: string }
  | { tipo: "texto"; etiqueta: string };

/**
 * `marcas` sirve para mostrar el nombre bonito ("Paco Rabanne") en vez
 * de la clave de la URL; si no se pasa, se usa la clave.
 */
export function filtrosActivos(f: Filtros, marcas: { clave: string; nombre: string }[] = []): FiltroActivo[] {
  const r: FiltroActivo[] = [];
  if (f.genero) r.push({ tipo: "genero", etiqueta: GENEROS.find((g) => g.clave === f.genero)?.nombre ?? f.genero });
  if (f.categoria) r.push({ tipo: "categoria", etiqueta: CATEGORIAS.find((c) => c.clave === f.categoria)?.nombre ?? f.categoria });
  for (const a of f.aromas) r.push({ tipo: "aroma", clave: a, etiqueta: FAMILIAS.find((x) => x.clave === a)?.corto ?? a });
  if (f.presentacion)
    r.push({ tipo: "presentacion", etiqueta: PRESENTACIONES.find((x) => x.clave === f.presentacion)?.corto ?? f.presentacion });
  if (f.precio) r.push({ tipo: "precio", etiqueta: RANGOS_PRECIO.find((x) => x.clave === f.precio)?.corto ?? f.precio });
  for (const t of f.tipos)
    r.push({ tipo: "concentracion", clave: t, etiqueta: CONCENTRACIONES.find((x) => x.clave === t)?.corto ?? t });
  if (f.marca) r.push({ tipo: "marca", etiqueta: marcas.find((m) => m.clave === f.marca)?.nombre ?? f.marca });
  if (f.texto.trim()) r.push({ tipo: "texto", etiqueta: `“${f.texto.trim()}”` });
  return r;
}

export function quitarFiltro(f: Filtros, chip: FiltroActivo): Filtros {
  switch (chip.tipo) {
    case "genero":
      return { ...f, genero: null };
    case "categoria":
      return { ...f, categoria: null };
    case "aroma":
      return { ...f, aromas: f.aromas.filter((a) => a !== chip.clave) };
    case "presentacion":
      return { ...f, presentacion: null };
    case "precio":
      return { ...f, precio: null };
    case "concentracion":
      return { ...f, tipos: f.tipos.filter((t) => t !== chip.clave) };
    case "marca":
      return { ...f, marca: null };
    case "texto":
      return { ...f, texto: "" };
  }
}

/** Ideas para el buscador: las notas y marcas que más se repiten. */
export function sugerenciasDeBusqueda(perfumes: PerfumePublico[], cuantas = 4): string[] {
  const contar = (lista: string[]) => {
    const m = new Map<string, number>();
    for (const x of lista) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([x]) => x);
  };
  const notas = contar(perfumes.flatMap((p) => [...new Set(p.notas.map((n) => n.nota.toLowerCase()))]));
  const marcas = contar(perfumes.map((p) => p.marca));
  const r = [...notas.slice(0, cuantas - 1), ...marcas.slice(0, 1)];
  return [...new Set(r)].slice(0, cuantas);
}

// ------------------------------------------------------------------
// Vitrina que rota: cada pocos segundos un lugar del collage cambia de
// perfume. Pura y con estado explícito para poder probarla.
// ------------------------------------------------------------------

/** Orden en que cambian los lugares: salteado, para que no se note un patrón. */
export const ORDEN_DE_CAMBIO = [2, 5, 0, 4, 1, 6, 3] as const;

export interface Rotacion {
  /** id del perfume en cada lugar del collage */
  mostrados: number[];
  /** los que esperan turno, en orden */
  cola: number[];
  /** cuántos cambios van (decide qué lugar toca) */
  paso: number;
}

/** Arranca con los primeros `lugares` de la vitrina; el resto hace fila. */
export function iniciarRotacion(perfumes: PerfumePublico[], lugares: number, semilla: number): Rotacion {
  const todos = vitrina(perfumes, perfumes.length, semilla).map((p) => p.id);
  return { mostrados: todos.slice(0, lugares), cola: todos.slice(lugares), paso: 0 };
}

/**
 * Siguiente cambio: qué lugar cambia y por cuál perfume. El que sale va
 * al final de la fila, así todos pasan por la vitrina antes de repetir.
 * null si no hay con qué rotar (catálogo chico).
 */
export function siguienteCambio(r: Rotacion): { lugar: number; entra: number; rotacion: Rotacion } | null {
  if (r.cola.length === 0 || r.mostrados.length === 0) return null;
  const orden = ORDEN_DE_CAMBIO.filter((i) => i < r.mostrados.length);
  const lugar = orden.length ? orden[r.paso % orden.length]! : r.paso % r.mostrados.length;
  const [entra, ...resto] = r.cola as [number, ...number[]];
  const sale = r.mostrados[lugar]!;
  const mostrados = [...r.mostrados];
  mostrados[lugar] = entra;
  return { lugar, entra, rotacion: { mostrados, cola: [...resto, sale], paso: r.paso + 1 } };
}
