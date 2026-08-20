# O Monopolis V6 · Multiplayer seguro

## 1. Paso obligatorio en Supabase

En el proyecto de Supabase activa **Authentication → Anonymous Sign-Ins**.

Después abre **SQL Editor**, pega el contenido completo de `SUPABASE_V6_SECURITY.sql` y ejecútalo una sola vez.

> La URL del proyecto y la anon key ya están configuradas en `config.js`. La anon key es pública por diseño; la seguridad real la aportan Supabase Auth + RLS + las RPC del SQL.

## 2. Subir a GitHub Pages

Sustituye los archivos de tu versión publicada por los de esta carpeta. `sw.js` lleva una caché nueva (`o-monopolis-v6-secure-20260820-1`) para forzar la actualización de la PWA.

## 3. Flujo del jugador

- Abrir O Monopolis.
- Crear partida o Unirse.
- El host recibe un código `PIOR-123456` y un QR real.
- El invitado puede escribir solo `123456`; la app añade `PIOR-` automáticamente.
- Cada dispositivo crea silenciosamente una sesión anónima de Supabase.
- Al recargar la misma URL, el navegador intenta recuperar automáticamente su partida.

## Seguridad conseguida

- Eliminadas las políticas `using (true)`.
- Una partida ya no puede leerse desde otro usuario salvo que sea miembro.
- No hay INSERT/UPDATE directos desde el navegador.
- Crear, unirse y guardar pasan por funciones SQL controladas.
- Solo el host puede cambiar de lobby a partida.
- No se puede alterar mediante un guardado la identidad, nombre o ficha de los jugadores.
- Se conserva el control de versión para reducir conflictos simultáneos.

## Límite conocido

El juego sigue siendo **client-authoritative** para las acciones internas del turno. Un jugador que esté dentro de una partida y manipule deliberadamente el JavaScript podría intentar enviar un estado de juego fraudulento (por ejemplo, cambiar dinero). Evitar eso al 100 % exige mover cada acción de juego —tirar dados, comprar, pagar, construir, cartas, intercambios— a RPC/Edge Functions validadas en servidor. Esta V6 sí evita el problema grave de V5: acceso y modificación abierta de partidas ajenas con la anon key.
