// Último paso de la compilación:
// 1. Copia los encabezados de seguridad de Cloudflare.
// 2. Guarda una copia del catálogo (catalogo-respaldo.json). Si un día
//    Supabase no responde, el sitio muestra esta copia en vez de nada.
//    Si en este momento no se puede leer la base, la compilación sigue
//    sin respaldo: el sitio funciona igual, solo sin la red de seguridad.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync("dist/index.html") || !existsSync("dist/panel/index.html")) {
  throw new Error("Falta compilar el sitio o el panel antes de finalizar");
}
copyFileSync("_headers", "dist/_headers");

const config = readFileSync("compartido/config.ts", "utf8");
const url = config.match(/SUPABASE_URL = "([^"]+)"/)?.[1];
const llave = config.match(/SUPABASE_LLAVE_PUBLICABLE = "([^"]+)"/)?.[1];

try {
  const r = await fetch(`${url}/rest/v1/catalogo_publico?select=*&order=id`, {
    headers: { apikey: llave, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const filas = await r.json();
  if (!Array.isArray(filas) || filas.length === 0) throw new Error("catálogo vacío");
  writeFileSync("dist/catalogo-respaldo.json", JSON.stringify(filas));
  console.log(`Respaldo del catálogo: ${filas.length} perfumes.`);
} catch (e) {
  console.warn(`AVISO: no se guardó respaldo del catálogo (${e.message}). El sitio funciona igual.`);
}
console.log("dist/ listo: sitio en /, panel en /panel/.");
