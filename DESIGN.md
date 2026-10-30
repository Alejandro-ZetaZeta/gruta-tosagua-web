# DESIGN.md — Sistema de diseño "Santuario" (La Gruta)

Fuente de verdad visual y de UX. Un agente debe poder construir toda la UI usando **solo** este documento y los archivos de referencia en `mockups/`. Complementa a `AGENTS.md` (negocio/stack); si hay conflicto técnico, manda `AGENTS.md`.

## 0. Referencia visual (mockups estáticos, sin backend)

| Archivo | Contenido |
|---|---|
| `mockups/a-santuario/style.css` | **Todos los tokens y componentes** (CSS plano). Portar a `@theme` de Tailwind v4 (ver §2). |
| `mockups/a-santuario/cliente.html` | Portal del cliente: wizard de 5 pasos. |
| `mockups/a-santuario/panel.html` | Panel de la encargada: pausa, revisión, tandas. |
| `mockups/shared/mock.js` | Solo interacciones de maqueta (wizard, contador, pausa, copiar). **No reutilizar en producción**; reimplementar con Astro Islands / Actions. |

Ver las maquetas: abrir los `.html` directamente en el navegador (requieren internet para fuentes e iconos). Al implementar en Astro, **migrar estos archivos a `/src/components` y `/src/pages` y borrar `mockups/`**.

## 1. Principios

1. **Audiencia:** nivel tecnológico bajo/moderado, a menudo mayores. Una decisión por pantalla, lenguaje simple, sin tecnicismos.
2. **Tono:** cálido, sereno, respetuoso (contexto de duelo y fe). Sin humor, sin urgencia agresiva, sin gradientes "IA" púrpura/rosa.
3. **Accesibilidad (WCAG AA mínimo, AAA en texto principal):** texto base ≥ 17px, áreas táctiles ≥ 48px (botones principales 56px), foco visible, nunca solo color para estado (siempre icono + texto).
4. **Humano al mando:** la UI nunca presenta un resultado de IA como aprobación; los chequeos de pago son *avisos* para la encargada.
5. **Errores amables:** foto borrosa → "La encargada la revisará a mano" (etiqueta `Lectura manual requerida`), nunca bloquear al cliente.
6. **Idioma:** texto de UI en español latinoamericano neutro; código en inglés.

## 2. Tokens

### 2.1 Color (CSS-first, Tailwind v4)

```css
@import "tailwindcss";
@theme {
  --color-bg: #FBF7F0;          /* fondo marfil */
  --color-surface: #FFFFFF;     /* tarjetas */
  --color-ink: #1F1633;         /* texto principal / nav oscura */
  --color-muted: #564F66;       /* texto secundario (AA sobre bg) */
  --color-primary: #3B1F7A;     /* morado profundo: acción principal */
  --color-primary-hover: #2E1765;
  --color-primary-soft: #EFEAF8;
  --color-gold: #A16207;        /* acento cálido, foco, guía */
  --color-gold-soft: #FEF3C7;
  --color-gold-ink: #713F12;    /* texto sobre gold-soft */
  --color-ok: #166534;  --color-ok-soft: #DCFCE7;
  --color-warn: #92400E; --color-warn-soft: #FEF3C7;
  --color-danger: #B91C1C; --color-danger-soft: #FEE2E2;
  --color-line: #E7E0D4;        /* bordes */
  --radius-card: 20px;          /* 16px botones, 14px inputs, 12px botón pequeño */
  --shadow-card: 0 1px 2px rgba(31,22,51,.06), 0 8px 24px rgba(31,22,51,.07);
  --font-serif: 'Crimson Pro', Georgia, serif;
  --font-sans: 'Atkinson Hyperlegible', system-ui, sans-serif;
}
```

Significado semántico (no cambiar):
- **primary** = acción principal, paso activo, selección. **gold** = acento, foco (`outline: 3px solid gold`), énfasis cálido, "próxima tanda".
- **ok** = válido/aprobado/emisiones activas. **warn** = requiere revisión manual (p. ej. falta código en concepto). **danger** = urgente, pausa, fraude.
- Bordes de input: `#D6CDBE` sobre fondo `#FFFDF9`. Estado seleccionado: borde `primary` + fondo `primary-soft`.
- Modo oscuro: **no incluido** (fuera de alcance por ahora).

### 2.2 Tipografía

- **Titulares:** Crimson Pro (600/700), `line-height 1.15`. H2 `clamp(1.75rem, 3.5vw, 2.25rem)`; H3 `1.35rem`. Cifras grandes (contador, total, código de pedido) también en Crimson Pro.
- **Cuerpo/UI:** Atkinson Hyperlegible (400/700), base `1.0625rem` (17px), `line-height 1.6`. Hints/secundario `0.95rem`; nunca menos de 14px.
- Etiqueta superior ("eyebrow"): 0.85rem, mayúsculas, `letter-spacing .08em`, `gold-ink`, 700.
- Carga: Google Fonts (`Crimson Pro:500,600,700` y `Atkinson Hyperlegible:400,700,italic 400`) con `display=swap`. Preferible autoalojar en producción.

