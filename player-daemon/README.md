# Reproductor local · La Gruta

Servicio que corre en la PC de la gruta. Consulta la cola cada 2 minutos, **descarga los audios antes** de la tanda y los reproduce por la salida de audio del equipo (cable al amplificador). Si se corta el internet, sigue emitiendo lo que ya está descargado. Al terminar, avisa al servidor para descontar el saldo de emisiones.

## Requisitos

- Node.js 22.9 o superior (usa `node:sqlite`, sin dependencias).
- Un reproductor de MP3 por línea de comandos:
  - Windows: `ffplay` (viene con ffmpeg) o VLC.
  - Linux: `mpg123`, `ffplay` o `mpv`.
- Parlantes o cable conectado a la entrada del amplificador.

## Instalación

```bash
cd player-daemon
copy .env.example .env     # Windows
# cp .env.example .env     # Linux
```

Edite `.env`:

- `PLAYER_API_URL`: URL del sitio (ej. `https://gruta.example.com`).
- `PLAYER_TOKEN`: el mismo valor de `PLAYER_TOKEN` en el `.env.local` del servidor.
- `PLAY_CMD`: comando de reproducción. Use `{file}` como marcador.
- `DRY_RUN=1` para probar sin audio.

Arranque:

```bash
npm start
```

Para que arranque con Windows, cree una tarea programada (Task Scheduler) que ejecute `node --env-file-if-exists=.env src/index.ts` en esta carpeta, con la sesión del usuario que tiene la salida de audio. En Linux use `systemd`.

## Qué hace

1. `GET /api/player/queue` con el token. Devuelve las tandas de las próximas 26 horas con URLs firmadas de audio.
2. Guarda el estado en `data/player.db` y descarga los MP3 en `audios_cache/`.
3. Cada 5 segundos revisa si hay una tanda vencida. Si el servidor está en pausa, no reproduce.
4. Al terminar bien: `POST /api/player/ack` con `played`. El servidor marca la tanda, registra la emisión y descuenta $1 del saldo.
5. Si el reproductor falla: reintenta en la siguiente tanda. Si falla dos veces, avisa `failed` y **no se descuenta saldo**.
6. Las confirmaciones se guardan en SQLite y se reintentan si no hay internet.

## Límites conocidos

- `DRY_RUN=1` también confirma la emisión (sirve para probar el flujo completo). Use pedidos de prueba.
- `PLAY_CMD` se parte por espacios: si la ruta del reproductor tiene espacios, use una ruta sin espacios o un script `.bat`/`.sh` que lo envuelva.
- Si el equipo se apaga más de 75 minutos, las tandas vencidas se marcan como fallidas y no se descuenta saldo.
