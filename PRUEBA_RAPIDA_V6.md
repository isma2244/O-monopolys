# Prueba rápida V6

1. En Supabase, activa **Authentication → Anonymous Sign-Ins**.
2. Ejecuta `SUPABASE_V6_SECURITY.sql` completo en SQL Editor.
3. Sube todos los archivos de esta carpeta a GitHub Pages.
4. Abre la web en un móvil A y crea una partida.
5. Comprueba que el código tiene formato `PIOR-123456` y que aparece `1/8`.
6. Escanea el QR desde un móvil B.
7. En B, escribe nombre + ficha y entra. No debe pedir URL ni key.
8. En A debe aparecer el segundo jugador en tiempo real.
9. Inicia la partida desde A. En B no debe poder iniciar.
10. Recarga ambos móviles: cada uno debe recuperar automáticamente su partida.

## Si aparece “erro de acceso”

Normalmente significa que **Anonymous Sign-Ins** todavía no está habilitado en Supabase.

## Si crear/unirse da “Erro de servidor”

Comprueba que ejecutaste `SUPABASE_V6_SECURITY.sql` y que no hubo errores en el SQL Editor.
