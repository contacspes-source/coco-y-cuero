// Copia el sitio público (todavía HTML estático) a dist/, junto al panel
// compilado. En el incremento 3 el sitio también pasará por Vite.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const SITIO = ["index.html", "assets", "data", "_headers"];

mkdirSync("dist", { recursive: true });
for (const ruta of SITIO) {
  if (!existsSync(ruta)) throw new Error(`Falta ${ruta}: no se puede armar el sitio`);
  cpSync(ruta, `dist/${ruta}`, { recursive: true });
}
console.log("Sitio público copiado a dist/ junto con el panel.");
