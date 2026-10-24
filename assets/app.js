/* ===========================================================
   Coco y Cuero — catálogo
   CAMBIA ESTOS DATOS ANTES DE PUBLICAR
   =========================================================== */
const CONFIG = {
  // Tu número con lada de país, sin + ni espacios. México = 52.
  whatsapp: "522206172818",
  instagram: "https://instagram.com/cocoycuero",
  facebook: "https://facebook.com/cocoycuero"
};
/* =========================================================== */

const CATEGORIAS = { arabes: "Árabe", nicho: "Nicho", disenador: "Diseñador" };

/* Familias olfativas: el icono sale de las notas reales del perfume.
   Se evalúan en orden; la primera que coincide manda. */
const FAMILIAS = [
  {
    clave: "cuero",
    nombre: "Ámbar y cuero",
    claves: ["cuero", "ámbar", "ambar", "tabaco", "oriental", "cacao", "atalcado"],
    svg: `<path d="M12 3.4c3 1 5.2 1.6 7.4 1.6-.5 2.6.3 4-1.2 6.4-1.4 2.3-1 4.6-1.9 6.2-.9 1.5-2.6 2.6-4.3 3-1.7-.4-3.4-1.5-4.3-3-.9-1.6-.5-3.9-1.9-6.2C4.3 9 5.1 7.6 4.6 5c2.2 0 4.4-.6 7.4-1.6z"/>`
  },
  {
    clave: "dulce",
    nombre: "Dulce y gourmand",
    claves: ["vainilla", "dulce", "caramelo", "marshmallow", "coco", "haba", "gourmand"],
    svg: `<circle cx="12" cy="12" r="7.6"/><path d="M8.3 9.4c1.6 1.2 2.8 3 3.4 5M15.9 9.9c-1.3 1.3-2.2 3-2.6 4.9"/>`
  },
  {
    clave: "floral",
    nombre: "Floral",
    claves: ["floral", "flor", "lavanda", "rosa", "jazm"],
    svg: `<circle cx="12" cy="12" r="2.3"/><path d="M12 9.7c0-2.6-.9-4.3-2.6-4.3S7.2 7.3 9.4 9.4M14.3 12c2.6 0 4.3-.9 4.3-2.6s-1.9-2.2-4 0M12 14.3c0 2.6.9 4.3 2.6 4.3s2.2-1.9 0-4M9.7 12c-2.6 0-4.3.9-4.3 2.6s1.9 2.2 4 0"/>`
  },
  {
    clave: "amaderado",
    nombre: "Amaderado",
    claves: ["amaderado", "madera", "cedro", "musgoso", "aromático", "aromatico", "picante"],
    svg: `<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2.6"/>`
  },
  {
    clave: "fresco",
    nombre: "Fresco y cítrico",
    claves: ["cítrico", "citrico", "acuático", "acuatico", "marino", "frutal", "afrutado", "fresco", "mango"],
    svg: `<path d="M3.6 9.3c2.3-2 4.5-2 6.8 0s4.5 2 6.8 0 4.5-2 6.8 0M3.6 14.7c2.3-2 4.5-2 6.8 0s4.5 2 6.8 0 4.5-2 6.8 0"/>`
  }
];

const FAMILIA_BASE = {
  clave: "notas",
  nombre: "Notas",
  svg: `<path d="M12 4.4c-3.4 3-5.1 5.6-5.1 8.3 0 3 2.3 5.3 5.1 5.3s5.1-2.3 5.1-5.3c0-2.7-1.7-5.3-5.1-8.3z"/><path d="M12 9.6v6.4"/>`
};

function familiaDe(perfume) {
  const texto = `${perfume.notas || ""} ${perfume.nombre || ""}`.toLowerCase();
  return FAMILIAS.find(f => f.claves.some(k => texto.includes(k))) || FAMILIA_BASE;
}

const rejilla = document.getElementById("rejilla");
const vacio = document.getElementById("vacio");
const conteo = document.getElementById("conteo");
const buscador = document.getElementById("buscador");
const pildoras = document.querySelectorAll(".pildora");

let perfumes = [];
let categoriaActiva = "todos";

