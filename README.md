# O Monopolis · Ultra Multiplayer V3

V3 sobre la versión premium, pensada para que parezca una app de juego bastante más seria.

## Novedades frente a V2

- Dos dados 3D reales, uno por cada dado.
- Ranking de jugadores por patrimonio neto.
- Cálculo de patrimonio: efectivo + propiedades + valor parcial de casas/hotel.
- Panel de jugadores más visual.
- Intercambio rápido entre jugadores:
  - transferir propiedad;
  - transferir dinero;
  - transferir propiedad + dinero.
- Venta de casas/hotel al 50%.
- Bancarrota:
  - elimina al jugador de la rotación de turnos;
  - libera sus propiedades.
- Modal de cartas con animación tipo flip.
- Mejoras visuales extra para tablero, fichas y paneles.
- Sigue usando la misma tabla de Supabase; no requiere migración nueva.

## Estructura correcta

Sube todo a la raíz del repositorio:

```txt
index.html
app.js
data.js
styles.css
manifest.json
sw.js
README.md
supabase-schema.sql
assets/
  board.jpg
  icon-192.png
  icon-512.png
```

La carpeta `assets` debe estar en minúscula.

## Actualización en GitHub

1. Descomprime el ZIP.
2. Sube todo el contenido al repositorio.
3. Reemplaza archivos.
4. Commit changes.
5. Espera 1-2 minutos en GitHub Pages.

## Caché PWA

Si sigue apareciendo la versión anterior en iPhone:

- borra el icono de la pantalla de inicio;
- abre la URL de GitHub Pages desde Safari;
- recarga;
- vuelve a añadir a pantalla de inicio.
