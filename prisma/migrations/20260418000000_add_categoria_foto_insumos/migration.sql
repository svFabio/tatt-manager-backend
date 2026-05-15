-- AlterTable: add fotoUrl to Tinta
ALTER TABLE "Tinta" ADD COLUMN "fotoUrl" TEXT;

-- AlterTable: add categoria and fotoUrl to Aguja
ALTER TABLE "Aguja"
  ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'AGUJA',
  ADD COLUMN "fotoUrl"   TEXT;
