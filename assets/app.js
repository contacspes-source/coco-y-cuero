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

const CATEGORIAS = {
  arabes: "Árabe",
  nicho: "Nicho",
  disenador: "Diseñador"
};

const grid = document.getElementById("grid");
const vacio = document.getElementById("vacio");
const conteo = document.getElementById("conteo");
const buscador = document.getElementById("buscador");
const chips = document.querySelectorAll(".chip");

let perfumes = [];
let categoriaActiva = "todos";

const pesos = n =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(n);

function linkWhatsApp(texto) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`;
}

function iniciales(nombre) {
  return nombre
    .replace(/EJEMPLO\s*—\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0] || "")
    .join("")
    .toUpperCase();
}

function tarjeta(p) {
  const art = document.createElement("article");
  art.className = "card";

  const precioMin = Math.min(...p.tamanos.map(t => t.precio));
  const mensaje =
    `Hola, me interesa ${p.nombre}` +
    (p.marca ? ` de ${p.marca}` : "") +
    `. ¿Lo tienen disponible y en qué tamaños?`;

  const imagen = p.imagen
    ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy">`
    : iniciales(p.nombre);

  art.innerHTML = `
    <div class="card-img">
      ${imagen}
      <span class="badge">${CATEGORIAS[p.categoria] || "Perfume"} · Sobre pedido</span>
    </div>
    <div class="card-body">
      <p class="card-brand">${p.marca || ""}</p>
      <h3 class="card-name">${p.nombre}</h3>
      ${p.notas ? `<p class="card-notes">${p.notas}</p>` : ""}
      <div class="card-sizes">
        ${p.tamanos
          .map(t => `<span class="size">${t.ml} ml · <strong>${pesos(t.precio)}</strong></span>`)
          .join("")}
      </div>
      <a class="card-cta" href="${linkWhatsApp(mensaje)}" target="_blank" rel="noopener">
        Pedir por WhatsApp →
      </a>
    </div>
  `;

  art.dataset.precio = precioMin;
  return art;
}

function render() {
  const q = buscador.value.trim().toLowerCase();

  const visibles = perfumes.filter(p => {
    const coincideCat = categoriaActiva === "todos" || p.categoria === categoriaActiva;
    const texto = `${p.nombre} ${p.marca} ${p.notas || ""}`.toLowerCase();
    const coincideBusqueda = !q || texto.includes(q);
    return coincideCat && coincideBusqueda;
  });

  grid.innerHTML = "";
  visibles.forEach(p => grid.appendChild(tarjeta(p)));

  vacio.hidden = visibles.length > 0;
  conteo.textContent =
    visibles.length === 1
      ? "1 perfume en el catálogo"
      : `${visibles.length} perfumes en el catálogo`;
}

chips.forEach(chip => {
  chip.addEventListener("click", () => {
    chips.forEach(c => {
      c.classList.remove("is-active");
      c.setAttribute("aria-selected", "false");
    });
    chip.classList.add("is-active");
    chip.setAttribute("aria-selected", "true");
    categoriaActiva = chip.dataset.cat;
    render();
  });
});

buscador.addEventListener("input", render);

// Enlaces generales
const saludo = "Hola, vengo de la página de Coco y Cuero. Quisiera preguntar por un perfume.";
["wa-general", "wa-footer"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.href = linkWhatsApp(saludo);
    el.target = "_blank";
    el.rel = "noopener";
  }
});
const ig = document.getElementById("ig-footer");
if (ig) ig.href = CONFIG.instagram;
const fb = document.getElementById("fb-footer");
if (fb) fb.href = CONFIG.facebook;

const anio = document.getElementById("anio");
if (anio) anio.textContent = new Date().getFullYear();

// Carga del catálogo
fetch("data/perfumes.json")
  .then(r => {
    if (!r.ok) throw new Error("No se pudo cargar el catálogo");
    return r.json();
  })
  .then(data => {
    perfumes = data;
    render();
  })
  .catch(err => {
    console.error(err);
    conteo.textContent = "";
    vacio.hidden = false;
    vacio.textContent =
      "No pudimos cargar el catálogo en este momento. Escríbenos por WhatsApp y te ayudamos.";
  });
