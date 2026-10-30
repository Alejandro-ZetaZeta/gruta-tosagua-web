# AGENTS.md — Sistema de Automatización de Anuncios "La Gruta"

Este documento contiene el contexto de negocio, arquitectura, reglas de dominio y estándares técnicos para los agentes de IA que asisten en el desarrollo de este proyecto. **Lee y respeta estas directrices antes de proponer cambios, generar código o modificar la base de datos.**

\---

## 1\. Contexto del Proyecto y Dominio

"La Gruta" es un espacio comunitario donde se emiten anuncios por megafonía (invitaciones a misas, sepelios, rezos, eventos, saludos). Este sistema digitaliza y automatiza la recepción, cobro, redacción, conversión a voz (TTS) y reproducción local de dichos anuncios, manteniendo el control de aprobación en manos de la encargada.

### Reglas de Negocio Inmutables

- **Precio base:** $$1.00\\text{ USD}$ por emisión (1 anuncio inicial = $$1$, cada repetición extra = $+$1$). Fórmula: $\\text{Total a pagar} = \\text{Número de emisiones contratadas} \\times $1.00$.
- **Cobro:** 100% por adelantado vía transferencia bancaria.
- **Formato de Tandas:**
  - Frecuencia: 1 tanda cada 20–30 minutos (configurable).
  - Duración máxima por tanda: $120\\text{ segundos}$ (2 minutos).
  - Duración máxima de un anuncio individual: $120\\text{ segundos}$.
  - Horario: Solo mañana y tarde (ej. 07:00 a 18:30). **Bloqueo estricto en noches y madrugadas.**

- **Aprobación Humana (Human-in-the-loop):** Ningún anuncio se programa ni convierte en audio definitivo sin la aprobación de la encargada o sus designados en el panel de administración (aunque el pago sea válido).

\---

## 2\. Stack Tecnológico y Versiones (Estándares Actuales)

El presupuesto es ajustado ($$500 - $600\\text{ USD}$ para desarrollo y operación ultra económica). Prioriza código limpio, mantenible y sin sobreingeniería.

### 2.1. Frontend \& Web Server

- **Framework:** **Astro `^7.4.2`** (Usa el nuevo compilador en Rust y Vite 8).
  - Usa **Server Actions (`astro:actions`)** con validación `zod` para el envío de formularios, subida de comprobantes y cambios de estado en el panel.
  - Usa **Server Islands (`server:defer`)** para partes dinámicas del panel si es necesario, manteniendo el portal del cliente ultra rápido y estático donde sea posible.

- **Estilos:** **Tailwind CSS `^4.3.0`** (Motor Oxide).
  - **PROHIBIDO** crear o buscar archivos `tailwind.config.js` o `tailwind.config.ts`.
  - Usa configuración **CSS-first**: importa con `@import "tailwindcss";` en el archivo CSS global y define tokens personalizados mediante la directiva `@theme`.
  - Usa el plugin oficial de Vite `@tailwindcss/vite` en lugar de PostCSS tradicional.

- **UI \& Accesibilidad (UX Crítica):**
  - Los usuarios finales tienen un **nivel tecnológico moderado/bajo**.
  - Diseña interfaces con botones grandes (mínimo `48x48px` de área táctil), alto contraste (WCAG AA/AAA), tipografía legible (mínimo `16px`/`1rem` en textos base) y un flujo paso a paso tipo _Wizard_ con una mini-guía visual integrada.

- **Runtime \& Lenguaje:** **Node.js `22 LTS`** (o `24 LTS`) y **TypeScript `^5.8.0`** en modo `strict`.

### 2.2. Backend-as-a-Service (BaaS) \& Base de Datos

- **Plataforma:** **InsForge** (stack basado en PostgreSQL + PostgREST + Deno Edge Functions + Storage + Realtime).
- **Directriz para el Agente (MCP):**
  - Interactúa con InsForge a través de su **servidor MCP (Model Context Protocol)** para inspeccionar esquemas, crear tablas, definir políticas RLS y gestionar buckets de Storage.
  - **Seguridad obligatoria:** Habilita **Row Level Security (RLS)** en todas las tablas de PostgreSQL.
  - **Buckets de Storage:**
    - `receipts` (Privado): Para capturas/PDFs de comprobantes de transferencia.
    - `audios` (Privado/Firmado): Archivos `.mp3` o `.opus` generados para que el reproductor local los descargue.

### 2.3. Servicios de IA (Propuesta Técnica Optimizada en Costos)

Se puede utilizar el **Model Gateway de InsForge** o llamadas directas desde el servidor de Astro/Edge Functions:

