import { PrismaClient } from '@prisma/client';
import { enviarMensaje } from './whatsappClient';

const prisma = new PrismaClient();
const HORARIOS_DEFINIDOS = ["13:00", "14:00", "15:00", "16:00", "17:00"];

export class CitasService {
  static async getPendientes(negocioId: number) {
    return await prisma.cita.findMany({
      where: { negocioId, estadoLegacy: 'VALIDACION_PENDIENTE' },
      orderBy: { creadoEn: 'desc' }
    });
  }

  static async validarCita(id: number, accion: string, negocioId: number) {
    const nuevoEstado = (accion === 'CONFIRMAR' || accion === 'APROBAR') ? 'CONFIRMADA' : 'CANCELADA';
    const dataUpdate = nuevoEstado === 'CONFIRMADA'
      ? { estadoLegacy: nuevoEstado }
      : { estadoLegacy: nuevoEstado, comprobanteUrl: null };

    const citaActualizada = await prisma.cita.update({
      where: { id, negocioId },
      data: dataUpdate
    });

    try {
      let mensaje = '';
      if (nuevoEstado === 'CONFIRMADA') {
        const fechaFormateada = new Date(citaActualizada.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        mensaje = `¡Hola ${citaActualizada.clienteNombre || 'Cliente'}! 👋\n\n✅ *Tu pago ha sido verificado y tu cita está CONFIRMADA.* 🎉\n\n📋 *Detalles de tu cita:*\n📅 Fecha: ${fechaFormateada}\n⏰ Hora: ${citaActualizada.horario}\n💆‍♀️ Servicio: ${citaActualizada.servicio || 'Spa'}\n\n✨ ¡Te esperamos! Cualquier consulta, escríbenos.`;
      } else if (nuevoEstado === 'CANCELADA') {
        mensaje = `Hola ${citaActualizada.clienteNombre || 'Cliente'}. 😔\n\n❌ Tu cita ha sido cancelada.\n\nSi crees que es un error o deseas reagendar, por favor contáctanos.`;
      }

      if (mensaje && citaActualizada.clienteTelefono) {
        const ultimoMsgEntrante = await prisma.mensajeChat.findFirst({
          where: {
            negocioId,
            remoteJid: { contains: citaActualizada.clienteTelefono },
            direccion: 'ENTRANTE'
          },
          orderBy: { timestamp: 'desc' },
          select: { remoteJid: true }
        });
        const jid = ultimoMsgEntrante?.remoteJid || `${citaActualizada.clienteTelefono}@s.whatsapp.net`;
        await enviarMensaje(negocioId, jid, mensaje);
      }
    } catch (msgError) {
      console.error('[Validar] ❌ Error enviando notificación:', msgError);
    }
    return citaActualizada;
  }

  static async getAgenda(negocioId: number, desde?: string, hasta?: string) {
    const fechaDesde = desde ? new Date(desde) : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fechaHasta = hasta ? new Date(hasta) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return await prisma.cita.findMany({
      where: {
        negocioId,
        fecha: { gte: fechaDesde, lte: fechaHasta },
        estadoLegacy: { not: 'CANCELADA' }
      },
      orderBy: { fecha: 'asc' }
    });
  }

  static async getResumen(negocioId: number) {
    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
    
    const citasHoy = await prisma.cita.count({
      where: { negocioId, fecha: { gte: inicioHoy, lte: finHoy }, estadoLegacy: 'CONFIRMADA' }
    });
    const pendientes = await prisma.cita.count({
      where: { negocioId, estadoLegacy: 'VALIDACION_PENDIENTE' }
    });
    const proximasCitas = await prisma.cita.findMany({
      where: { negocioId, fecha: { gte: inicioHoy, lte: finHoy }, estadoLegacy: { not: 'CANCELADA' } },
      orderBy: { horario: 'asc' },
      take: 5
    });
    const totalFuturas = await prisma.cita.count({
      where: { negocioId, fecha: { gte: new Date() }, estadoLegacy: { not: 'CANCELADA' } }
    });
    return { citasHoy, pendientes, proximasCitas, totalFuturas };
  }

  static async getHorariosDisponibles(negocioId: number, fecha: string) {
    const [year, month, day] = fecha.split('-').map(Number);
    const inicio = new Date(year, month - 1, day);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio);
    fin.setHours(23, 59, 59, 999);
    
    const ocupadas = await prisma.cita.findMany({
      where: { negocioId, fecha: { gte: inicio, lte: fin }, estadoLegacy: { notIn: ['CANCELADA'] } },
      select: { horario: true }
    });
    
    const horasOcupadas = ocupadas.map(c => c.horario);
    let disponibles = HORARIOS_DEFINIDOS.filter(h => !horasOcupadas.includes(h));
    
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" }));
    const esHoy = ahora.getFullYear() === year && ahora.getMonth() === (month - 1) && ahora.getDate() === day;
    
    if (esHoy) {
      const horaActual = ahora.getHours();
      const minutoActual = ahora.getMinutes();
      disponibles = disponibles.filter(horario => {
        const [hora, minuto] = horario.split(':').map(Number);
        return hora > horaActual || (hora === horaActual && minuto > minutoActual);
      });
    }
    return disponibles;
  }

