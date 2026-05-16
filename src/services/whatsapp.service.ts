import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WhatsAppService {
  // 1. Obtener chats usando los campos exactos de tu schema
  async getAllChats(negocioId: number) {
    return await prisma.sesionChat.findMany({
      where: { negocioId },
      orderBy: { ultimoMensaje: 'desc' }
    });
  }

  // 2. Obtener mensajes (remoteJid y timestamp existen en tu index)
  async getChatMessages(remoteJid: string, negocioId: number) {
    return await prisma.mensajeChat.findMany({
      where: { 
        remoteJid: remoteJid,
        negocioId: negocioId
      },
      orderBy: { timestamp: 'asc' }
    });
  }

  // 3. Crear mensaje (usando 'contenido' y 'Negocio' con N mayúscula)
  async sendWhatsAppMessage(remoteJid: string, contenido: string, negocioId: number) {
    return await prisma.mensajeChat.create({
      data: {
        remoteJid: remoteJid,
        contenido: contenido,
        direccion: 'salida',
        negocioId: negocioId,
        timestamp: new Date()
      }
    });
  }

  // 4. Búsqueda (Como el schema original NO tiene campo 'nombre', buscamos por remoteJid)
  async search(query: string, negocioId: number) {
    return await prisma.sesionChat.findMany({
      where: {
        negocioId: negocioId,
        remoteJid: { contains: query, mode: 'insensitive' }
      },
      orderBy: { ultimoMensaje: 'desc' }
    });
  }
}