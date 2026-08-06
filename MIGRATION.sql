-- O Monopolis V5 · Migración (Informativa)
--
-- IMPORTANTE: Esta migración es INFORMATIVA solamente.
-- No se requiere ejecutarla porque la tabla y políticas ya existen
-- desde las versiones anteriores.
--
-- Los cambios en V5 son internos al campo JSON 'state', no en el esquema.
-- Supabase manejará automáticamente los nuevos campos JSON.

-- Si quieres ejecutar esto por documentación:

-- 1. Verificar que la tabla existe (ya debería estar):
SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'monopolis_games');

-- 2. Verificar que RLS está habilitado:
SELECT relname, rowsecurity FROM pg_class WHERE relname = 'monopolis_games';

-- 3. Las políticas ya están configuradas correctamente desde V4:
-- - "monopolis read": SELECT para todos
-- - "monopolis insert": INSERT para todos
-- - "monopolis update": UPDATE para todos

-- 4. El campo 'state' es JSONB y soporta cualquier estructura JSON
-- Los nuevos campos en V5 se agregan automáticamente:
-- - state.lastRent
-- - state.lastDrawn  
-- - state.lastPotCollection
-- - state.processedTransactions

-- 5. Para verificar que el sistema funciona, puedes consultar:
SELECT code, jsonb_path_exists(state, '$.lastPotCollection') as has_v5_fields
FROM monopolis_games
LIMIT 5;

-- NOTAS DE COMPATIBILIDAD:
-- - Partidas antiguas (V4) cargarán sin problemas
-- - Los campos V5 se crean automáticamente en normalizeState()
-- - Sin necesidad de migración de datos
-- - Sin downtime requerido
