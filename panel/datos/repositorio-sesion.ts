import type { Rol, Usuario } from "../../compartido/tipos";
import type { EventoDeSesion, RepositorioSesion } from "./contratos";
import { ErrorDeDatos, traducirError } from "./errores";
import { supabase } from "./supabase";

export class RepositorioSesionSupabase implements RepositorioSesion {
  async usuarioActual(): Promise<Usuario | null> {
    const { data } = await supabase().auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, correo: u.email ?? "" } : null;
  }

  async rolDe(usuario: Usuario): Promise<Rol | null> {
    // RLS solo deja leer el expediente propio, así que esto no puede
    // revelar el rol de nadie más
    const r = await supabase().from("cliente").select("rol").eq("auth_user_id", usuario.id).maybeSingle();
    if (r.error) throw traducirError(r.error);
    return (r.data?.rol as Rol | undefined) ?? null;
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<Usuario> {
    const { data, error } = await supabase().auth.signInWithPassword({ email: correo, password: contrasena });
    if (error) throw traducirError(error);
    if (!data.user) throw new ErrorDeDatos("credenciales", "No se pudo iniciar sesión.");
    return { id: data.user.id, correo: data.user.email ?? correo };
  }

  async cerrarSesion(): Promise<void> {
    await supabase().auth.signOut();
  }

  async enviarCorreoDeRecuperacion(correo: string, volverA: string): Promise<void> {
    const { error } = await supabase().auth.resetPasswordForEmail(correo, { redirectTo: volverA });
    if (error) throw traducirError(error);
  }

  async cambiarContrasena(nueva: string): Promise<void> {
    const { error } = await supabase().auth.updateUser({ password: nueva });
    if (error) throw traducirError(error);
  }

  alCambiar(escucha: (evento: EventoDeSesion) => void): void {
    supabase().auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") escucha("recuperar-contrasena");
      else if (evento === "SIGNED_IN") escucha("entro");
      else if (evento === "SIGNED_OUT") escucha("salio");
    });
  }
}
