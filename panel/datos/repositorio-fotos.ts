import { BUCKET_FOTOS } from "../../compartido/config";
import type { RepositorioFotos } from "./contratos";
import { traducirError } from "./errores";
import { supabase } from "./supabase";

export class RepositorioFotosSupabase implements RepositorioFotos {
  async subir(archivo: Blob, ruta: string): Promise<string> {
    const almacen = supabase().storage.from(BUCKET_FOTOS);
    const { error } = await almacen.upload(ruta, archivo, {
      contentType: archivo.type,
      // cada foto tiene nombre único, así que puede guardarse en caché un año
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) {
      if (/row-level security|unauthorized|403/i.test(error.message)) {
        throw traducirError({ code: "42501" });
      }
      if (/exceeded the maximum allowed size|payload too large/i.test(error.message)) {
        throw traducirError({ code: "P0001", message: "La foto pesa más de 2 MB." });
      }
      throw traducirError(error);
    }
    return almacen.getPublicUrl(ruta).data.publicUrl;
  }
}