1. **Visión (Lectura de Comprobantes):** `Gemini 2.5 Flash` o `GPT-4o-mini` usando **Structured Outputs (JSON Schema)** estricto.
   - _Regla de Oro:_ La IA **NUNCA** aprueba un pago. La IA solo extrae un objeto JSON (`monto`, `fecha`, `hora`, `banco`, `numero\_comprobante`, `cuenta\_destino`, `concepto`). El código determinista en TypeScript/PostgreSQL realiza la validación.

2. **Redacción de Anuncios (Copywriting):** `Gemini 2.5 Flash`.
   - Prompt del sistema diseñado para transformar ideas sueltas en un guion cálido, respetuoso y claro, que al leerse no supere los $110\\text{ segundos}$ (aprox. $220 - 250$ palabras máximo).

3. **Text-to-Speech (TTS):**
   - Seleccionar voz según la categoría:
     - `SOLEMN` (Sepelios, misas de réquiem, rezos): Voz pausada, tono sobrio y empático.
     - `CHEERFUL` (Saludos, cumpleaños, felicitaciones): Voz cálida y animada.
     - `NEUTRAL` (Avisos generales, promociones).

   - _Recomendación técnica:_ OpenAI TTS (`gpt-4o-mini-tts`) o Google Cloud TTS (voces Neural2/Journey en español latinoamericano) por su bajísimo costo por carácter y alta naturalidad.

### 2.4. Reproductor Local en La Gruta (Daemon Offline-First)

- **Entorno:** Proceso independiente corriendo en la PC de la gruta (recomendado **Node.js + TypeScript** o **Python 3.12+** ejecutándose como servicio del sistema con PM2 o Systemd).
- **Arquitectura Offline-First:**
  1. Se suscribe vía **InsForge Realtime** (o hace _polling_ cada 2 minutos) para detectar nuevos anuncios aprobados y su programación (`schedule\_slots`).
  2. **Pre-descarga obligatoria:** Descarga los archivos de audio a una carpeta local (`/var/gruta/audios\_cache/`) en cuanto se aprueban, **nunca** en el segundo exacto en que deben sonar.
  3. **Base de datos local:** Mantiene un estado ligero en **SQLite** local con la cola del día. Si se corta el internet en la gruta, el reproductor sigue emitiendo las tandas ya descargadas sin interrupción.
  4. **Confirmación (ACK):** Tras reproducir un audio por la salida analógica (cable hacia amplificador), registra el evento localmente y sincroniza con InsForge (`emissions\_log`), descontando $1$ del saldo de emisiones (`remaining\_emissions`). Si falla la reproducción de hardware, no descuenta saldo y reintenta en la siguiente tanda.

\---

## 3\. Modelo de Datos de Referencia (PostgreSQL en InsForge)

Cuando crees o modifiques migraciones, respeta esta estructura lógica:

- **`orders` (Pedidos):**
  - `id` (UUID, PK)
  - `order\_code` (TEXT, UNIQUE) — Ej: `GRU-4829` (corto y fácil de escribir en el concepto bancario).
  - `client\_name` (TEXT), `client\_phone` (TEXT)
  - `category` (ENUM: `FUNERAL`, `MASS`, `PRAYER`, `GREETING`, `PROMO`, `OTHER`)
  - `is\_urgent` (BOOLEAN) — Prioridad en cola para sepelios/rezos urgentes.
  - `raw\_idea` (TEXT) — Lo que escribió el cliente.
  - `final\_script` (TEXT) — Texto redactado por IA y/o editado por la encargada.
  - `voice\_profile` (ENUM: `SOLEMN`, `CHEERFUL`, `NEUTRAL`)
  - `total\_emissions` (INT), `remaining\_emissions` (INT)
  - `amount\_due` (NUMERIC(6,2))
  - `target\_date` (DATE) — Día en que debe emitirse.
  - `status` (ENUM: `PENDING\_PAYMENT`, `UNDER\_REVIEW`, `APPROVED`, `SCHEDULED`, `COMPLETED`, `REJECTED`)
  - `audio\_url` (TEXT), `audio\_duration\_sec` (INT)
  - `created\_at` (TIMESTAMPTZ)

- **`payments` (Pagos y Comprobantes):**
  - `id` (UUID, PK), `order\_id` (UUID, FK)
  - `receipt\_image\_url` (TEXT)
  - `reference\_number` (TEXT, UNIQUE) — **Índice único para evitar reutilización de comprobantes.**
  - `extracted\_data` (JSONB) — Datos crudos extraídos por el modelo de visión.
  - `validation\_flags` (JSONB) — Resultado de las reglas (`amount\_matches`, `code\_matches`, `date\_is\_recent`, `account\_matches`).
  - `reconciled\_at` (TIMESTAMPTZ) — Para el check de conciliación diaria al final del día.

