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

**Resultado esperado: 34 de 34 en OK.** Si alguna dice FALLA, no publiques el cambio.

## Números

| | |
| --- | --- |
| Tablas propias | 13 |
| Perfumes cargados | 53 |
| Precios por debajo del costo | 0 |
| Margen promedio sobre costo real | 47% |
| Pruebas de seguridad | 34 de 34 |
| Avisos de seguridad de Supabase | 0 |
