/**
 * Reportes: una sola llamada a reporte_ventas(), que valida en la base
 * que quien pregunta es admin. Aquí solo se traduce de snake_case a los
 * tipos del panel.
 */
import type { FilaReporte, Reporte, ResumenVentas } from "../../compartido/tipos";
import type { RepositorioReportes } from "./contratos";
import { traducirError } from "./errores";
import { supabase } from "./supabase";

type Crudo = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {});

function resumen(v: unknown): ResumenVentas {
  const r = obj(v);
  return {
    ventas: n(r.ventas),
    ingresos: n(r.ingresos),
    costo: n(r.costo),
    margen: n(r.margen),
    descuentos: n(r.descuentos),
    costoEstimado: n(r.costo_estimado),
  };
}

function fila(f: Crudo): FilaReporte {
  return {
    nombre: String(f.nombre ?? "—"),
    ventas: n(f.ventas),
    ingresos: n(f.ingresos),
    margen: f.margen === undefined || f.margen === null ? null : n(f.margen),
  };
}

/** Exportada para probar la traducción sin red. */
export function aReporte(d: Crudo): Reporte {
  const emb = obj(d.embudo);
  const pen = obj(d.pendiente);
  const cli = obj(d.clientes);
  return {
    desde: String(d.desde),
    hasta: String(d.hasta),
    resumen: resumen(d.resumen),
    anterior: resumen(d.anterior),
    porMes: lista(d.por_mes).map((m) => ({ mes: String(m.mes), ventas: n(m.ventas), ingresos: n(m.ingresos), margen: n(m.margen) })),
    topPerfumes: lista(d.top_perfumes).map((t) => ({
      ...fila({ ...t, nombre: t.perfume }),
      perfumeId: n(t.perfume_id),
      marca: String(t.marca ?? ""),
    })),
    porCategoria: lista(d.por_categoria).map(fila),
    porGenero: lista(d.por_genero).map(fila),
    porCiudad: lista(d.por_ciudad).map(fila),
    porCanal: lista(d.por_canal).map((c) => ({
      nombre: String(c.nombre ?? "Sin dato"),
      clientesNuevos: n(c.clientes_nuevos),
      ventas: n(c.ventas),
      ingresos: n(c.ingresos),
    })),
    clientes: { nuevos: n(cli.nuevos), compradores: n(cli.compradores), recurrentes: n(cli.recurrentes) },
    embudo: {
      creados: n(emb.creados),
      consultado: n(emb.consultado),
      apartado: n(emb.apartado),
      comprado: n(emb.comprado),
      entregado: n(emb.entregado),
      cancelado: n(emb.cancelado),
    },
    pendiente: { enCurso: n(pen.en_curso), porCobrar: n(pen.por_cobrar), anticipos: n(pen.anticipos), invertido: n(pen.invertido) },
  };
}

export class RepositorioReportesSupabase implements RepositorioReportes {
  async reporte(desde: string, hasta: string): Promise<Reporte> {
    const r = await supabase().rpc("reporte_ventas", { p_desde: desde, p_hasta: hasta });
    if (r.error) throw traducirError(r.error);
    return aReporte(obj(r.data));
  }
}
