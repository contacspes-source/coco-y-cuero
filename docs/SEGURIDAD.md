# Seguridad · Coco & Cuero

Este documento explica **de qué nos protegemos, cómo, y qué tienes que
configurar tú** fuera del código (Supabase y Cloudflare). Léelo completo
antes de que alguien pruebe la página, y vuelve a él cada vez que toques
algo de cuentas, permisos o la base.

| Sección | Para qué |
| --- | --- |
| [1. Cómo está armada la seguridad](#1-cómo-está-armada-la-seguridad) | Entender el diseño |
| [2. Amenazas y qué las frena](#2-amenazas-y-qué-las-frena) | Saber qué cubre cada control |
| [3. Configuración obligatoria](#3-configuración-obligatoria-fuera-del-código) | **Checklist** de Supabase y Cloudflare |
| [4. Cómo probarla](#4-cómo-probarla-guion-para-quien-haga-el-pentest) | Guion para quien la pruebe |
| [5. Qué NO está cubierto](#5-qué-no-está-cubierto-todavía) | Límites conocidos |
| [6. Si pasa algo](#6-si-pasa-algo) | Qué hacer ante un incidente |

---

## 1. Cómo está armada la seguridad

La idea central: **el navegador no es de confianza**. Todo lo que corre
en el sitio y en el panel (TypeScript) lo puede leer y modificar quien
quiera con la consola del navegador. Por eso ninguna regla importante
vive ahí; viven en la base de datos (PostgreSQL en Supabase).

```
 Navegador (sitio / panel)        Supabase                          
 ┌──────────────────────┐        ┌──────────────────────────────┐
 │ validaciones de UX   │  JWT   │ Auth: contraseñas, correos,  │
 │ (ahorran una llamada,│ ─────► │       CAPTCHA, rate limits   │
 │  no protegen nada)   │        ├──────────────────────────────┤
 │                      │        │ RLS: qué FILAS ve cada quien │
 │ llave publicable     │        │ GRANT: qué COLUMNAS escribe  │
 │ (es pública, no es   │        │ CHECK: topes y formatos      │
 │  un secreto)         │        │ Funciones: precio, estado,   │
 └──────────────────────┘        │   rol y descuento los fija   │
                                 │   la base, nunca el cliente  │
                                 └──────────────────────────────┘
```

Tres capas, de afuera hacia adentro:

1. **Antes de entrar** — Cloudflare Turnstile (CAPTCHA) + límites de
   Supabase Auth + lista de correos desechables. Frenan bots y fuerza
   bruta.
2. **Al entrar** — Supabase Auth emite un JWT. El `rol` (admin/cliente)
   vive en la tabla `cliente`, se asigna por trigger y **ninguna llamada
   de la API puede cambiarlo** (no hay GRANT UPDATE sobre esa columna).
3. **Adentro** — RLS decide fila por fila. Las funciones sensibles
   (`solicitar_pedido`, `guardar_perfume`, `reporte_ventas`…) comprueban
   `privado.es_admin()` o `auth.uid()` por su cuenta.

Las 74 pruebas de `supabase/pruebas/seguridad.sql` son la evidencia de
que esto se cumple. **Córrelas después de cada cambio en la base.**

---

## 2. Amenazas y qué las frena

| # | Amenaza | Qué la frena | Dónde está | Probado por |
| --- | --- | --- | --- | --- |
| A1 | **Registro masivo de cuentas** con un script (el caso de `@mailinator.com`) | CAPTCHA obligatorio en `signUp` (Supabase rechaza sin token) · límite de correos por hora de Supabase · correos desechables rechazados | `compartido/captcha.ts`, migración 015 (hook + trigger) | SQL 69–71 · `cuenta.test.ts` |
| A2 | **Fuerza bruta al panel** (adivinar la contraseña del admin) | CAPTCHA en login (un token por intento; es la barrera real: Supabase **no** limita por IP el login con contraseña) · contraseña larga con letras y números · protección de contraseñas filtradas (configurar, §3) | `panel/.../acceso.ts`, `compartido/contrasena.ts` | `servicios.test.ts` |
| A3 | **Hacerse admin** desde la API (`update cliente set rol='admin'`, o mandar `rol` en los metadatos del registro) | No hay GRANT UPDATE sobre `rol`; el trigger de registro ignora los metadatos para el rol | migración 004 | SQL 7, 12 |
| A4 | **Entrar al panel con cuenta de cliente** | El panel cierra la sesión si `rol ≠ admin`; y aunque no lo hiciera, RLS no deja leer costos, clientes ni pedidos ajenos | `ServicioSesion.entrar` + RLS | `servicios.test.ts` · SQL 14–17, 27–29, 48, 63 |
| A5 | **Leer datos ajenos** (clientes, pedidos, costos, notas internas) | RLS por fila; `anon` ni siquiera tiene SELECT en esas tablas; vistas con `security_invoker` | migraciones 004, 007, 011, 014 | SQL 3–4, 11–16, 43, 45–46, 61–62 |
| A6 | **Manipular precios o descuentos** desde el navegador | `solicitar_pedido` toma el precio de la base e ignora cualquier precio que mande el cliente; el 10 % lo calcula la base y nunca baja del costo | migración 013 | SQL 41, 54, 57 |
| A7 | **Llenar la base de basura** (textos de megabytes, miles de pedidos) | CHECK de longitud en nombre/dirección/ciudad/notas; metadatos recortados al registrarse; máximo 5 solicitudes abiertas por cuenta | migración 015, 011 | SQL 44, 72–74 |
| A8 | **XSS** (meter `<script>` en un nombre de perfume o de cliente) | Todo el DOM se crea con `h()` y `textContent`; `innerHTML` solo se usa con íconos SVG fijos del código. CSP estricta en el panel | `compartido/dom.ts`, `_headers` | revisión de código (ver §4.6) |
| A9 | **Clickjacking** (meter el panel en un iframe) | `X-Frame-Options: DENY` + `frame-ancestors 'none'` en el panel; `SAMEORIGIN` en el sitio | `_headers` | §4.7 |
| A10 | **Saltarse la transición de estados** (consultado → entregado) o revivir cancelados | Trigger `validar_transicion_pedido` | migración 002 | SQL 21, 50 |
| A11 | **Subir archivos maliciosos** al bucket de fotos | Solo admin sube; bucket limitado a jpg/png/webp y 2 MB; el Worker solo sirve nombres `[a-z0-9._-]` con extensión de imagen y `Content-Type: image/*` | migración 008, `worker/manejador.ts` | SQL 29 · `worker.test.ts` |
| A12 | **Abusar del Worker** (`/api/catalogo`, `/fotos/*`) como proxy | Solo GET/HEAD; solo dos rutas; nombre de foto validado (nada de `../`); timeouts; solo la llave publicable | `worker/manejador.ts` | `worker.test.ts` |
| A13 | **Robo de la llave de servicio** | No existe en el repositorio ni en el Worker. Solo vive en el dashboard de Supabase | `supabase/README.md` | `grep service_role` → 0 resultados en código |
| A14 | **Enlaces de correo falsos** (redirigir el "confirma tu cuenta" a otro sitio) | Supabase solo redirige a las URL de su lista blanca (configurar, §3) | Supabase → URL Configuration | manual |
| A15 | **Dependencias con vulnerabilidades** | Versiones fijas en `package.json`; `npm audit` (ver §4.8) | `package.json` | manual |

---

## 3. Configuración obligatoria fuera del código

El código ya está listo, pero **nada de esto protege hasta que lo
actives**. Hazlo en este orden y marca cada punto.

### 3.1 Cloudflare Turnstile (CAPTCHA)

1. Cloudflare → **Turnstile** → *Add widget*.
   - Nombre: `cocoycuero`. Dominio: `cocoycuero.com` (agrega `localhost`
     si quieres probar en tu computadora).
   - Modo: **Managed**. Deja "Pre-clearance" apagado.
2. Copia la **Site Key** y pégala en `compartido/config.ts` →
   `TURNSTILE_SITE_KEY`. Haz commit.
3. Copia la **Secret Key** (esta NUNCA va al repositorio) y ve a
   Supabase → **Authentication → Attack Protection → Enable Captcha
   protection** → Provider *Turnstile* → pega el secreto → Save.

El código ya trae la site key del widget `cocoycuero`
(`0x4AAAAAAFxMSyW4m0gHngeW`). Hasta que pegues el secreto en Supabase
(paso 3), el widget aparece pero Supabase no lo exige: **no protege
nada**. Y si algún día cambias el widget en Cloudflare, cambia las dos
llaves juntas; con una site key y un secreto que no son pareja, **nadie
puede entrar ni registrarse**.

> Si quieres apagar el CAPTCHA temporalmente (por ejemplo para una demo
> local), pon `TURNSTILE_SITE_KEY = ""` **y** desactiva *Enable Captcha
> protection* en Supabase. Nunca lo apagues en producción.

### 3.2 Supabase → Authentication

| Dónde | Qué poner | Por qué |
| --- | --- | --- |
| **Providers → Email → Confirm email** | Activado | Sin confirmar, cualquiera registra correos ajenos |
| **Providers → Email → Minimum password length** | `8` | Igual que el código |
| **Providers → Email → Password requirements** | *Letters and digits* | Igual que el código |
| **Attack Protection → Leaked password protection** | Activado | Rechaza contraseñas que ya aparecieron en filtraciones (HaveIBeenPwned). Protege sobre todo tu cuenta de admin |
| **Attack Protection → Enable Captcha protection** | Turnstile + secreto (§3.1) | Frena registro masivo y fuerza bruta |
| **Rate Limits** | Revisa que *Emails sent per hour* no sea más alto de lo que necesitas (30/h con SMTP propio está bien). Ojo: Supabase **no** limita por IP el registro ni el login con correo y contraseña; solo limita cuántos correos manda por hora y los inicios anónimos | Es la segunda barrera para el registro masivo (cada registro manda un correo). Para el login, la única barrera es el CAPTCHA |
| **URL Configuration → Site URL** | `https://cocoycuero.com` | A dónde vuelven los enlaces de correo |
| **URL Configuration → Redirect URLs** | `https://cocoycuero.com/`, `https://cocoycuero.com/panel/` (y `http://localhost:5174/`, `http://localhost:5173/panel/` para desarrollo) | Supabase **solo** redirige a estas; un enlace manipulado a otro dominio se ignora (A14) |
| **Hooks → Before User Created** | *Enable* → Postgres → esquema `public` → función `hook_antes_de_crear_usuario` | Rechaza correos desechables con un mensaje claro **antes** de crear la cuenta. (Si no lo activas, el trigger de la migración 015 los rechaza igual, pero el mensaje es genérico) |
| **Emails → SMTP** | Tu propio SMTP (Resend, Brevo…) | El correo de Supabase solo manda a tu equipo y tiene límite muy bajo; sin esto los clientes no reciben la confirmación |

### 3.3 Aplicar la migración 015

Supabase → SQL Editor → pega
`supabase/migrations/20261102000000_015_endurecimiento_registro.sql` →
Run. Luego pega `supabase/pruebas/seguridad.sql` → Run → **74 de 74 en
OK**.

Después revisa Supabase → **Advisors → Security**: debe seguir sin
avisos nuevos (los tres `SECURITY DEFINER` conocidos están explicados en
`supabase/README.md`).

### 3.4 Cloudflare (dominio)

| Dónde | Qué |
| --- | --- |
| SSL/TLS → Overview | **Full (strict)** |
| SSL/TLS → Edge Certificates | *Always Use HTTPS*: on. *HSTS*: ya va en `_headers`; aquí puedes dejarlo apagado o igual |
| Security → Bots | *Bot Fight Mode*: on (gratis) |
| Security → WAF → Rate limiting rules (opcional) | Regla: si una IP hace más de 60 peticiones a `/api/catalogo` en 1 minuto → *Managed Challenge* durante 1 h. Las llamadas a Auth van directo a `*.supabase.co`, así que esta regla no las cubre: de eso se encarga Turnstile |

### 3.5 Tu cuenta de administrador

- Contraseña **larga y única** (un gestor de contraseñas; 16+ caracteres).
  Es la llave de todo el negocio.
- Tu correo de admin tampoco debe ser el que usas para todo; si ese
  buzón cae, cae el panel (por "olvidé mi contraseña").
- Revisa de vez en cuando Supabase → Authentication → Users: si ves
  cuentas que no reconoces y nunca compraron, bórralas.
- **No compartas la llave `service_role` con nadie ni la pegues en
  ningún chat.** Si lo hiciste alguna vez: Supabase → Settings → API →
  *Reset* / rotate.

---

## 4. Cómo probarla (guion para quien haga el pentest)

Entrega esta sección a quien vaya a probar la página. Cada punto dice
qué intentar y **qué debería pasar**. Si pasa otra cosa, es un hallazgo.

Herramientas que bastan: el navegador, su consola (F12) y `curl`.
Datos públicos que pueden usar:

```
SUPABASE_URL  = https://hsdthxlymeldxcoolmar.supabase.co
APIKEY        = sb_publishable_ZROgURMmmu34nTvF3uJrew_Qy_j9RRS   (es pública por diseño)
```

### 4.1 Registro masivo (A1)

```bash
# intentar crear una cuenta sin pasar por el sitio
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  -d '{"email":"bot1@gmail.com","password":"Prueba1234"}'
```
- **Esperado:** error que mencione `captcha` (`captcha verification
  process failed`). Nada se crea.
- Repetir con `"email":"bot@mailinator.com"` **desde el formulario del
  sitio** (resolviendo el CAPTCHA): esperado *"No aceptamos correos
  temporales o desechables"*.
- Si el `curl` **crea la cuenta** (responde con un `user`), el CAPTCHA no
  está activo en Supabase: es el hallazgo más grave posible. Parar y
  revisar §3.1.
- Nota para quien prueba: Supabase no limita por IP este endpoint; la
  única barrera es el CAPTCHA (y el tope de correos por hora).

### 4.2 Entrar al panel sin ser admin (A2, A4)

1. Crear una cuenta de cliente normal en el sitio y entrar con ella a
   `https://cocoycuero.com/panel/`. **Esperado:** mensaje *"Esta cuenta
   no es de administrador"* y la sesión se cierra.
2. Con esa sesión de cliente, en la consola del navegador (en el sitio,
   donde sí está la sesión) pedir lo que el panel pide:
   ```js
   const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
   const db = createClient(SUPABASE_URL, APIKEY);
   await db.from("costo_proveedor").select("*");      // esperado: data = []
   await db.from("cliente").select("*");              // esperado: solo SU fila
   await db.from("pedido").select("*");               // esperado: solo SUS pedidos
   await db.rpc("clientes_admin");                    // esperado: error 42501
   await db.rpc("reporte_ventas", { p_desde: "2026-01-01", p_hasta: "2026-12-31" }); // error 42501
   await db.from("cliente").update({ rol: "admin" }).eq("id", 1); // esperado: error "permission denied"
   await db.rpc("guardar_perfume", { p_datos: { marca: "X", nombre: "Y", presentaciones: [{ ml: 100, precio_venta: 1 }] } }); // error 42501
   ```
3. Fuerza bruta: 20 intentos seguidos de login con contraseña
   equivocada en el panel. **Esperado:** cada intento exige resolver un
   CAPTCHA nuevo (el token es de un solo uso). Por `curl` directo a
   `/auth/v1/token?grant_type=password` sin token: error `captcha`.
   Supabase no limita por IP este endpoint, así que si el `curl` sin
   token responde "Invalid login credentials" en vez de un error de
   captcha, el CAPTCHA está apagado: hallazgo grave.

### 4.3 Manipular pedidos y precios (A6, A10)

Con sesión de cliente, desde la consola:
```js
await db.rpc("solicitar_pedido", { p_presentacion_id: 1, p_notas: "x" });  // crea pedido al PRECIO DE LA BASE
await db.from("pedido").insert({ cliente_id: 1, presentacion_id: 1, precio_pactado: 1 }); // esperado: permission denied
await db.from("pedido").update({ precio_pactado: 1, estado: "entregado" }).eq("id", MI_PEDIDO); // esperado: 0 filas / denied
await db.rpc("cancelar_mi_pedido", { p_pedido_id: PEDIDO_DE_OTRO }); // esperado: error "Solo puedes cancelar tus solicitudes"
for (let i = 0; i < 7; i++) await db.rpc("solicitar_pedido", { p_presentacion_id: 1 }); // a partir del 6.º: "Ya tienes 5 solicitudes pendientes"
```

### 4.4 Datos basura (A7)

```js
await db.from("cliente").update({ nombre: "x".repeat(5000) }).eq("auth_user_id", MI_UID);   // esperado: check violation
await db.rpc("solicitar_pedido", { p_presentacion_id: 1, p_notas: "x".repeat(100000) });   // esperado: se guarda recortado a 500
```
Y desde el formulario de registro: nombre de 200 letras → el sitio lo
rechaza antes de mandar; si se fuerza con la API, la base lo recorta a 120.

### 4.5 Leer sin cuenta (A5)

```bash
curl -s "$SUPABASE_URL/rest/v1/cliente?select=*"         -H "apikey: $APIKEY"   # esperado: 401/permission denied
curl -s "$SUPABASE_URL/rest/v1/pedido?select=*"          -H "apikey: $APIKEY"   # igual
curl -s "$SUPABASE_URL/rest/v1/costo_proveedor?select=*" -H "apikey: $APIKEY"   # igual
curl -s "$SUPABASE_URL/rest/v1/catalogo_publico?select=*" -H "apikey: $APIKEY"  # esperado: el catálogo, SIN campo costo
curl -s "$SUPABASE_URL/rest/v1/rpc/mi_descuento_bienvenida" -X POST -H "apikey: $APIKEY" # esperado: denied
```

### 4.6 XSS (A8)

Con la cuenta de admin, poner como nombre de perfume
`<img src=x onerror=alert(1)>` y como descripción `"><script>alert(2)</script>`.
Abrir el sitio y el panel. **Esperado:** se ve el texto tal cual, no
sale ninguna alerta. Hacer lo mismo con el nombre de un cliente y con las
notas de un pedido (desde el sitio) y revisarlo en Panel → Pedidos.

### 4.7 Encabezados y Worker (A9, A11, A12)

```bash
curl -sI https://cocoycuero.com/panel/ | grep -iE "frame|security-policy|strict-transport|nosniff"
curl -sI https://cocoycuero.com/ | grep -iE "strict-transport|frame|nosniff"
curl -s -X POST https://cocoycuero.com/api/catalogo            # esperado: 405
curl -s "https://cocoycuero.com/fotos/../panel/index.html"     # esperado: 400 "Foto no válida"
curl -s "https://cocoycuero.com/fotos/x.svg"                   # esperado: 400 (solo jpg/png/webp)
```

### 4.8 Dependencias (A15)

```bash
npm audit --omit=dev     # esperado: 0 vulnerabilidades en lo que llega al navegador
```

### 4.9 Lo que debe reportar quien pruebe

Para cada hallazgo: qué intentó (comando o pasos exactos), qué esperaba
según este documento, qué obtuvo (captura o respuesta completa), y con
qué cuenta. Sin esos cuatro datos no se puede reproducir.

---

## 5. Qué NO está cubierto (todavía)

Sé honesto con esto al presentarlo; es mejor decirlo que descubrirlo
en la prueba.

| Límite | Por qué | Qué haría falta |
| --- | --- | --- |
| **Sin MFA en el panel** | Supabase lo soporta (TOTP) pero la pantalla de enrolar/verificar no está hecha | ~100 líneas en `panel/`: enrolar con QR al primer login de admin y pedir el código en cada login. Es el siguiente paso recomendado |
| **El sitio público no tiene CSP** | Google Tag Manager inyecta scripts en caliente y una CSP estricta lo rompería; necesita nonces o `'unsafe-inline'` | Empezar con `Content-Security-Policy-Report-Only` y ajustar |
| **Login y registro no tienen límite por IP** | Supabase solo limita correos por hora e inicios anónimos; el navegador habla directo con `*.supabase.co`, así que Cloudflare tampoco los ve | Turnstile es la barrera. Alternativa mayor: enrutar `/auth/*` por el Worker y poner ahí una regla de rate limiting de Cloudflare |
| **Lista de correos desechables es manual** | Son ~60 dominios comunes; aparecen nuevos cada semana | Agregar con `insert into privado.dominio_desechable values ('x.com')` cuando veas uno |
| **Sesiones persisten en `localStorage`** | Es el comportamiento estándar de supabase-js; en una computadora compartida la sesión queda abierta | Usar "Salir" en el panel; pedir una sesión más corta en Supabase → Auth → Sessions (*Time-box user sessions*) |
| **No hay registro de auditoría de acciones del admin** | Solo hay historial de estados de pedido | Tabla `auditoria` con trigger en perfume/presentacion/costo si algún día hay más de un admin |

---

## 6. Si pasa algo

| Señal | Qué hacer, en orden |
| --- | --- |
| Cuentas raras en masa (correos aleatorios, 0 pedidos) | 1) Confirmar que Turnstile está activo en Supabase (§3.1). 2) Supabase → Auth → Users → borrar las cuentas. 3) Agregar el dominio a `privado.dominio_desechable` si es desechable |
| Sospecha de que alguien entró al panel | 1) Supabase → Auth → Users → tu usuario → *Sign out all sessions*. 2) Cambiar tu contraseña. 3) Supabase → Logs → Auth: revisar inicios de sesión recientes (IP, hora). 4) Revisar Panel → Precios y Pedidos por cambios que no hiciste |
| Se filtró la llave `service_role` | Supabase → Settings → API → **rotar de inmediato**. Luego revisar Logs |
| Precio o costo cambiado sin explicación | `costo_proveedor` guarda historial; `pedido_evento` guarda cada cambio de estado con fecha. Compara con lo que recuerdas |
| Supabase o Cloudflare avisan de una vulnerabilidad en una dependencia | `npm audit`, actualizar la versión en `package.json`, correr `npm test`, publicar |

Cualquier cambio que hagas para resolver un incidente: anótalo aquí
abajo con fecha, para que el historial cuente lo que pasó.

### Bitácora

| Fecha | Qué pasó | Qué se hizo |
| --- | --- | --- |
| 2026-10-27 | Registro `goose5699c8e1@mailinator.com`, 0 pedidos: bot probando el formulario | Esta versión: Turnstile en registro/login/recuperar, lista de desechables + hook, topes de longitud, HSTS, contraseña con letras y números en el panel (migración 015, pruebas 69–76) |
