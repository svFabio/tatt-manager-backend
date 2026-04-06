import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { enviarMensaje } from '../services/whatsappClient';

const prisma = new PrismaClient();

// Horarios definidos (mismos que whatsappClient)
const HORARIOS_DEFINIDOS = ["13:00", "14:00", "15:00", "16:00", "17:00"];

// Obtener Citas pendientes de validación del negocio autenticado
export const getPendientes = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const citas = await prisma.cita.findMany({
      where: { negocioId, estado: 'VALIDACION_PENDIENTE' },
      orderBy: { creadoEn: 'desc' }
    });
    res.json(citas);
  } catch {
    res.status(500).json({ error: 'Error obteniendo citas' });
  }
};

// Validar o Rechazar la cita
export const validarCita = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { accion } = req.body;
  const negocioId = req.negocioId!;

  try {
    const nuevoEstado = (accion === 'CONFIRMAR' || accion === 'APROBAR') ? 'CONFIRMADA' : 'CANCELADA';
    const dataUpdate = nuevoEstado === 'CONFIRMADA'
      ? { estado: nuevoEstado }
      : { estado: nuevoEstado, comprobanteUrl: null };

    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id), negocioId },
      data: dataUpdate
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('cambio-citas');
    }

    // Notificación WhatsApp al cliente
    try {
      let mensaje = '';
      if (nuevoEstado === 'CONFIRMADA') {
        const fechaFormateada = new Date(citaActualizada.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        mensaje =
          `¡Hola ${citaActualizada.clienteNombre || 'Cliente'}! 👋\n\n` +
          `✅ *Tu pago ha sido verificado y tu cita está CONFIRMADA.* 🎉\n\n` +
          `📋 *Detalles de tu cita:*\n` +
          `📅 Fecha: ${fechaFormateada}\n` +
          `⏰ Hora: ${citaActualizada.horario}\n` +
          `💆‍♀️ Servicio: ${citaActualizada.servicio || 'Spa'}\n\n` +
          `✨ ¡Te esperamos! Cualquier consulta, escríbenos.`;
      } else if (nuevoEstado === 'CANCELADA') {
        mensaje = `Hola ${citaActualizada.clienteNombre || 'Cliente'}. 😔\n\n❌ Tu cita ha sido cancelada.\n\nSi crees que es un error o deseas reagendar, por favor contáctanos.`;
      }

      if (mensaje) {
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

    res.json(citaActualizada);
  } catch (error) {
    console.error("Error validando cita:", error);
    res.status(500).json({ error: 'No se pudo procesar la validación' });
  }
};

// Agenda para el Calendario (con rango de fechas)
export const getAgenda = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const { desde, hasta } = req.query;
    const fechaDesde = desde
      ? new Date(desde as string)
      : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fechaHasta = hasta
      ? new Date(hasta as string)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const citas = await prisma.cita.findMany({
      where: {
        negocioId,
        fecha: { gte: fechaDesde, lte: fechaHasta },
        estado: { not: 'CANCELADA' }
      },
      orderBy: { fecha: 'asc' }
    });

    res.json(citas);
  } catch {
    res.status(500).json({ error: 'Error al cargar la agenda' });
  }
};

// Resumen para el Home
export const getResumen = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);

    const citasHoy = await prisma.cita.count({
      where: { negocioId, fecha: { gte: inicioHoy, lte: finHoy }, estado: 'CONFIRMADA' }
    });

    const pendientes = await prisma.cita.count({
      where: { negocioId, estado: 'VALIDACION_PENDIENTE' }
    });

    const proximasCitas = await prisma.cita.findMany({
      where: { negocioId, fecha: { gte: inicioHoy, lte: finHoy }, estado: { not: 'CANCELADA' } },
      orderBy: { horario: 'asc' },
      take: 5
    });

    const totalFuturas = await prisma.cita.count({
      where: { negocioId, fecha: { gte: new Date() }, estado: { not: 'CANCELADA' } }
    });

    res.json({ citasHoy, pendientes, proximasCitas, totalFuturas });
  } catch (error) {
    console.error("Error en resumen:", error);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
};

// Obtener horarios disponibles para una fecha
export const getHorariosDisponibles = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });

    const [year, month, day] = (fecha as string).split('-').map(Number);
    const inicio = new Date(year, month - 1, day);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio);
    fin.setHours(23, 59, 59, 999);

    const ocupadas = await prisma.cita.findMany({
      where: { negocioId, fecha: { gte: inicio, lte: fin }, estado: { notIn: ['CANCELADA'] } },
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

    res.json({ horarios: disponibles, fecha });
  } catch (error) {
    console.error("Error obteniendo horarios:", error);
    res.status(500).json({ error: 'Error al obtener horarios disponibles' });
  }
};

