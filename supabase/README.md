# Base de datos · Coco & Cuero

Base del sitio y del panel administrativo. Esquema en PostgreSQL 17 sobre Supabase.

| | |
| --- | --- |
| Proyecto | `coco-y-cuero` |
| URL | `https://hsdthxlymeldxcoolmar.supabase.co` |
| Llave publicable | `sb_publishable_ZROgURMmmu34nTvF3uJrew_Qy_j9RRS` |
| Región | us-west-1 |

## Las llaves

**La llave publicable puede ir en el código del sitio y del panel.** Es pública por diseño: lo que limita qué puede hacer quien la usa son las políticas RLS, y `pruebas/seguridad.sql` comprueba que con ella no se lee ningún costo, cliente ni pedido ajeno.

**La llave de servicio (`service_role`) nunca va en este repositorio.** Se salta todas las políticas. Si alguna vez la subes por accidente, revócala de inmediato en Supabase → Project Settings → API.

## Qué hay aquí

```
supabase/
├─ migrations/   el esquema, en orden; nunca se edita una ya aplicada
└─ pruebas/      pruebas de seguridad que se corren tras cada cambio
```

| Migración | Qué hace |
| --- | --- |
| 001_catalogo | Género, categoría, marca, perfume, presentación, notas y familias |
| 002_clientes_y_pedidos | Cliente, canal de origen, proveedor, costo y pedido, con reglas de estado |
| 003_separar_costo | Saca el costo de `presentacion` para que el sitio público no lo vea |
| 004_seguridad_rls | Políticas por fila, permisos por columna y registro automático de clientes |
| 005_semilla | Catálogos base y los 53 perfumes del proveedor de Guadalajara |
| 006_politicas_por_rol | Corrige un error encontrado en pruebas que habría tumbado el sitio público |
| 007_ajustes_del_auditor | Funciones auxiliares fuera de la API, índice faltante, políticas consolidadas |
| 008_panel_admin | Bucket de fotos, regla precio/costo al confirmar, funciones `guardar_perfume` y `actualizar_precios` |
| 009_restaurar_modo_diferido | Corrige un error de la 008 encontrado en pruebas |
| 010_catalogo_publico | Vista de solo lectura que consume el sitio: publicados, sin costos |
| 011_clientes_y_pedidos | Descripción del perfume, historial de estados, nota interna, vista `pedido_detalle`, funciones para que el cliente aparte y cancele, lista de clientes para el panel |
| 012_presentacion_en_catalogo | La vista pública incluye el id de cada tamaño (lo necesita "Apartar") |
| 013_bienvenida_y_envio | 10 % en la primera compra (lo calcula la base, redondeado a decenas y nunca bajo el costo) y dirección de envío por pedido |
| 014_reportes | Costo real por pedido (`pedido_costo`, solo admin), función `reporte_ventas` y se quita TRUNCATE/TRIGGER/REFERENCES a los roles públicos |

La 003, la 006 y la 009 corrigen errores de las anteriores. Se dejan así a propósito: una migración ya aplicada no se edita, se corrige con otra nueva. Así el historial cuenta lo que realmente pasó.

## Reglas de negocio que vigila la base

La base las hace cumplir aunque el panel tenga un error:

- **Ningún precio por debajo del costo vigente.** Se revisa al confirmar la transacción, así que se puede bajar costo y precio en la misma operación, y subir el costo por encima del precio también se rechaza.
- **Guardar un perfume es todo o nada.** `guardar_perfume` guarda datos, presentaciones, costos y notas en una sola transacción.
- **Cambiar un costo no borra el anterior.** Queda en `costo_proveedor` como historial.
- **Fotos:** cualquiera puede verlas por su URL; solo el administrador sube, reemplaza o borra.
- **Un pedido solo avanza en orden:** consultado → apartado → comprado → entregado. Cualquiera puede pasar a cancelado. Entregado y cancelado ya no cambian.
- **El anticipo no puede ser mayor que el precio pactado.**
- **El número de cliente lo asigna una secuencia** que empieza en 1001. Nunca se repite.
- **Dar de baja un perfume no lo borra.** Se oculta del sitio y conserva sus pedidos.

## Cómo hacerte administrador

Cuando te registres en el panel, tu cuenta se crea como cliente. Para promoverte, en Supabase → SQL Editor:

```sql
update public.cliente set rol = 'admin'
where auth_user_id = (select id from auth.users where email = 'TU_CORREO');
```

Es a propósito que no se pueda hacer desde la aplicación: ni tú ni nadie puede autoasignarse el rol de administrador por la API.

## Pruebas

Pega `pruebas/seguridad.sql` completo en el SQL Editor y ejecútalo. Corre dentro de una transacción que se revierte, así que no deja datos.

**Resultado esperado: 66 de 66 en OK.** Si alguna dice FALLA, no publiques el cambio.

## Números

| | |
| --- | --- |
| Tablas propias | 13 |
| Perfumes cargados | 53 |
| Precios por debajo del costo | 0 |
| Margen promedio sobre costo real | 47% |
| Pruebas de seguridad | 66 de 66 |
| Avisos de seguridad de Supabase | 0 |

## Avisos del auditor que se aceptan a propósito

El auditor de Supabase marca tres funciones `SECURITY DEFINER` que un usuario con sesión puede llamar. Es intencional y está probado:

| Función | Por qué necesita permisos elevados | Qué la protege |
| --- | --- | --- |
| `solicitar_pedido` | El cliente no puede escribir en `pedido` directamente | Toma el precio de la base, fuerza estado "consultado" y anticipo 0, máximo 5 solicitudes abiertas (pruebas 40–44) |
| `cancelar_mi_pedido` | Igual | Solo pedidos propios y solo en "consultado" (pruebas 47, 49, 50) |
| `clientes_admin` | Lee el correo, que vive en `auth.users` | Rechaza a quien no es admin (prueba 48) |
| `reporte_ventas` | Suma costos, que el cliente nunca puede leer | Rechaza a quien no es admin (pruebas 63 y 64) |

## Correos de la cuenta (confirmación y contraseña)

El servicio de correo que trae Supabase **solo envía a los miembros de tu equipo** en Supabase y tiene un límite muy bajo por hora. Para que tus clientes reciban el correo de confirmación hay que conectar un servicio propio (SMTP), por ejemplo Resend o Brevo, con el dominio cocoycuero.com. Mientras no esté, el registro le muestra al cliente un mensaje para pedir por WhatsApp.

Plantilla sugerida (Authentication → Emails → Confirm signup):

```
Asunto: Confirma tu cuenta de Coco & Cuero

<h2>¡Bienvenido a Coco & Cuero!</h2>
<p>Confirma tu correo para apartar perfumes y seguir tus pedidos:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
<p>Si no creaste una cuenta, ignora este correo.</p>
```

Y para Reset password:

```
Asunto: Crea tu contraseña nueva

<p>Pediste cambiar tu contraseña de Coco & Cuero.</p>
<p><a href="{{ .ConfirmationURL }}">Crear contraseña nueva</a></p>
<p>Si no fuiste tú, ignora este correo.</p>
```
