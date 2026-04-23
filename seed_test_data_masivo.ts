import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando inyección masiva de datos...");

  // Buscar todos los negocios existentes
  const negocios = await prisma.negocio.findMany();
  
  if (negocios.length === 0) {
    console.log("No hay negocios creados. Creando uno de emergencia...");
    const neg = await prisma.negocio.create({
      data: { googleId: "123", email: "test2@test.com", nombre: "Negocio Vacio" }
    });
    negocios.push(neg);
  }

  for (const negocio of negocios) {
    let cliente = await prisma.cliente.findFirst({ where: { negocioId: negocio.id } });
    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: {
          nombre: "Messi",
          numeroWhatsapp: "1234444_" + negocio.id,
          negocioId: negocio.id
        }
      });
    }

    const sol = await prisma.solicitud.create({
      data: {
        tipo: "Tatuaje Personalizado",
        estado: "PENDIENTE",
        zonaDelCuerpo: "Mano",
        tamanoEnCm: "10x10",
        descripcion: "Tatuaje inyectado por bot para " + negocio.nombre,
        negocioId: negocio.id,
        clienteId: cliente.id
      }
    });
    
    console.log(`Solicitud inyectada para Negocio ID: ${negocio.id} (${negocio.nombre})`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