const pesos = n =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0
  }).format(n);

const linkWhatsApp = texto =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`;

function iniciales(nombre) {
  return nombre.split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase();
}

const ICONO_WA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.7 15l-1.2 4.4 4.5-1.2A10 10 0 1 0 12 2zm5.1 13.8c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.8-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.1c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.2.1.4.1.6-.1l.8-.9c.2-.2.3-.2.6-.1l1.9.9c.2.1.4.2.5.3.1.2.1.7-.2 1.3z"/></svg>`;

function tarjeta(p) {
  const art = document.createElement("article");
  art.className = "ficha";

  const fam = familiaDe(p);
  const precio = Math.min(...p.tamanos.map(t => t.precio));
  const ml = p.tamanos.map(t => `${t.ml} ml`).join(" · ");
  const mensaje =
    `Hola, me interesa ${p.nombre}` + (p.marca ? ` de ${p.marca}` : "") +
    `. ¿Lo tienen disponible?`;

  const foto = p.imagen
    ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy">`
    : `<span class="ficha-inicial">${iniciales(p.nombre)}</span>`;

  art.innerHTML = `
    <div class="ficha-foto">
      ${foto}
      <span class="etiqueta">${CATEGORIAS[p.categoria] || "Perfume"}</span>
    </div>
    <div class="ficha-cuerpo">
      <p class="ficha-marca">${p.marca || ""}</p>
      <h3 class="ficha-nombre">${p.nombre}</h3>
      <p class="ficha-detalle">${ml} · Sobre pedido</p>
      ${p.notas ? `<p class="familia">
        <svg viewBox="0 0 24 24" aria-hidden="true">${fam.svg}</svg>
        <span>${p.notas}</span>
      </p>` : ""}
      <div class="ficha-pie">
        <p class="precio"><small>Desde</small>${pesos(precio)}</p>
        <a class="circulo" href="${linkWhatsApp(mensaje)}" target="_blank" rel="noopener"
           aria-label="Pedir ${p.nombre} por WhatsApp">${ICONO_WA}</a>
      </div>
    </div>
  `;
  return art;
}

function render() {
  const q = buscador.value.trim().toLowerCase();

  const visibles = perfumes.filter(p => {
    const porCat = categoriaActiva === "todos" || p.categoria === categoriaActiva;
    const texto = `${p.nombre} ${p.marca} ${p.notas || ""}`.toLowerCase();
    return porCat && (!q || texto.includes(q));
  });

  rejilla.innerHTML = "";
  visibles.forEach(p => rejilla.appendChild(tarjeta(p)));

  vacio.hidden = visibles.length > 0;
  conteo.textContent = visibles.length === 1
    ? "1 perfume"
    : `${visibles.length} perfumes`;
}

pildoras.forEach(chip => {
  chip.addEventListener("click", () => {
    pildoras.forEach(c => {
      c.classList.remove("activa");
      c.setAttribute("aria-selected", "false");
    });
    chip.classList.add("activa");
    chip.setAttribute("aria-selected", "true");
    categoriaActiva = chip.dataset.cat;
    render();
  });
});

buscador.addEventListener("input", render);

const saludo = "Hola, vengo de la página de Coco y Cuero. Quisiera preguntar por un perfume.";
["wa-portada", "wa-originales", "wa-pie"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.href = linkWhatsApp(saludo);
    el.target = "_blank";
    el.rel = "noopener";
  }
});
const ig = document.getElementById("ig-pie");
if (ig) ig.href = CONFIG.instagram;
const fb = document.getElementById("fb-pie");
if (fb) fb.href = CONFIG.facebook;

const anio = document.getElementById("anio");
if (anio) anio.textContent = new Date().getFullYear();

fetch("data/perfumes.json")
  .then(r => { if (!r.ok) throw new Error("catálogo"); return r.json(); })
  .then(data => { perfumes = data; render(); })
  .catch(err => {
    console.error(err);
    conteo.textContent = "";
    vacio.hidden = false;
    vacio.textContent =
      "No pudimos cargar el catálogo en este momento. Escríbenos por WhatsApp y te ayudamos.";
  });
