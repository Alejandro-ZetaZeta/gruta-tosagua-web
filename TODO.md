# TODO · La Gruta

Lista de trabajo derivada de `AGENTS.md` y `DESIGN.md`.

## Hecho

- [x] Esquema Postgres: enums, `orders`, `payments`, `schedule_slots`, `emissions_log`, `system_settings`.
- [x] RLS activo sin acceso público; buckets privados `receipts` y `audios`.
- [x] Trigger de capacidad de 120 s por tanda.
- [x] Función atómica `record_emission()` (marca, registra y descuenta saldo).
- [x] Landing pública con precio, categorías y accesos separados para cliente y encargada.
- [x] Registro y login de clientes; `public.profiles` con rol `CLIENT`/`ADMIN`; nuevos usuarios quedan `CLIENT`.
- [x] Un solo acceso en `/login`; `ADMIN` va a `/panel` y `CLIENT` a `/cuenta`.
- [x] Dashboard del cliente (`/cuenta`) con sus pedidos; wizard en `/cuenta/nuevo` solo con sesión.
- [x] Pedidos vinculados a la cuenta (`orders.user_id`); el panel sigue siendo solo para `ADMIN`.
- [x] Portal del cliente: wizard de 4 pasos + confirmación, validación en línea, contador, horarios, corte.
- [x] Pago: código `GRU-####`, datos bancarios, subida de foto/PDF con reintento.
- [x] Lectura de comprobante con IA opcional + fallback de lectura manual.
- [x] Chequeos deterministas: monto, código en concepto, cuenta, fecha, referencia única.
- [x] Seguimiento por código + teléfono y re-subida de comprobante.
- [x] Revisión: guion editable, duración estimada, selector de voz, escucha TTS, aprobar y programar.
- [x] Pedir otra foto, rechazar y bloquear teléfono.
- [x] Pausa maestra, KPIs, cola por urgencia, tandas de hoy/mañana, cierre del día, historial, ajustes.
- [x] Planificador: distribución equidistante, separación mínima, urgencia, desborde al día siguiente.
- [x] Reproductor offline-first: predescarga, SQLite, reintento en la siguiente tanda, ACK idempotente.
- [x] Login de la encargada y de clientes con InsForge + cookie firmada; el rol se revisa en cada petición.

## Pendiente / decisiones del usuario

- [x] Cuenta `tosaguagruta@gmail.com` creada a mano en Auth y promovida a `ADMIN` en `public.profiles`.
- [ ] Para designados: crear la cuenta y promoverla con `npm run promote-admin` (nunca editar el rol a mano en el panel).
- [ ] Pantalla de usuarios/roles en el panel (hoy se administra con `npm run promote-admin`).
- [ ] Si se activa la verificación por correo de InsForge (requiere SMTP), agregar la pantalla de código en el registro.
- [ ] Cambiar datos bancarios y teléfono de ayuda en `/panel/ajustes` (hoy son de ejemplo).
- [ ] Decidir si se activa IA de texto/visión: agregar `OPENROUTER_API_KEY` (el Model Gateway de InsForge requiere plan pago).
- [ ] Instalar ffmpeg (o VLC) en la PC de la gruta y ajustar `PLAY_CMD` en `player-daemon/.env`.
- [ ] Desplegar el sitio con HTTPS y apuntar `PLAYER_API_URL` del reproductor a esa URL.
- [ ] Probar el volumen real con el amplificador y calibrar la salida de la PC.
- [ ] Programar el arranque automático del reproductor (Task Scheduler / systemd).
- [ ] Limpieza periódica de pedidos `PENDING_PAYMENT` abandonados (hoy quedan en la tabla).
- [ ] Reserva de cupo entre el pago y la aprobación: dos clientes podrían pagar por la misma última tanda; hoy se detecta al aprobar.
- [ ] Avisar al cliente cuando se pide otra foto (hoy debe volver a “Consultar pedido”).
- [ ] Pantalla para reprogramar tandas `FAILED` (hoy se ven en Tandas, pero no se mueven).
- [ ] Borrar `mockups/` cuando el diseño esté aprobado (DESIGN.md lo pide al migrar).
- [ ] Autoalojar las fuentes (Google Fonts por CDN por ahora).