### 2.3 Espaciado, forma y movimiento

- Ritmo 4/8px; secciones 16/24/32/48. Tarjeta: padding `clamp(20px, 3vw, 36px)`. Contenedor máx. 1180px.
- Radios: tarjeta 20, botón 16, input 14, chip/pill 99, elección 18.
- Transiciones 200ms (color/sombra); sin transformaciones que muevan el layout. `prefers-reduced-motion` desactiva todo.
- Iconos: **Phosphor** (`@phosphor-icons/web`), trazo regular, tamaño `1.4em`; decorativos con `aria-hidden="true"`. **Sin emojis como iconos.** (En la maqueta se carga por CDN; en producción instalar el paquete.)

## 3. Componentes

| Componente | Clase de referencia | Reglas |
|---|---|---|
| Botón primario | `.btn .btn-primary` | 56px alto, morado, texto blanco 700, sombra morada suave. Un único primario por pantalla/tarjeta. |
| Botón secundario | `.btn-ghost` | Borde `line`, texto primary. |
| Peligro | `.btn-danger` | Fondo blanco, texto/borde rojo suave. Solo en acciones destructivas ("Comprobante falso · bloquear"). |
| Botón pequeño | `.btn-sm` | 48px alto (mínimo táctil). |
| Opción grande (radio) | `.choice` | Tarjeta ≥120px con icono 52px, título 1.15rem y ayuda; seleccionada: check ✓ circular arriba a la derecha. Radio nativo oculto pero enfocable (`:has(input:checked)`). |
| Campo | `.field` | Etiqueta visible siempre (700), hint debajo, input ≥56px, foco con anillo primary. |
| Check-card | `.check-card` | Casilla 26px + título + ayuda; marcada: borde gold + fondo gold-soft. |
| Contador | `.counter` | Botones circulares 72px − / +, número 4.5rem serif; rango 1–12. Actualiza el total ($1.00 × n). |
| Caja IA | `.ai` | Borde punteado dorado: "Así lo leerá la voz", cita serif, píldoras (duración, voz), botones "Escuchar" / "Cambiar texto". |
| Pill/estado | `.pill` (+ `gold`, `ok`, `warn`, `danger`) | Siempre con icono o texto explícito. |
| Nota | `.note` / `.note.gold` | Información/aviso con icono; gold para reglas de horario. |
| Código de pedido | `.code` | Bloque morado, `GRU-####` serif 3rem, botón "Copiar código". |
| Datos bancarios | `.bank` | Lista `dl` en filas: banco, cuenta, titular, monto exacto. |
| Zona de subida | `.drop` | Borde punteado; botones "Tomar foto" (gold) y "Elegir archivo"; mensaje tranquilizador por foto borrosa. |
| Línea de tiempo | `.timeline` | 3 hitos: recibido (ok), en revisión (now/gold), emisión programada. |
| Interruptor de pausa | `.pause` + `.switch` | Banda verde "Emisiones activas" ↔ roja "Emisiones en pausa" (cambia texto, icono y color). Interruptor 76×42, `role="switch"`. |
| Selector de voz | `.voices` / `.voice` | Segmentado: Solemne / Alegre / Neutral → `SOLEMN`/`CHEERFUL`/`NEUTRAL`. |
| Barra de tanda | `.slot .bar` | Relleno proporcional a segundos usados sobre 120 s; estados: emitida (opaca 60%), próxima (gold), llena (100%). |

## 4. Portal del cliente (`cliente.html`)

**Cabecera** sticky: logo circular morado (icono `church`), "La Gruta / Anuncios por megafonía", botón "¿Necesita ayuda?".

**Layout escritorio (≥901px):** 2 columnas — izquierda sticky (300px): lista de pasos numerados + tarjeta "¿Cómo funciona?" (suena en tandas mañana y tarde · $1.00 por vez · la encargada revisa todo); derecha: tarjeta del wizard.
**Layout móvil (≤900px):** sin columna lateral; barra de progreso sticky ("Paso 2 de 5" + pista) y **barra de acciones fija abajo** (Atrás / Continuar) respetando `safe-area-inset-bottom`. Opciones en 2 columnas (a ≤420px se oculta el subtexto).

**Wizard de 5 pasos** (`h2` recibe foco al cambiar de paso; scroll al inicio):

