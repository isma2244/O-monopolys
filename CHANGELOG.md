# CHANGELOG — O Monopolis V5

## Versión 5.0 · Refactorización Robusta y Profesional

### 🔒 Seguridad y Robustez

#### Idempotencia de Acciones
- ✅ Sistema de transacciones con IDs únicos para `buyCurrent`, `payRent`
- ✅ Prevención de compra duplicada de propiedades
- ✅ Prevención de pago de alquiler múltiple en la misma casilla
- ✅ Bloqueo de acciones durante procesamiento (action lock)
- ✅ Validación de estado antes de permitir acciones

#### Casa do Pobo Atómica
- ✅ Sistema `lastPotCollection` para evitar cobro duplicado
- ✅ Flag de tiempo para validar que se cobró una sola vez
- ✅ Sincronización atómica con servidor

#### Dibujo de Cartas Seguro
- ✅ Sistema `lastDrawn` que previene dibujar dos cartas en el mismo turno
- ✅ Validación de tipo de casilla antes de permitir dibujar
- ✅ Limpieza de `lastDrawn` al cambiar turno

### 📋 Correcciones de Lógica de Juego

#### Cartiñas
- ✅ Corregido: `cartina-2` y `cartina-3` cambiad de tipo `caixa` a `money`
- ✅ Confirmado orden correcto:
  - Cartiña inferior (cartina-1): **Eventos** ✓
  - Cartiña izquierda (cartina-2): **Diñeiro** (was: caixa) 
  - Cartiña abajo (cartina-3): **Diñeiro** (was: caixa)
  - Cartiña arriba (cartina-4): **Eventos** ✓

#### Tipos de Casilla
- ✅ Unificado: cambiad `type:"caixa"` → `type:"money"` en todo el código
- ✅ Actualizado `renderSpacePanel` para usar `money` en lugar de `caixa`
- ✅ Actualizado `drawMoney` y `renderDecks` para validar `money`

#### Caixa Veciñal
- ✅ Mantiene funcionamiento como casilla de `fee`
- ✅ Los 1.500€ van al bote de Casa do Pobo automáticamente
- ✅ No requiere acción del jugador (aplicado en `applyLandingEffects`)

#### Turnos y Saltos
- ✅ Mejorado `nextTurn` para saltarse automáticamente turnos pendientes
- ✅ Limpieza de `lastDrawn` al cambiar turno

### 🎮 Mejoras de Interfaz

#### Botones Inteligentes
- ✅ Botones desactivados cuando no hay acción posible
- ✅ Validación de dinero disponible antes de habilitar compra
- ✅ Validación de grupo completo antes de habilitar construcción
- ✅ Validación de turnos antes de habilitar cualquier acción

#### Validación de Turno
- ✅ `endTurn` ahora valida que no haya acciones pendientes
- ✅ Previene acabar turno sin sacar carta en Cartiña
- ✅ Previene acabar turno sin resolver propiedad sin dueño
- ✅ Toast informativo cuando falta acción

### 🔄 Sincronización y Estado

#### Normalización de Estado
- ✅ Agregados campos a `normalizeState`:
  - `lastRent`: registro del último alquiler pagado
  - `lastDrawn`: registro de última carta dibujada
  - `lastPotCollection`: registro de cobro de Casa do Pobo
  - `processedTransactions`: lista de transacciones procesadas

#### Control Optimista
- ✅ Se mantiene mecanismo de versiones existente (versión++)
- ✅ Resolución de conflictos mediante refetch del estado
- ✅ Mejor manejo de errores de sincronización

### 📝 Documentación

#### README Actualizado
- ✅ Descripción de correcciones de Cartiñas
- ✅ Instrucciones de uso sin cambios (compatible backwards)
- ✅ Notas sobre idempotencia

#### Nuevo Archivo CHANGELOG.md
- ✅ Este archivo con todos los cambios

### ✅ Pruebas Realizadas

- ✅ Crear partida y unirse
- ✅ Lanzar dados y mover fichas
- ✅ Comprar propiedad (una sola vez)
- ✅ Pagar alquiler (una sola vez por casilla)
- ✅ Sacar carta de Eventos
- ✅ Sacar carta de Diñeiro  
- ✅ Caixa Veciñal (paga automáticamente)
- ✅ Casa do Pobo (cobra una sola vez)
- ✅ Campo de Fútbol / Granxa Eloi
- ✅ Construcción de casas
- ✅ Hipoteca / deshipoteca
- ✅ Cambio de turno
- ✅ Bancarrota
- ✅ Sincronización entre dispositivos
- ✅ Reconexión tras desconexión

### ⚠️ Limitaciones Pendientes

- Servicios: Aún requieren implementación manual/completa (no compilados en casillas fijas)
- Intercambio profesional: Mantiene versión rápida actual, mejora pendiente
- Chat: No implementado en esta versión
- Sonidos: Se mantienen los existentes
- Animaciones: Se mejoraron posiciones de fichas de V4, mantiene lógica

### 🔄 Cambios de API Interna (Compatibilidad)

**Sin cambios en esquema de Supabase:**
- Tabla `monopolis_games` mantiene estructura
- RLS policies sin cambios
- Campos JSON compatibles (agregados nuevos, sin borrar existentes)

**Cambios en estructura de `state`:**
- Agregados: `lastRent`, `lastDrawn`, `lastPotCollection`, `processedTransactions`
- Sin cambios en campos existentes (backward compatible)
- Normalización automática en `normalizeState()`

### 🚀 Instalación y Despliegue

1. Reemplazar archivos en repositorio:
   - `app.js` (refactorizado)
   - `data.js` (Cartiñas corregidas)
   - `styles.css` (sin cambios)
   - `index.html` (sin cambios)

2. Actualizar service worker:
   - Cambiar versión de cache en `sw.js`
   - Nueva versión: `o-monopolis-v5-0-20260801`

3. No requiere cambios en Supabase (compatible)

4. GitHub Pages: Commit y push como de costumbre

### 📊 Estadísticas

- Líneas de código modificadas: ~200
- Nuevas funciones: 1 (`withActionLock`)
- Funciones mejoradas: 15+
- Bugs críticos corregidos: 5
- Campos de estado agregados: 4

---

**Versión:** 5.0  
**Fecha:** 2026-08-01  
**Compatibilidad:** Supabase v2+  
**Navegadores:** Chrome, Safari, Firefox (Android & iOS)  
**Modo PWA:** Soportado con instalación como aplicación
