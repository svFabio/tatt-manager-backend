/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Buscar artista
  const artista = await prisma.usuario.findFirst({
    where: { email: 'michael.artista01@gmail.com' },
    include: { membresias: true }
  });
  if (!artista) { console.log('ARTISTA NO ENCONTRADO'); return; }
  console.log('Artista:', artista.id, artista.nombre);

  const negocioId = artista.membresias[0]?.negocioId;
  if (!negocioId) { console.log('SIN NEGOCIO'); return; }
  console.log('NegocioId:', negocioId);

  // 2. Buscar o crear un cliente de prueba
  let cliente = await prisma.cliente.findFirst({
    where: { negocioId, nombre: 'Cliente Prueba' }
  });
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: { nombre: 'Cliente Prueba', numeroWhatsapp: '59100000001', negocioId }
    });
  }
  console.log('ClienteId:', cliente.id);

  // 3. Crear citas de prueba para HOY con distintas duraciones
  const hoy = new Date();
  const año = hoy.getFullYear();
  const mes = hoy.getMonth();
  const dia = hoy.getDate();

  const citasData = [
    { inicio: new Date(año, mes, dia, 9, 0),  duracion: 2 },
    { inicio: new Date(año, mes, dia, 11, 0), duracion: 2.5 },
    { inicio: new Date(año, mes, dia, 14, 0), duracion: 1.5 },
  ];

  for (const c of citasData) {
    const fin = new Date(c.inicio.getTime() + c.duracion * 60 * 60 * 1000);
    const cita = await prisma.cita.create({
      data: {
        negocioId,
        clienteId: cliente.id,
        artistaId: artista.id,
        fechaHoraInicio: c.inicio,
        fechaHoraFin: fin,
        duracionEnHoras: c.duracion,
        estadoCita: 'CONFIRMADA',
        tipoCita: 'tatuaje',
        zonaDelCuerpo: 'Antebrazo',
        seniaPagada: 100,
      }
    });
    console.log(`Cita creada: #${cita.id} | ${c.inicio.toTimeString().slice(0,5)} - ${fin.toTimeString().slice(0,5)} | ${c.duracion}h`);
  }

  // 4. Verificar carga total
  const total = citasData.reduce((s, c) => s + c.duracion, 0);
  console.log(`\nTotal horas agendadas: ${total}h / 8h`);
  console.log(total > 8 ? '⚠ LÍMITE SUPERADO' : total >= 6 ? '⚠ Cerca del límite' : '✓ Dentro del límite');
}

main().catch(console.error).finally(() => prisma.$disconnect());
