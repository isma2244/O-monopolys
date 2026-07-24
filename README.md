# O Monopolis · V4 Host + Player

Esta versión añade las mejoras pedidas después de probar la app:

## Cambios principales

- Coordenadas de fichas recalculadas sobre el tablero definitivo.
- Las fichas quedan alineadas con las casillas reales del tablero.
- Animación de zoom de casilla al caer: muestra la casilla en grande y vuelve al tablero normal.
- Modo **Completo**: tablero + panel de juego.
- Modo **Jugador**: solo administración personal, sin tablero, ideal para móvil.
- Modo **Host / TV**: solo tablero y fichas, ideal para un PC conectado a una tele.
- Mazo visual de **Diñeiro** y **Eventos**.
- Al comprar una propiedad aparece la carta/título de propiedad.
- Bote de **Casa do Pobo**:
  - las multas y pagos negativos a banca van al bote;
  - quien cae en Casa do Pobo cobra el bote.
- Campo de Fútbol / Granxa Eloi:
  - si caes de forma normal, solo echas una pachanga y no pasa nada;
  - si te manda el Rumano, vas a trabajar a la granxa y pierdes turnos;
  - si tienes carta para librarte de la granxa, se consume y no pierdes turnos.
- Se mantiene la V3: ranking, patrimonio, intercambios, venta de casas/hotel, bancarrota, sonidos y vibración.

## Cómo usar modo host y modo jugador

En cualquier partida puedes pulsar:

- **🎮 Completo**: uso normal.
- **📱 Xogador**: para el móvil de cada jugador.
- **📺 Host / TV**: para el PC/tablet conectado a una tele.

También puedes abrir directamente el modo TV añadiendo:

```txt
?view=host
```

Por ejemplo:

```txt
https://isma2244.github.io/O-monopolys/?join=PIOR-1234&view=host
```

## Estructura correcta en GitHub

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

## Supabase

No hace falta tocar Supabase si ya funciona la creación de partidas.

## Caché

Si ves la versión antigua:

1. Espera 1-2 minutos tras hacer commit.
2. Recarga la web.
3. En iPhone, elimina el icono de pantalla de inicio y vuelve a añadirlo.


## V4.1 · Corrección Cartiñas / Caixa Veciñal

- `Caixa Veciñal` ya no roba carta: ahora es una casilla de pago.
- El pago de Caixa Veciñal va al bote de `Casa do Pobo`.
- Importe aplicado por defecto: 1.500€.
- Cartiña inferior: Eventos.
- Cartiña derecha: Eventos.
- Cartiña izquierda: Diñeiro.
- Cartiña superior: Diñeiro.