1. **Tipo** — 6 opciones: Sepelio (`flower-lotus`, → `FUNERAL`), Misa (`church`, `MASS`), Rezo (`hands-praying`, `PRAYER`), Saludo (`cake`, `GREETING`), Promoción (`storefront`, `PROMO`), Otro aviso (`megaphone-simple`, `OTHER`).
2. **Mensaje** — nombre, teléfono, texto libre ("¿Qué quiere que se diga?" + ejemplo), día de emisión, casilla "Es urgente" (`is_urgent`), y la caja IA con el guion sugerido, duración estimada (máx. 110 s) y voz según categoría.
3. **Cantidad** — contador de emisiones, total (`n × $1.00`), horarios aproximados del día, nota de corte: si no caben antes de `close_time`, se ofrece completar al día siguiente (advertir **antes** del pago).
4. **Pago** — código `GRU-####` con copiar, datos bancarios, monto exacto, subida de comprobante (tomar foto / archivo). "Enviar pedido".
5. **Confirmación** — sello verde, código del pedido, línea de tiempo. Botón "Pedir otro anuncio".

Reglas UX: validación en línea con mensajes claros; si falla la lectura por IA → permitir reintentar o enviar a revisión manual; no usar CAPTCHAs ni límites de tiempo; el botón principal nunca queda oculto por teclado/barras.

## 5. Panel de la encargada (`panel.html`)

**Cabecera** igual a cliente ("Panel de la encargada" + fecha).

**Layout escritorio:** nav lateral oscura 260px (`ink`) — *Por revisar (badge), Tandas de hoy, Cierre del día, Historial, Ajustes*, usuario abajo; contenido a la derecha. **Móvil:** nav lateral reemplazada por barra inferior fija de 4 ítems (Revisar, Tandas, Cierre, Ajustes), cada uno ≥56px.

**Orden del contenido:**
1. **Banda de pausa maestra** (siempre arriba, `aria-live="polite"`): estado + próxima tanda + interruptor "Pausar todo". Al activar, `body.paused` cambia toda la banda a rojo.
2. **KPIs** (4): por revisar, en cola hoy, emitidos hoy, cobrado hoy.
3. **Cola "Por revisar"** ordenada por urgencia; cada fila: icono de categoría, cliente, código, emisiones, monto + pill (Urgente / Revisar código / Lectura manual).
4. **Tarjeta de revisión** del pedido seleccionado: encabezado (código, cliente, píldoras urgente/fecha/emisiones); comprobante (imagen ampliable) + datos extraídos (monto, banco, n.º) + **lista de chequeos deterministas** (monto coincide, comprobante no usado, cuenta destino, concepto con código → ok/warn); texto editable con duración (máx. 110 s); selector de voz + "Escuchar"; acciones: **Aprobar y programar** (primario), **Pedir otra foto**, **Comprobante falso · bloquear** (danger, rechaza y añade teléfono a `blocked_phones`).
5. **Columna "Tandas de hoy"** (340px; debajo en móvil): filas hora + barra de uso sobre 120 s; estados emitida/próxima/llena. Enlace a "Cierre del día".

**Vista "Cierre del día"** (no maquetada aún; seguir estilo de tablas/filas): lista de emisiones de hoy con código, n.º de comprobante, banco, monto y casilla ✓ grande para conciliar contra el banco en < 2 min. En móvil, filas como tarjetas.

## 6. Breakpoints y responsivo

- Único breakpoint principal: **900px** (columna lateral/nav ↔ móvil). Secundario: **420px** (teléfonos pequeños). Diseñar **mobile-first** al portar a Tailwind (`md:` ≈ 768 o `min-[901px]:`).
- Verificar a 375px de ancho, sin scroll horizontal; contenido no oculto tras barras fijas (añadir padding inferior ~110px en panel móvil).
- Contenedor de lectura: texto largo máx. ~70ch.

## 7. Accesibilidad (checklist obligatoria)

- Foco visible 3px gold con offset 3px en todo elemento interactivo; orden de foco = orden visual.
- Radios/checks nativos (ocultos visualmente pero enfocables); estado nunca solo por color.
- Iconos decorativos `aria-hidden`; botones solo-icono con `aria-label`.
- Regiones dinámicas (`aria-live`) para: contador, guion IA, estado de pausa.
- `role="switch"` para pausa; `aria-current="step"`/`"page"` en pasos y navegación.
- Contraste: texto normal ≥ 4.5:1 (muted `#564F66` sobre `#FBF7F0` cumple); `gold-ink` para texto sobre fondos gold-soft.
- `prefers-reduced-motion` respetado; áreas táctiles ≥ 48px.

## 8. Mapeo a la implementación (Astro + Tailwind v4)

- Tokens de §2.1 → `src/styles/global.css` con `@theme` (sin `tailwind.config.*`; plugin `@tailwindcss/vite`).
- Componentes de §3 → `src/components/ui/*.astro` (Button, Choice, Field, Pill, Note, Counter…); wizard y panel como islas solo donde haya interactividad.
- Formularios y cambios de estado vía `astro:actions` con validación `zod`; textos de error en español.
- Los estados del mockup se mapean a enums de `AGENTS.md` §3 (`category`, `voice_profile`, `status`, `schedule_slots.status`).
- Datos de la maqueta (María Quispe, Banco Pichincha, GRU-4829, montos) son **ficticios**; nunca hardcodearlos.

