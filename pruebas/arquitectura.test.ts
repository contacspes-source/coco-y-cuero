/**
 * Prueba de arquitectura: hace cumplir la regla de capas leyendo los
 * import de cada archivo. Si alguien (incluido yo dentro de seis meses)
 * hace que una pantalla hable directo con Supabase, esto falla.
 *
 *   presentacion → negocio → datos → (Supabase)
 *   compartido   ← cualquiera
 *
 * Aplica igual al panel (panel/) y al sitio público (sitio/), y además
 * ninguno de los dos puede importar código del otro.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

const RAIZ = join(__dirname, "..");

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return /\.ts$/.test(nombre) && !nombre.endsWith(".config.ts") ? [ruta] : [];
  });
}

function importsDe(archivo: string): string[] {
  const codigo = readFileSync(archivo, "utf8");
  return [...codigo.matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => (m[1] ?? m[2]) as string,
  );
}

/** A qué capa pertenece un import (resuelto contra el archivo que lo hace). */
function capaDe(desde: string, especificador: string): string {
  if (especificador.startsWith("@supabase/")) return "supabase";
  if (!especificador.startsWith(".")) return "externo";
  const destino = relative(RAIZ, join(desde, "..", especificador)).split(sep);
  if (destino[0] === "compartido") return "compartido";
  if (destino[0] === "panel" || destino[0] === "sitio") return `${destino[0]}/${destino[1]}`;
  return destino[0] ?? "?";
}

const reglas = (m: string): Record<string, string[]> => ({
  [`${m}/presentacion`]: [`${m}/presentacion`, `${m}/negocio`, "compartido", "externo"],
  [`${m}/negocio`]: [`${m}/negocio`, `${m}/datos`, "compartido"],
  [`${m}/datos`]: [`${m}/datos`, "compartido", ...(m === "panel" ? ["supabase"] : [])],
});

const PERMITIDO: Record<string, string[]> = {
  ...reglas("panel"),
  ...reglas("sitio"),
  compartido: ["compartido"],
};

describe("regla de capas", () => {
  for (const capa of Object.keys(PERMITIDO)) {
    const dir = join(RAIZ, ...capa.split("/"));
    test(`${capa} solo depende de: ${PERMITIDO[capa]!.join(", ")}`, () => {
      const violaciones: string[] = [];
      for (const archivo of archivosTs(dir)) {
        for (const imp of importsDe(archivo)) {
          const destino = capaDe(archivo, imp);
          if (!PERMITIDO[capa]!.includes(destino)) {
            violaciones.push(`${relative(RAIZ, archivo)} importa ${imp} (${destino})`);
          }
        }
      }
      expect(violaciones).toEqual([]);
    });
  }

  test("solo datos/supabase.ts importa la librería de Supabase", () => {
    const quienes = [...archivosTs(join(RAIZ, "panel")), ...archivosTs(join(RAIZ, "sitio")), ...archivosTs(join(RAIZ, "compartido"))]
      .filter((a) => importsDe(a).some((i) => i.startsWith("@supabase/")))
      .map((a) => relative(RAIZ, a).split(sep).join("/"));
    expect(quienes).toEqual(["panel/datos/supabase.ts"]);
  });

  test("ningún archivo del repositorio contiene una llave secreta", () => {
    const sospechosos = [...archivosTs(join(RAIZ, "panel")), ...archivosTs(join(RAIZ, "sitio")), ...archivosTs(join(RAIZ, "compartido"))].filter((a) =>
      // llaves nuevas (sb_secret_…) o llaves viejas en formato JWT (eyJ…)
      /sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(readFileSync(a, "utf8")),
    );
    expect(sospechosos).toEqual([]);
  });
});
