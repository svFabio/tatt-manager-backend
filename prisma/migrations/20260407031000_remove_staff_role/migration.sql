-- Migrar usuarios existentes con rol STAFF → ARTISTA
UPDATE "Usuario" SET rol = 'ARTISTA' WHERE rol = 'STAFF';

-- En PostgreSQL no se puede eliminar un valor de un ENUM directamente.
-- Hay que recrear el tipo. Pasos:

-- 1. Quitar el default ANTES de cambiar el tipo (evita el error de cast)
ALTER TABLE "Usuario" ALTER COLUMN "rol" DROP DEFAULT;

-- 2. Crear el nuevo enum sin STAFF
CREATE TYPE "Rol_new" AS ENUM ('ADMIN', 'ARTISTA');

-- 3. Cambiar la columna para usar el nuevo tipo
ALTER TABLE "Usuario"
  ALTER COLUMN "rol" TYPE "Rol_new"
  USING ("rol"::text::"Rol_new");

-- 4. Volver a poner el default con el nuevo tipo
ALTER TABLE "Usuario" ALTER COLUMN "rol" SET DEFAULT 'ARTISTA'::"Rol_new";

-- 5. Eliminar el tipo viejo y renombrar el nuevo
DROP TYPE "Rol";
ALTER TYPE "Rol_new" RENAME TO "Rol";
