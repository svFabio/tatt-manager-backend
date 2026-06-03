import { Request, Response } from 'express';
import { Prisma, EstadoSolicitud } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { enviarMensaje } from '../services/whatsappClient';
export const getSolicitudes = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { estado } = req.query;
  const rol = req.estudioActivo?.rol;
  const usuarioId = req.usuario?.id;
  try {
    const where: Prisma.SolicitudWhereInput = { negocioId };
    if (estado && ['PENDIENTE', 'COTIZADA', 'RECHAZADA'].includes(estado as string)) {
      where.estado = estado as EstadoSolicitud;
    }
    // ARTISTA solo ve solicitudes asignadas a él
    if (rol === 'ARTISTA' && usuarioId) {
      where.artistaId = usuarioId;
    }
    const solicitudes = await prisma.solicitud.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
      },
      orderBy: { recibidaEn: 'desc' },
    });
    res.json({ data: solicitudes, error: null });
  } catch (error) {
    console.error('Error obteniendo solicitudes:', error);
    res.status(500).json({ data: null, error: 'Error al obtener solicitudes' });
  }
};
export const getSolicitudById = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        cliente: true,
        artista: { select: { id: true, nombre: true, email: true } },
        cita: true,
        mensajes: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    res.json({ data: solicitud, error: null });
  } catch (error) {
    console.error('Error obteniendo solicitud:', error);
    res.status(500).json({ data: null, error: 'Error al obtener solicitud' });
  }
};
export const cotizarSolicitud = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  const { precioCotizado, horasEstimadas, seniaRequerida, artistaId, mensajePersonalizado } = req.body;
  try {
    if (precioCotizado === undefined || precioCotizado === null) {
      return res.status(400).json({ data: null, error: 'precioCotizado es requerido' });
    }
    if (horasEstimadas === undefined || horasEstimadas === null) {
      return res.status(400).json({ data: null, error: 'horasEstimadas es requerido' });
    }
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(400).json({ data: null, error: `No se puede cotizar una solicitud en estado ${solicitud.estado}` });
    }
    if (artistaId) {
      const artista = await prisma.usuario.findFirst({
        where: { id: artistaId, membresias: { some: { negocioId } } },
      });
      if (!artista) {
        return res.status(404).json({ data: null, error: 'Artista no encontrado en este negocio' });
      }
    }
    const solicitudActualizada = await prisma.solicitud.update({
      where: { id: parseInt(id) },
      data: {
        estado: 'COTIZADA',
        precioCotizado,
        horasEstimadas,
        seniaRequerida: seniaRequerida !== undefined ? seniaRequerida : solicitud.seniaRequerida,
        artistaId: artistaId !== undefined ? artistaId : solicitud.artistaId,
        cotizadaEn: new Date(),
      },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
      },
    });

    let mensajeWhatsAppEnviado = false;
    if (solicitudActualizada.cliente && solicitudActualizada.cliente.numeroWhatsapp) {
      const numero = solicitudActualizada.cliente.numeroWhatsapp;

      // Buscar el último mensaje de este número para saber si es @s.whatsapp.net o @lid
      const ultimoMensaje = await prisma.mensajeChat.findFirst({
        where: {
          negocioId,
          remoteJid: { startsWith: numero }
        },
        orderBy: { timestamp: 'desc' }
      });

      const jid = ultimoMensaje ? ultimoMensaje.remoteJid : `${numero}@s.whatsapp.net`;

      let mensaje = `Hola ${solicitudActualizada.cliente.nombre},\n\nTu solicitud de tatuaje ha sido revisada.\n💰 Costo total: Bs. ${precioCotizado}\n...`;
      if (mensajePersonalizado) {
        mensaje += `\n💬 *Mensaje del estudio:* ${mensajePersonalizado}\n`;
      }
      mensaje += `\n¿Para qué fecha te gustaría agendar tu cita? (Ej. "mañana", "el próximo viernes", "20 de mayo")`;
      mensajeWhatsAppEnviado = await enviarMensaje(negocioId, jid, mensaje);

      if (mensajeWhatsAppEnviado) {
        const datosSesion = {
          solicitudId: solicitudActualizada.id,
          horasEstimadas: horasEstimadas,
          nombre: solicitudActualizada.cliente.nombre,
          precioCotizado: precioCotizado,
          artistaId: solicitudActualizada.artistaId,
          artistaNombre: solicitudActualizada.artista?.nombre || 'el artista asignado'
        };

        const sesionExistente = await prisma.sesionChat.findUnique({ where: { id_negocioId: { id: jid, negocioId } } });
        if (sesionExistente) {
          await prisma.sesionChat.update({
            where: { id_negocioId: { id: jid, negocioId } },
            data: { estado: 'ESPERANDO_FECHA', datos: datosSesion, ultimoMensaje: new Date() }
          });
        } else {
          await prisma.sesionChat.create({
            data: { id: jid, negocioId, estado: 'ESPERANDO_FECHA', datos: datosSesion }
          });
        }
      }
      return res.status(200).json({
        data: solicitudActualizada,
        error: null,
        warning: 'La cotización se guardó correctamente, pero no se pudo enviar el mensaje por WhatsApp. Asegúrate de que el bot esté conectado.'
      });
    }

    res.json({ data: solicitudActualizada, error: null, mensajeEnviado: true });
  } catch (error: unknown) {
    const e = error as { message?: string; stack?: string };
    console.error('Error cotizando solicitud:', e.message || error);
    console.error('Stack:', e.stack);
    res.status(500).json({ data: null, error: 'Error al cotizar solicitud' });
  }
};
export const rechazarSolicitud = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    if (solicitud.estado === 'RECHAZADA') {
      return res.status(400).json({ data: null, error: 'La solicitud ya está rechazada' });
    }
    const solicitudActualizada = await prisma.solicitud.update({
      where: { id: parseInt(id) },
      data: { estado: 'RECHAZADA' },
    });
    res.json({ data: solicitudActualizada, error: null });
  } catch (error) {
    console.error('Error rechazando solicitud:', error);
    res.status(500).json({ data: null, error: 'Error al rechazar solicitud' });
  }
};