// Crear cita desde panel Admin (presencial)
export const crearCitaAdmin = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const { clienteNombre, clienteTelefono, fecha, horario } = req.body;

    if (!clienteNombre || !clienteTelefono || !fecha || !horario) {
      return res.status(400).json({ error: 'Todos los campos son requeridos: clienteNombre, clienteTelefono, fecha, horario' });
    }
    if (clienteNombre.trim().length < 3) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres.' });
    }
    const telefonoLimpio = clienteTelefono.replace(/\D/g, '');
    if (telefonoLimpio.length < 8) {
      return res.status(400).json({ error: 'El teléfono debe tener al menos 8 dígitos numéricos.' });
    }
    if (!HORARIOS_DEFINIDOS.includes(horario)) {
      return res.status(400).json({ error: `Horario inválido. Horarios disponibles: ${HORARIOS_DEFINIDOS.join(', ')}` });
    }

    const [year, month, day] = fecha.split('-').map(Number);
    const fechaCita = new Date(year, month - 1, day);
    const [horas, minutos] = horario.split(':').map(Number);
    fechaCita.setHours(horas, minutos, 0, 0);

    const citaExistente = await prisma.cita.findFirst({
      where: { negocioId, fecha: fechaCita, horario, estado: { not: 'CANCELADA' } }
    });

    if (citaExistente) {
      return res.status(409).json({ error: 'Este horario ya está ocupado. Por favor selecciona otro.' });
    }

    const nuevaCita = await prisma.cita.create({
      data: { negocioId, clienteNombre, clienteTelefono, fecha: fechaCita, horario, monto: 50, estado: 'CONFIRMADA', origen: 'presencial' }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('cambio-citas');
      io.emit('nueva-cita', { id: nuevaCita.id, clienteNombre: nuevaCita.clienteNombre, clienteTelefono: nuevaCita.clienteTelefono, fecha: nuevaCita.fecha, horario: nuevaCita.horario });
    }

    res.status(201).json(nuevaCita);
  } catch (error) {
    console.error("Error creando cita admin:", error);
    res.status(500).json({ error: 'Error al crear la cita' });
  }
};

// Reprogramar Cita
export const reprogramarCita = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fecha, horario } = req.body;
  const negocioId = req.negocioId!;

  try {
    if (!fecha || !horario) return res.status(400).json({ error: 'Fecha y horario son requeridos' });
    if (!HORARIOS_DEFINIDOS.includes(horario)) return res.status(400).json({ error: `Horario inválido. Disponibles: ${HORARIOS_DEFINIDOS.join(', ')}` });

    const [year, month, day] = fecha.split('-').map(Number);
    const nuevaFecha = new Date(year, month - 1, day);
    const [horas, minutos] = horario.split(':').map(Number);
    nuevaFecha.setHours(horas, minutos, 0, 0);

    const citaActual = await prisma.cita.findUnique({ where: { id: parseInt(id), negocioId } });
    if (!citaActual) return res.status(404).json({ error: 'Cita no encontrada' });

    const ocupado = await prisma.cita.findFirst({
      where: { negocioId, fecha: nuevaFecha, horario, estado: { not: 'CANCELADA' }, NOT: { id: parseInt(id) } }
    });
    if (ocupado) return res.status(409).json({ error: 'Ese horario ya está ocupado.' });

    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id) },
      data: { fecha: nuevaFecha, horario }
    });

    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');

    res.json(citaActualizada);
  } catch (error) {
    console.error("Error reprogramando cita:", error);
    res.status(500).json({ error: 'Error al reprogramar la cita' });
  }
};

// Marcar como NO ASISTIO
export const marcarNoAsistio = async (req: Request, res: Response) => {
  const { id } = req.params;
  const negocioId = req.negocioId!;

  try {
    const cita = await prisma.cita.findUnique({ where: { id: parseInt(id), negocioId } });
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    const ahora = new Date();
    const [year, month, day] = new Date(cita.fecha).toISOString().split('T')[0].split('-').map(Number);
    const fechaExacta = new Date(year, month - 1, day);
    const [horas, minutos] = cita.horario.split(':').map(Number);
    fechaExacta.setHours(horas, minutos, 0, 0);

    if (fechaExacta > ahora) return res.status(400).json({ error: 'Solo se pueden marcar como "No Asistió" citas pasadas.' });

    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id) },
      data: { estado: 'NO_ASISTIO' }
    });

    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');

    res.json(citaActualizada);
  } catch (error) {
    console.error("Error marcando no asistió:", error);
    res.status(500).json({ error: 'Error al actualizar la cita' });
  }
};

// Marcar como ASISTIO
export const marcarAsistio = async (req: Request, res: Response) => {
  const { id } = req.params;
  const negocioId = req.negocioId!;

  try {
    const cita = await prisma.cita.findUnique({ where: { id: parseInt(id), negocioId } });
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id) },
      data: { estado: 'CONFIRMADA' }
    });

    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');

    res.json(citaActualizada);
  } catch (error) {
    console.error("Error marcando como asistió:", error);
    res.status(500).json({ error: 'Error al actualizar la cita' });
  }
};

// Actualizar descripción de cita
export const actualizarDescripcion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { descripcion } = req.body;
  const negocioId = req.negocioId!;

  try {
    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id), negocioId },
      data: { descripcion: descripcion || null }
    });
    res.json(citaActualizada);
  } catch (error) {
    console.error('Error actualizando descripción:', error);
    res.status(500).json({ error: 'Error al actualizar descripción' });
  }
};