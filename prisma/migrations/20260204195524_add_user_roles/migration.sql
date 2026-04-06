-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'STAFF');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "rol" "Rol" NOT NULL DEFAULT 'STAFF';