  static async crearCitaAdmin(negocioId: number, data: any) {
    const { clienteNombre, clienteTelefono, fecha, horario } = data;
    
    const telefonoLimpio = clienteTelefono.replace(/\D/g, '');
    if (telefonoLimpio.length < 8) throw { status: 400, message: 'El teléfono debe tener al menos 8 dígitos numéricos.' };
    if (!HORARIOS_DEFINIDOS.includes(horario)) throw { status: 400, message: `Horario inválido.` };
    
    const [year, month, day] = fecha.split('-').map(Number);
    const fechaCita = new Date(year, month - 1, day);
    const [horas, minutos] = horario.split(':').map(Number);
    fechaCita.setHours(horas, minutos, 0, 0);
    
    const citaExistente = await prisma.cita.findFirst({
      where: { negocioId, fecha: fechaCita, horario, estadoLegacy: { not: 'CANCELADA' } }
    });
    if (citaExistente) throw { status: 409, message: 'Este horario ya está ocupado.' };
    
    return await prisma.cita.create({
      data: { negocioId, clienteNombre, clienteTelefono, fecha: fechaCita, horario, monto: 50, estadoLegacy: 'CONFIRMADA', origen: 'presencial' }
    });
  }

  static async reprogramarCita(id: number, negocioId: number, fecha: string, horario: string) {
    if (!HORARIOS_DEFINIDOS.includes(horario)) throw { status: 400, message: `Horario inválido.` };
    const [year, month, day] = fecha.split('-').map(Number);
    const nuevaFecha = new Date(year, month - 1, day);
    const [horas, minutos] = horario.split(':').map(Number);
    nuevaFecha.setHours(horas, minutos, 0, 0);

    const citaActual = await prisma.cita.findUnique({ where: { id, negocioId } });
    if (!citaActual) throw { status: 404, message: 'Cita no encontrada' };

    const ocupado = await prisma.cita.findFirst({
      where: { negocioId, fecha: nuevaFecha, horario, estadoLegacy: { not: 'CANCELADA' }, NOT: { id } }
    });
    if (ocupado) throw { status: 409, message: 'Ese horario ya está ocupado.' };

    return await prisma.cita.update({
      where: { id },
      data: { fecha: nuevaFecha, horario }
    });
  }

  static async cambiarEstadoLegacy(id: number, negocioId: number, nuevoEstado: string, verificarPasado: boolean = false) {
    const cita = await prisma.cita.findUnique({ where: { id, negocioId } });
    if (!cita) throw { status: 404, message: 'Cita no encontrada' };

    if (verificarPasado) {
      const ahora = new Date();
      const [year, month, day] = new Date(cita.fecha).toISOString().split('T')[0].split('-').map(Number);
      const fechaExacta = new Date(year, month - 1, day);
      const [horas, minutos] = cita.horario.split(':').map(Number);
      fechaExacta.setHours(horas, minutos, 0, 0);
      if (fechaExacta > ahora) throw { status: 400, message: `Solo se pueden marcar citas pasadas.` };
    }

    return await prisma.cita.update({
      where: { id },
      data: { estadoLegacy: nuevoEstado }
    });
  }

  static async actualizarDescripcion(id: number, negocioId: number, descripcion: string) {
    return await prisma.cita.update({
      where: { id, negocioId },
      data: { descripcion: descripcion || null }
    });
  }

