# O Monopolis · App multijugador sincronizada

Esta versión es una PWA multijugador para jugar desde varios móviles con la misma partida en tiempo real.

## Qué hace

- Crear partida con código tipo `PIOR-1234`.
- Unirse desde otros móviles con código o enlace.
- Sincronizar tablero, turnos, dados, dinero, propiedades, estaciones, hipotecas, casas/hotel y cartas.
- Guardar la partida en Supabase.
- Instalable en iPhone/Android desde el navegador.

## Instalación rápida

### 1. Crear Supabase

1. Entra en Supabase y crea un proyecto.
2. Ve a **SQL Editor**.
3. Ejecuta el archivo `supabase-schema.sql`.
4. Ve a **Project Settings > API**.
5. Copia:
   - Project URL
   - anon public key

### 2. Subir la app

Puedes subir esta carpeta a Netlify, Vercel, GitHub Pages o cualquier hosting estático.

Para probar en local:

```bash
python -m http.server 8000
```

Abre:

```txt
http://localhost:8000
```

### 3. Configurar dentro de la app

En la pantalla inicial pega la `SUPABASE_URL` y la `SUPABASE_ANON_KEY`.

### 4. Jugar

1. Un jugador crea partida.
2. Comparte el código o enlace.
3. Los demás entran desde su móvil.
4. Host pulsa **Comezar partida**.

## Notas

- El tablero usa el diseño final `ismaelmopiern.pdf`.
- Las propiedades y estaciones usan los precios acordados en las cartas.
- Las estaciones cuestan 2.000€, hipoteca 1.000€ y alquileres 250 / 500 / 1.000 / 2.000.
- `Servizos` queda como casilla manual porque no había regla económica cerrada.
- La política SQL incluida es abierta para partidas entre amigos. Para publicarlo de forma masiva convendría añadir autenticación o una contraseña de partida.