- **`schedule\_slots` (Cola y Tandas):**
  - `id` (UUID, PK)
  - `slot\_time` (TIMESTAMPTZ) — Hora exacta de la tanda (ej. `2026-10-28 10:30:00`).
  - `order\_id` (UUID, FK)
  - `status` (ENUM: `QUEUED`, `DOWNLOADED\_LOCALLY`, `PLAYED`, `FAILED`, `SKIPPED`)
  - `played\_at` (TIMESTAMPTZ)

- **`system\_settings` (Configuración Global):**
  - `is\_paused` (BOOLEAN) — **Interruptor Maestro de Pausa** para que la encargada detenga las emisiones inmediatamente si hay un evento presencial en la gruta.
  - `open\_time` (TIME), `close\_time` (TIME), `cutoff\_time` (TIME) — Hora límite para pedidos del mismo día.
  - `blocked\_phones` (TEXT\[]) — Lista negra de teléfonos por intentos de fraude.

\---

## 4\. Algoritmo de Cola y Reparto (Reglas de Programación)

Al escribir la lógica del planificador de tandas (`SchedulerService`), aplica estrictamente estas reglas:

1. **Distribución Equidistante:** Si quedan $H$ horas operativas en el día y el anuncio tiene $N$ emisiones, el intervalo ideal entre emisiones del mismo anuncio es $\\Delta t = \\frac{H}{N}$, respetando una separación mínima configurable (ej. mínimo 45 minutos entre repeticiones del mismo anuncio).
2. **Límite de Tanda ($120\\text{s}$):** La suma de `audio\_duration\_sec` de los anuncios asignados a un mismo `slot\_time` no puede superar los $120\\text{ segundos}$. Si hay choque, el anuncio con menor prioridad pasa a la siguiente tanda disponible.
3. **Prioridad (`is\_urgent`):** Los anuncios de sepelios o rezos marcados como urgentes toman el primer lugar en la tanda inmediata disponible.
4. **Hora Límite (Cut-off):** Si al momento de pagar o aprobar no caben las $N$ repeticiones antes de `close\_time` respetando la separación mínima, el sistema debe advertir al cliente antes del pago y ofrecer programar el pedido completo (o el remanente) para el día siguiente (`target\_date + 1`).

\---

## 5\. Prevención de Fraude y Seguridad

1. **Validación Determinista de Comprobantes:**
   - Nunca des por válido un comprobante solo porque el LLM diga `"es\_valido": true`.
   - Verifica en código:
     - `extracted.amount === order.total\_emissions \* 1.00`
     - `extracted.reference\_number` no existe previamente en la tabla `payments`.
     - `extracted.concept` incluye `order.order\_code` (o márcalo con un _warning_ amarillo para revisión manual de la encargada si el cliente olvidó poner el código).

2. **Vista de Conciliación Diaria:**
   - El panel de la encargada debe tener una vista simple "Cierre del Día" que liste todos los anuncios emitidos hoy junto con su número de comprobante, banco y monto, permitiendo marcar con un _check_ rápido contra la app del banco en menos de 2 minutos.

3. **Bloqueo por Fraude:**
   - Un botón en el panel de revisión que permita "Rechazar por Comprobante Falso y Bloquear Teléfono".

\---

## 6\. Instrucciones de Trabajo para el Agente

- **Idioma:** Todo el texto de la interfaz de usuario (UI), mensajes de error, prompts de IA y comentarios de lógica de negocio deben estar en **Español (neutro/latinoamericano)** claro y sencillo. El código (variables, funciones, tablas) debe escribirse en **Inglés** siguiendo convenciones estándar (`camelCase` en TS, `snake\_case` en PostgreSQL).
- **Modularidad:** Separa claramente el código en:
  - `/src/pages` y `/src/components` (Web en Astro + Tailwind v4).
  - `/src/actions` y `/src/lib/services` (Lógica de validación, llamadas a IA, algoritmo de cola).
  - `/player-daemon` (Servicio independiente que correrá en la PC física de la gruta).

- **Manejo de Errores:** Si falla la lectura por IA del comprobante (ej. foto borrosa), no bloquees al usuario; permítele subir otra foto o enviarlo igualmente a revisión manual de la encargada con una etiqueta de `"Lectura manual requerida"`.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **grutaBackend** (API base `https://f33h5dsy.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