  // Lógica de tatuaje nueva
  static async crearCitaTatuaje(negocioId: number, input: any) {
    const { fechaHoraInicio, duracionEnHoras: duracionInput, tipoCita = 'tatuaje', artistaId, clienteId, solicitudId, estiloDeTatuaje, zonaDelCuerpo, seniaPagada = 0 } = input;
    
    const duracionEnHoras = tipoCita === 'consulta' ? 0.5 : parseFloat(duracionInput);
    if (!duracionEnHoras || duracionEnHoras <= 0) throw { status: 400, message: 'duracionEnHoras debe ser mayor a 0' };

    const inicio = new Date(fechaHoraInicio);
    const fin = new Date(inicio.getTime() + duracionEnHoras * 60 * 60 * 1000);

    const artista = await prisma.usuario.findFirst({ where: { id: artistaId, negocioId } });
    if (!artista) throw { status: 404, message: 'Artista no encontrado en este negocio' };
    
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, negocioId } });
    if (!cliente) throw { status: 404, message: 'Cliente no encontrado en este negocio' };

    const citaSolapada = await prisma.cita.findFirst({
      where: {
        negocioId, artistaId, estadoCita: { in: ['PENDIENTE', 'CONFIRMADA'] },
        fechaHoraInicio: { lt: fin }, fechaHoraFin: { gt: inicio },
      },
    });
    if (citaSolapada) throw { status: 409, message: `El artista tiene una cita que se solapa (Cita #${citaSolapada.id})` };

    return await prisma.cita.create({
      data: {
        negocioId, fechaHoraInicio: inicio, fechaHoraFin: fin, duracionEnHoras, tipoCita, estadoCita: 'PENDIENTE',
        estiloDeTatuaje: estiloDeTatuaje || null, zonaDelCuerpo: zonaDelCuerpo || null, seniaPagada: seniaPagada || 0,
        clienteId, artistaId, solicitudId: solicitudId || null,
      },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
      },
    });
  }

  static async getDisponibilidad(negocioId: number, artistaId: number, fecha: string, duracion: number) {
    const [year, month, day] = fecha.split('-').map(Number);
    const inicioDia = new Date(year, month - 1, day, 9, 0, 0); 
    const finDia = new Date(year, month - 1, day, 20, 0, 0); 
    
    const citasDelDia = await prisma.cita.findMany({
      where: { negocioId, artistaId, estadoCita: { in: ['PENDIENTE', 'CONFIRMADA'] }, fechaHoraInicio: { gte: inicioDia, lt: finDia } },
      orderBy: { fechaHoraInicio: 'asc' },
      select: { fechaHoraInicio: true, fechaHoraFin: true },
    });

    const duracionMs = duracion * 60 * 60 * 1000;
    const slots: { inicio: string; fin: string }[] = [];
    const bloques = citasDelDia
      .filter(c => c.fechaHoraInicio && c.fechaHoraFin)
      .map(c => ({ inicio: new Date(c.fechaHoraInicio!).getTime(), fin: new Date(c.fechaHoraFin!).getTime() }))
      .sort((a, b) => a.inicio - b.inicio);

    let cursor = inicioDia.getTime();
    for (const bloque of bloques) {
      if (bloque.inicio > cursor) {
        let slotInicio = cursor;
        while (slotInicio + duracionMs <= bloque.inicio) {
          slots.push({ inicio: new Date(slotInicio).toISOString(), fin: new Date(slotInicio + duracionMs).toISOString() });
          slotInicio += 30 * 60 * 1000; 
        }
      }
      cursor = Math.max(cursor, bloque.fin);
    }
    if (cursor < finDia.getTime()) {
      let slotInicio = cursor;
      while (slotInicio + duracionMs <= finDia.getTime()) {
        slots.push({ inicio: new Date(slotInicio).toISOString(), fin: new Date(slotInicio + duracionMs).toISOString() });
        slotInicio += 30 * 60 * 1000;
      }
    }
    return slots;
  }

  static async cambiarEstadoNuevo(id: number, negocioId: number, estadoFaltante: string) {
    const cita = await prisma.cita.findFirst({ where: { id, negocioId } });
    if (!cita) throw { status: 404, message: 'Cita no encontrada' };
    
    if (estadoFaltante === 'CONFIRMADA' && (cita.estadoCita === 'FINALIZADA' || cita.estadoCita === 'CANCELADA')) {
      throw { status: 400, message: `No se puede confirmar una cita en estado ${cita.estadoCita}` };
    }
    if (estadoFaltante === 'CANCELADA' && cita.estadoCita === 'FINALIZADA') {
      throw { status: 400, message: 'No se puede cancelar una cita ya finalizada' };
    }

    return await prisma.cita.update({
      where: { id },
      data: { estadoCita: estadoFaltante as any },
    });
  }
}
