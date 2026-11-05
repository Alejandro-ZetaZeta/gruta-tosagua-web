# La Gruta · Sistema de anuncios por megafonía

Portal del cliente con cuentas + panel de la encargada + reproductor local. Astro 7 (SSR, Node), Tailwind v4, InsForge (Postgres/Storage) y Edge TTS.

## Qué incluye

- **Landing pública** (`/`): presentación, precio, categorías y un solo acceso (`/login`) que lleva al cliente a su cuenta y a la encargada al panel.
- **Portal del cliente** (`/cuenta`): registro, login, dashboard con sus pedidos y wizard de 4 pasos en `/cuenta/nuevo`; seguimiento público en `/seguimiento`.
- **Panel de la encargada** (`/panel`): pausa maestra, KPIs, cola por urgencia, revisión con chequeos deterministas, edición del guion, escucha del TTS, aprobación y programación, cierre del día, historial y ajustes.
- **Backend** (InsForge): tablas, enums, RLS sin acceso público, límite de 120 s por tanda en la base, ACK atómico que descuenta el saldo.
- **Reproductor local** (`player-daemon/`): offline-first con SQLite, predescarga, reintento y confirmación al servidor.

## Puesta en marcha

Requisitos: Node 22.5+ (probado en Node 26), proyecto InsForge vinculado (`.insforge/project.json`).

```bash
npm install
npx @insforge/cli db migrations up --all
npm run dev
```

El proyecto ya trae `.env.local` configurado en este equipo. Si clona el repositorio en otro lado, cópielo de `.env.example` y complete las claves. No suba `.env.local` al repositorio.

### Cuentas y roles

Los usuarios viven en `auth.users`; el rol vive en la tabla `public.profiles` (`ADMIN` o `CLIENT`). **Toda cuenta nueva nace como `CLIENT`** y no puede entrar al panel. Solo `ADMIN` accede.

Clientes y encargada usan **el mismo acceso `/login`**: si el perfil es `ADMIN` va a `/panel`; si es `CLIENT` va a `/cuenta`. Los clientes se registran en `/cuenta/registro` (nombre, correo, teléfono y contraseña); sus pedidos quedan vinculados a su cuenta (`orders.user_id`).

### Sesiones y tokens

La app no guarda los JWT de InsForge en el navegador. El login, el registro, Google y la verificación de correo crean una **sesión opaca en `public.user_sessions`**. La cookie (`__Host-gruta_session` en producción) es `HttpOnly`, `SameSite=Lax` y `Secure`; no contiene correo ni datos. Al cerrar sesión se borra la fila, así que el token deja de servir aunque alguien lo haya copiado. Las sesiones de cliente duran 7 días; las de `ADMIN`, 24 horas. Al recuperar la contraseña se borran todas las sesiones de ese correo.

Los access/refresh tokens que devuelve InsForge se descartan al terminar el login. Es deliberado: InsForge no ofrece revocación de refresh tokens del lado del servidor para clientes server/mobile (su logout solo limpia cookies del navegador). Por eso la sesión de la app no depende de ellos.

La verificación por correo está **activa** con método de código y SMTP configurado. La app tiene `/cuenta/verificar` con seis casillas para el código y reenvío; las cuentas nuevas terminan ahí y, si una cuenta sin verificar intenta entrar, se abre esa pantalla automáticamente. Si cambia SMTP desde el panel, actualice también `[auth.smtp]` en `insforge.toml` antes de `npx @insforge/cli config apply`, o ese comando lo desactivará.

La recuperación de contraseña usa `/cuenta/recuperar` y `/cuenta/restablecer` con código de 6 dígitos (también requiere SMTP). El seguimiento (`/seguimiento`) y la subida de comprobantes ahora requieren sesión y solo aceptan pedidos de la propia cuenta. Los pedidos anteriores a `orders.user_id` se pueden asignar a una cuenta actualizando ese campo; `GRU-1006` ya quedó vinculado a la cuenta CLIENT no verificada de Andy.

Para crear una cuenta nueva y dejarla como ADMIN:

```bash
npm run create-admin
```

Si la cuenta ya existe (por ejemplo, creada a mano en la sección Auth de InsForge), promuédala sin crear otra:

