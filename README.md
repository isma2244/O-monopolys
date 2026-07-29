# O Monopolis V5 - edición multixogador

Versión preparada para GitHub Pages y Supabase Realtime.

## Mejoras incluidas

- Tablero sustituido por la última versión 700 x 700 mm entregada.
- Coordenadas de las 40 casillas recalculadas sobre el tablero cuadrado.
- Estaciones corregidas:
  - inferior: O Chiringuito;
  - izquierda: Estación de Campobecerros;
  - superior: Estación de Buses - Verín;
  - derecha: A Gudiña - Porta de Galicia.
- Cuatro servicios programados:
  - A Bodega do Quinqué;
  - A Piscina do Riós;
  - A Fonte;
  - As Piscinas de Castrelo.
- Regla aplicada a servicios: 1/2/3/4 servicios = 4x/10x/15x/20x el total de los dados.
- Cada alquiler, compra o carta solo puede resolverse una vez por turno.
- Los botones de compra, alquiler y mazos solo aparecen cuando corresponden al jugador actual.
- No se puede finalizar el turno hasta resolver la casilla.
- Intercambios por solicitud con aceptar, rechazar, cancelar y contrapropuesta.
- Chat sincronizado dentro de la partida.
- Fichas rediseñadas como peones tridimensionales.
- Zoom de casilla recalculado para encuadrar el punto real del tablero.
- Música ambiental original y efectos de sonido mejorados.
- Interfaz rediseñada con un aspecto más sobrio y menos genérico.
- Se mantienen los modos Completo, Móvil y Pantalla/TV.

## Instalación en GitHub

Sube todo el contenido del ZIP a la raíz del repositorio, sustituyendo la versión anterior.

```text
index.html
app.js
data.js
styles.css
manifest.json
sw.js
supabase-schema.sql
assets/
```

No se necesita ninguna migración adicional de Supabase: chat e intercambios se guardan dentro del JSON de la partida.

## Caché

Tras subir los archivos, espera uno o dos minutos. En iPhone puede ser necesario eliminar la app de la pantalla de inicio, abrir de nuevo la URL en Safari y volver a añadirla.
