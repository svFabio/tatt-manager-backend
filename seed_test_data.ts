import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando inyección de datos de prueba...");

  // 1. Crear un negocio dummy si no existe
  let negocio = await prisma.negocio.findFirst();
  if (!negocio) {
    negocio = await prisma.negocio.create({
      data: {
        googleId: "dummy_google_id_123",
        email: "test@tattoo.com",
        nombre: "Test Tattoo Studio",
      }
    });
    console.log("Negocio creado:", negocio.nombre);
  }

  // 2. Crear un cliente dummy si no existe
  let cliente = await prisma.cliente.findFirst();
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        nombre: "Messi",
        numeroWhatsapp: "123456789",
        negocioId: negocio.id
      }
    });
    console.log("Cliente creado:", cliente.nombre);
  }

  // 3. Crear la Solicitud
  const solicitud = await prisma.solicitud.create({
    data: {
      tipo: "Tatuaje Personalizado",
      estado: "PENDIENTE",
      zonaDelCuerpo: "Antebrazo",
      tamanoEnCm: "15x15",
      descripcion: "Diseño de un león realista con sombras",
      negocioId: negocio.id,
      clienteId: cliente.id
    }
  });

  console.log("¡Éxito! Se ha creado una Solicitud Pendiente en la Base de Datos:");
  console.log(solicitud);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