```bash
npm run promote-admin
```

Ambos scripts usan `ADMIN_EMAIL` de `.env.local` como correo sugerido. La cuenta manual `tosaguagruta@gmail.com` ya quedó promovida a `ADMIN`.

### Primer uso

1. Entre en `/login` con su cuenta `ADMIN`; le llevará a `/panel`. Si la creó a mano, promuédala antes con `npm run promote-admin`.
2. Abra `/panel/ajustes` y cambie los datos bancarios y el teléfono de ayuda (vienen de ejemplo).
3. Revise el horario (07:00–18:30, corte 16:30, tanda cada 30 min).
4. Cree una cuenta de cliente en `/cuenta/registro`, pida un anuncio y confirme que aparece en `/cuenta` y en `/panel`.
5. Arranque el reproductor (`player-daemon/README.md`) y confirme que descarga y emite.

## Servicios de IA

- **Texto y lectura de comprobantes**: opcional. Sin `OPENROUTER_API_KEY`, el sistema usa una redacción local simple y marca el comprobante como `Lectura manual requerida`. Nunca bloquea al cliente. Con clave, configure `OPENROUTER_TEXT_MODEL` y `OPENROUTER_VISION_MODEL`.
- **Voz**: Edge TTS (gratis, sin clave, voces neuronales en español). El audio se guarda en el bucket privado `audios`.
- La IA **nunca** aprueba un pago. Los chequeos de monto/código/cuenta/referencia son deterministas y la encargada decide.

## Base de datos

Migraciones: `migrations/`. Tablas: `orders`, `payments`, `schedule_slots`, `emissions_log`, `system_settings`, `profiles`, `user_sessions`, `rate_limits`.
- `profiles.role` (`ADMIN`/`CLIENT`), `profiles.phone` y `orders.user_id` vinculan cuentas con pedidos.
- Buckets privados: `receipts`, `audios`.
- RLS activo en todo; `anon` y `authenticated` no tienen acceso. El servidor usa la API key de administración (solo en `.env.local`).
- `record_emission()` marca la tanda, registra la emisión y descuenta el saldo en una sola transacción.
- La capacidad de 120 s por tanda se valida con un trigger.
- `rate_limits` + `consume_rate_limit()` aplican límites persistentes por IP y acción; sobreviven reinicios.
- La CSP de Astro hashea los scripts y estilos inline; los `style=` se permiten solo en `style-src-attr`.

## Despliegue

```bash
npm run build
npm start
```

Variables requeridas en el servidor: `INSFORGE_URL`, `INSFORGE_API_KEY`, `INSFORGE_ANON_KEY`, `PLAYER_TOKEN`, `PUBLIC_SITE_URL`. Recomendada: `UTC_OFFSET_MIN` (-300 para Ecuador; se usa para mostrar fechas/horas). Opcionales: `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`, `OPENROUTER_VISION_MODEL`. `ADMIN_EMAIL` solo lo usan los scripts de administración como correo sugerido; no autoriza a nadie por sí solo.

En producción, `PUBLIC_SITE_URL` debe ser el dominio HTTPS real (por ejemplo `https://lagruta.org`). Se usa para validar el Host y confiar en `X-Forwarded-For` detrás de Nginx/Caddy; sin él, todos los clientes podrían compartir el mismo límite de intentos por IP.

El sitio necesita HTTPS para que la cámara del teléfono funcione (o `localhost` en pruebas). El reproductor usa la URL pública del sitio.

## Límites conocidos / pendientes

Ver `TODO.md`.

## Estructura

```
src/
  actions/          Server Actions (zod)
  components/       UI Astro
  layouts/          Base y panel
  lib/              InsForge, sesión, tiempo, tipos
  lib/profiles.ts   Perfil y rol (ADMIN/CLIENT)
  lib/services/     Pedidos, pagos, planificador, TTS, IA, estadísticas
  pages/            Landing, cuenta/*, panel/*, API del reproductor
  styles/global.css Tokens + componentes (Tailwind v4)
migrations/         SQL de InsForge
player-daemon/      Servicio local (Node + node:sqlite)
scripts/            Utilidades (crear encargada)
```
