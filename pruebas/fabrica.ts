/** Datos de prueba inventados (nunca costos reales del proveedor). */
import type { Catalogos, Perfume } from "../compartido/tipos";

export const CATALOGOS: Catalogos = {
  generos: [
    { id: 1, clave: "caballero", nombre: "Caballero" },
    { id: 2, clave: "dama", nombre: "Dama" },
    { id: 3, clave: "unisex", nombre: "Unisex" },
  ],
  categorias: [
    { id: 1, clave: "arabes", nombre: "Árabes" },
    { id: 2, clave: "nicho", nombre: "Nicho" },
    { id: 3, clave: "disenador", nombre: "Diseñador" },
  ],
  marcas: ["Marca A", "Marca B"],
  notas: [
    { id: 1, nombre: "Ámbar", familia: "Ámbar y cuero" },
    { id: 2, nombre: "Vainilla", familia: "Dulce y gourmand" },
  ],
};

let siguiente = 1;

export function perfume(parcial: Partial<Perfume> = {}): Perfume {
  const id = parcial.id ?? siguiente++;
  return {
    id,
    marca: "Marca A",
    nombre: `Perfume ${id}`,
    tipo: "EDP",
    generoId: 1,
    categoriaId: 1,
    imagenUrl: "https://ejemplo.mx/foto.webp",
    publicado: true,
    notas: [],
    descripcion: null,
    actualizadoEn: "2026-10-26T00:00:00Z",
    presentaciones: [{ id: id * 10, ml: 100, precioVenta: 1000, costo: 500 }],
    ...parcial,
  };
}
