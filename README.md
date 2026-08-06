# O Monopolis · V5 Robusta y Profesional

Versión completamente refactorizada con enfoque en robustez, idempotencia y prevención de errores.

## Cambios principales de V5

### 🔒 Seguridad y Robustez
- **Idempotencia de acciones**: Compra, alquiler, cartas y Casa do Pobo no se duplican incluso con clics múltiples
- **Bloqueo de acciones**: Prevención de dobles clics durante el procesamiento
- **Validación de turno**: No permite acabar turno si hay acciones pendientes
- **Casa do Pobo atómica**: Sistema de cobro único con timestamp

### 📋 Correcciones de Juego
- **Cartiñas corregidas**: Tipos consistentes (izquierda y abajo = Diñeiro, arriba y derecha = Eventos)
- **Caixa Veciñal**: Ahora es casilla de pago automático (no roba carta)
- **Turnos con saltos**: Mejor gestión de turnos saltados
- **Botones inteligentes**: Desactivados cuando no hay acción posible

### 🎮 Mejoras de Interfaz
- Botones validados según dinero, grupo completo, turnos disponibles
- Toast informativos cuando falta acción
- Sincronización mejorada con resolución de conflictos
- Estado más explícito durante acciones

## Herencia de V4

Se mantiene completamente la funcionalidad de V4:

- Coordenadas de fichas recalculadas sobre el tablero definitivo.
- Fichas alineadas con las casillas reales del tablero.
- Animación de zoom de casilla al caer.
- Modo **Completo**: tablero + panel de juego.
- Modo **Jugador**: solo administración personal, sin tablero.
- Modo **Host / TV**: solo tablero y fichas para pantalla.
- Mazo visual de **Diñeiro** y **Eventos**.
- Títulos de propiedad al comprar.
- Bote de **Casa do Pobo** con multas acumuladas.
- Campo de Fútbol / Granxa Eloi con reglas diferenciadas.
- Ranking, patrimonio, intercambios, construcciones, bancarrota, sonidos y vibración.

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


## Diferencias con versiones anteriores

### V5.0 vs V4.1
- Idempotencia garantizada en todas las acciones críticas
- Botones inteligentes desactivados según validaciones
- Mejor manejo de sincronización
- Corrección de tipos de Cartiña (money vs caixa)
- System de bloqueo de acciones para prevenir race conditions

### Compatibilidad
- ✅ Compatible con Supabase existente (sin cambios de esquema)
- ✅ PWA funciona sin necesidad de reinstalar
- ✅ Progreso de partida anterior se carga correctamente
- ✅ Todos los datos y rankings se mantienen
