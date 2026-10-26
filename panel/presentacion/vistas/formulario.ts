/** Alta y modificación de un perfume: datos, foto, presentaciones y notas. */
import { TIPOS_PERFUME, type PerfumeEditable, type PresentacionEditable } from "../../../compartido/tipos";
import { aEditable, claveDeCategoria, hayCambios, perfumeNuevo } from "../../negocio/catalogo";
import { ErrorDeValidacion, esDeSesion, mensajeDe } from "../../negocio/errores";
import { ganancia, precioSugerido } from "../../negocio/precios";
import { estado, recargar, servicios } from "../estado";
import { ErrorDeFoto, prepararFoto } from "../foto";
import { avisar, campo, conBotonOcupado, fmtPesos, h, marcarErrores, selector, urlDeFoto, vaciar } from "../ui";
import { chipMargen } from "./catalogo";

export function vistaFormulario(
  idTexto: string,
  navegar: (ruta: string) => void,
  alSesionVencida: () => void,
): HTMLElement {
  const catalogos = estado.catalogos!;
  const esNuevo = idTexto === "nuevo";
  const existente = esNuevo ? null : estado.perfumes.find((p) => p.id === Number(idTexto));

  if (!esNuevo && !existente) {
    return h(
      "section",
      { clase: "vista" },
      h("div", { clase: "vacio" }, h("p", null, "Ese perfume no existe o fue borrado."), h("a", { clase: "boton boton-fantasma", href: "#/" }, "Volver al catálogo")),
    );
  }

  const original: PerfumeEditable = existente ? aEditable(existente) : perfumeNuevo(catalogos);
  const actual: PerfumeEditable = structuredClone(original);

  const estadoGuardado = h("p", { clase: "barra-guardar-estado" });
  const botonGuardar = h("button", { clase: "boton boton-primario", type: "submit" }, esNuevo ? "Dar de alta" : "Guardar cambios");

  function tocar() {
    estado.sucio = hayCambios(original, actual);
    estadoGuardado.textContent = estado.sucio ? "Cambios sin guardar" : esNuevo ? "Perfume nuevo" : "Sin cambios";
    estadoGuardado.classList.toggle("pendiente", estado.sucio);
  }

  // ------------------------------------------------------------ datos
  const listaMarcas = h("datalist", { id: "marcas" }, catalogos.marcas.map((m) => h("option", { value: m })));
  const marca = h("input", {
    value: actual.marca,
    list: "marcas",
    autocomplete: "off",
    maxlength: 80,
    al: { input: () => { actual.marca = marca.value; tocar(); } },
  });
  const nombre = h("input", {
    value: actual.nombre,
    maxlength: 120,
    autocomplete: "off",
    al: { input: () => { actual.nombre = nombre.value; tocar(); } },
  });
  const tipo = selector(
    TIPOS_PERFUME.map((t) => ({ valor: t, texto: t })),
    actual.tipo,
    (v) => { actual.tipo = v as PerfumeEditable["tipo"]; tocar(); },
  );
  const genero = selector(
    catalogos.generos.map((g) => ({ valor: String(g.id), texto: g.nombre })),
    String(actual.generoId),
    (v) => { actual.generoId = Number(v); tocar(); },
  );
  const categoria = selector(
    catalogos.categorias.map((c) => ({ valor: String(c.id), texto: c.nombre })),
    String(actual.categoriaId),
    (v) => { actual.categoriaId = Number(v); tocar(); pintarPresentaciones(); },
  );

  // ------------------------------------------------------------ foto
  const marcoFoto = h("div", { clase: "foto-marco" });
  const entradaFoto = h("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    clase: "solo-lectores",
    al: { change: () => void subirFoto() },
  });
  const botonFoto = h("button", { type: "button", clase: "boton boton-fantasma boton-chico", al: { click: () => entradaFoto.click() } }, "Subir foto");
  const botonQuitarFoto = h(
    "button",
    { type: "button", clase: "enlace", al: { click: () => { actual.imagenUrl = null; pintarFoto(); tocar(); } } },
    "Quitar",
  );

  function pintarFoto() {
    const src = urlDeFoto(actual.imagenUrl);
    vaciar(marcoFoto, src ? h("img", { src, alt: "Foto del perfume" }) : h("p", { clase: "foto-vacia" }, "Sin foto"));
    botonFoto.textContent = src ? "Cambiar foto" : "Subir foto";
    botonQuitarFoto.hidden = !src;
  }

  async function subirFoto() {
    const archivo = entradaFoto.files?.[0];
    entradaFoto.value = "";
    if (!archivo) return;
    try {
      const url = await conBotonOcupado(botonFoto, "Subiendo…", async () => {
        const lista = await prepararFoto(archivo);
        return servicios.catalogo.subirFoto(lista, actual.marca || "perfume", actual.nombre);
      });
      actual.imagenUrl = url;
      pintarFoto();
      tocar();
      avisar("Foto subida. Se verá en el sitio al guardar.", "exito");
    } catch (e) {
      avisar(e instanceof ErrorDeFoto ? e.message : mensajeDe(e), "error");
      if (esDeSesion(e)) alSesionVencida();
    }
  }

  const publicado = h("input", {
    type: "checkbox",
    role: "switch",
    checked: actual.publicado,
    al: { change: () => { actual.publicado = publicado.checked; textoPublicado.textContent = publicado.checked ? "En venta en el sitio" : "De baja (no se ve)"; tocar(); } },
  });
  const textoPublicado = h("span", { clase: "interruptor-texto" }, actual.publicado ? "En venta en el sitio" : "De baja (no se ve)");

  // ------------------------------------------------------------ presentaciones
  const cuerpoPresentaciones = h("div", { clase: "presentaciones" });

  const aNumero = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));

  function filaPresentacion(pr: PresentacionEditable, i: number): HTMLElement {
    const salidaMargen = h("div", { clase: "pres-margen" });
    const salidaSugerido = h("div", { clase: "pres-sugerido" });

    const actualizarCalculos = () => {
      const precioValido = Number.isFinite(pr.precioVenta) && pr.precioVenta > 0;
      vaciar(salidaMargen, precioValido ? chipMargen(pr.precioVenta, pr.costo) : h("span", { clase: "chip-margen m-sin-costo" }, "—"));
      const g = precioValido ? ganancia(pr.precioVenta, pr.costo) : null;
      if (g !== null) salidaMargen.append(h("span", { clase: "pres-ganancia" }, `${fmtPesos(g)} por pieza`));

      if (pr.costo !== null && pr.costo > 0) {
        const sugerido = precioSugerido(pr.costo, claveDeCategoria(catalogos, actual.categoriaId));
        vaciar(
          salidaSugerido,
          sugerido === pr.precioVenta
            ? h("span", { clase: "pres-sugerido-ok" }, "Precio de fórmula")
            : h(
                "button",
                {
                  type: "button",
                  clase: "enlace",
                  al: { click: () => { pr.precioVenta = sugerido; precio.value = String(sugerido); actualizarCalculos(); tocar(); } },
                },
                `Usar sugerido ${fmtPesos(sugerido)}`,
              ),
        );
      } else {
        vaciar(salidaSugerido, h("span", { clase: "pres-sugerido-nada" }, "Pon el costo para sugerir precio"));
      }
    };

    const ml = h("input", {
      type: "number", inputmode: "numeric", min: 1, max: 1000, step: 1, value: Number.isFinite(pr.ml) ? pr.ml : "",
      al: { input: () => { pr.ml = aNumero(ml.value); tocar(); } },
    });
    const costo = h("input", {
      type: "number", inputmode: "decimal", min: 0, step: 1, placeholder: "—", value: pr.costo ?? "",
      al: { input: () => { pr.costo = costo.value.trim() === "" ? null : Number(costo.value); actualizarCalculos(); tocar(); } },
    });
    const precio = h("input", {
      type: "number", inputmode: "decimal", min: 0, step: 10, value: pr.precioVenta > 0 ? pr.precioVenta : "",
      al: { input: () => { pr.precioVenta = aNumero(precio.value); actualizarCalculos(); tocar(); } },
    });

    const quitar = h(
      "button",
      {
        type: "button",
        clase: "boton-icono",
        title: "Quitar presentación",
        "aria-label": `Quitar presentación de ${pr.ml} ml`,
        disabled: actual.presentaciones.length === 1,
        al: { click: () => { actual.presentaciones.splice(i, 1); pintarPresentaciones(); tocar(); } },
      },
      "×",
    );

    actualizarCalculos();
    return h(
      "div",
      { clase: "pres-fila" },
      campo("ml", ml, { nombre: `presentacion.${i}.ml` }),
      campo("Costo proveedor", costo, { nombre: `presentacion.${i}.costo` }),
      campo("Precio de venta", precio, { nombre: `presentacion.${i}.precio` }),
      h("div", { clase: "pres-calculos" }, salidaMargen, salidaSugerido),
      quitar,
    );
  }

  function pintarPresentaciones() {
    vaciar(cuerpoPresentaciones, ...actual.presentaciones.map(filaPresentacion));
  }

  const agregarPresentacion = h(
    "button",
    {
      type: "button",
      clase: "boton boton-fantasma boton-chico",
      al: {
        click: () => {
          const usados = new Set(actual.presentaciones.map((p) => p.ml));
          const ml = [100, 50, 30, 200, 10].find((m) => !usados.has(m)) ?? 100;
          actual.presentaciones.push({ ml, precioVenta: 0, costo: null });
          pintarPresentaciones();
          tocar();
        },
      },
    },
    "+ Otra presentación",
  );

  // ------------------------------------------------------------ notas
  const familias = new Map<string, typeof catalogos.notas>();
  for (const n of catalogos.notas) {
    const f = n.familia ?? "Otras";
    familias.set(f, [...(familias.get(f) ?? []), n]);
  }
  const notas = h(
    "div",
    { clase: "notas" },
    [...familias].map(([familia, lista]) =>
      h(
        "fieldset",
        { clase: "familia" },
        h("legend", null, familia),
        lista.map((n) => {
          const b = h(
            "button",
            {
              type: "button",
              clase: "nota",
              "aria-pressed": String(actual.notas.includes(n.id)),
              al: {
                click: () => {
                  const i = actual.notas.indexOf(n.id);
                  if (i >= 0) actual.notas.splice(i, 1);
                  else actual.notas.push(n.id);
                  b.setAttribute("aria-pressed", String(i < 0));
                  tocar();
                },
              },
            },
            n.nombre,
          );
          return b;
        }),
      ),
    ),
  );

  // ------------------------------------------------------------ guardar
  async function guardar(e: Event) {
    e.preventDefault();
    marcarErrores(formulario, []);
    try {
      const id = await conBotonOcupado(botonGuardar, "Guardando…", async () => {
        const id = await servicios.catalogo.guardar(actual);
        await recargar();
        return id;
      });
      estado.sucio = false;
      avisar(esNuevo ? `${actual.nombre} quedó dado de alta.` : "Cambios guardados.", "exito");
      // se vuelve a pintar con lo que quedó en la base
      navegar(`#/perfume/${id}`);
    } catch (err) {
      if (err instanceof ErrorDeValidacion) {
        marcarErrores(formulario, err.problemas);
        avisar("Revisa los campos marcados.", "error");
      } else {
        avisar(mensajeDe(err), "error");
        if (esDeSesion(err)) alSesionVencida();
      }
    }
  }

  const formulario: HTMLFormElement = h(
    "form",
    { clase: "vista formulario", novalidate: true, al: { submit: (e) => void guardar(e) } },
    h(
      "header",
      { clase: "vista-cabecera" },
      h(
        "div",
        null,
        h("a", { clase: "volver", href: "#/" }, "← Catálogo"),
        h("h1", null, esNuevo ? "Nuevo perfume" : `${original.marca} ${original.nombre}`),
      ),
    ),
    h(
      "div",
      { clase: "formulario-rejilla" },
      h(
        "div",
        { clase: "formulario-principal" },
        h(
          "section",
          { clase: "panel" },
          h("h2", null, "Datos"),
          h(
            "div",
            { clase: "campos-2" },
            campo("Marca", marca, { nombre: "marca", ayuda: "Si es nueva, se crea al guardar." }),
            campo("Nombre", nombre, { nombre: "nombre" }),
          ),
          h(
            "div",
            { clase: "campos-3" },
            campo("Género", genero, { nombre: "genero" }),
            campo("Categoría", categoria, { nombre: "categoria" }),
            campo("Tipo", tipo, { nombre: "tipo" }),
          ),
          listaMarcas,
        ),
        h(
          "section",
          { clase: "panel", dataset: { campo: "presentaciones" } },
          h(
            "div",
            { clase: "panel-cabecera" },
            h("h2", null, "Presentaciones y precio"),
            agregarPresentacion,
          ),
          h(
            "p",
            { clase: "panel-ayuda" },
            "El costo es lo que te cobra el proveedor; nunca se muestra en el sitio. Si lo cambias, el anterior queda en el historial.",
          ),
          cuerpoPresentaciones,
          h("p", { clase: "campo-error", role: "alert" }),
        ),
        h(
          "section",
          { clase: "panel" },
          h("h2", null, "Notas olfativas"),
          h("p", { clase: "panel-ayuda" }, "Sirven para los filtros por aroma del sitio. Elige las que más se notan."),
          notas,
        ),
      ),
      h(
        "aside",
        { clase: "formulario-lateral" },
        h(
          "section",
          { clase: "panel" },
          h("h2", null, "Foto"),
          marcoFoto,
          h("div", { clase: "foto-acciones" }, botonFoto, botonQuitarFoto, entradaFoto),
          h("p", { clase: "panel-ayuda" }, "Se reduce y comprime sola. Ideal: fondo claro y el frasco completo."),
        ),
        h(
          "section",
          { clase: "panel" },
          h("h2", null, "Estado"),
          h(
            "label",
            { clase: "interruptor" },
            publicado,
            h("span", { clase: "interruptor-pista", "aria-hidden": "true" }),
            textoPublicado,
          ),
        ),
      ),
    ),
    h(
      "div",
      { clase: "barra-guardar" },
      estadoGuardado,
      h("a", { clase: "boton boton-fantasma", href: "#/" }, "Cancelar"),
      botonGuardar,
    ),
  );

  pintarFoto();
  pintarPresentaciones();
  tocar();
  return formulario;
}
