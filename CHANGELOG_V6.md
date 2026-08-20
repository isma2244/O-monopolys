# O Monopolis V6 — cambios

- Sesión automática con `supabase.auth.signInAnonymously()`.
- Recuperación automática de una partida al recargar si el dispositivo ya era miembro.
- Nuevas RPC: `monopolis_create_game`, `monopolis_join_game`, `monopolis_save_game`.
- Membresías privadas por usuario autenticado.
- RLS de lectura restringida a miembros.
- Escritura directa sobre `monopolis_games` revocada.
- Código nuevo de 6 cifras (`PIOR-123456`).
- Se puede escribir únicamente `123456` al unirse.
- Contador de jugadores `x/8` en lobby.
- Botón específico para copiar código.
- El botón de inicio muestra al invitado que está esperando al host.
- QR real conservado.
- Nueva caché PWA V6.
