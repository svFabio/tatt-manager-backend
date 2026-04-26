import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const s = await p.solicitud.findFirst({
    where: { id: 14 },
    include: { cliente: true }
  });
  console.log('=== Solicitud 14 ===');
  console.log(JSON.stringify(s, null, 2));

  if (s && s.cliente) {
    const numero = s.cliente.numeroWhatsapp;
    console.log('\n=== Numero del cliente ===');
    console.log(`"${numero}" (length: ${numero.length})`);

    const msgs = await p.mensajeChat.findMany({
      where: {
        negocioId: 1,
        remoteJid: { contains: numero.slice(0, 10) }
      },
      orderBy: { timestamp: 'desc' },
      take: 3
    });
    console.log('\n=== Mensajes encontrados con ese numero ===');
    console.log(JSON.stringify(msgs, null, 2));
  }

  // Tambien ver los ultimos mensajes en general
  const ultimosMsgs = await p.mensajeChat.findMany({
    where: { negocioId: 1 },
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: { remoteJid: true, direccion: true, timestamp: true }
  });
  console.log('\n=== Ultimos 5 mensajes (remoteJid) ===');
  console.log(JSON.stringify(ultimosMsgs, null, 2));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
