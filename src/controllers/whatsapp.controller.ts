import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';

const service = new WhatsAppService();

export class WhatsAppController {
  async getChats(req: Request, res: Response) {
    try {
      const negocioId = req.negocioId || 1; 
      const chats = await service.getAllChats(Number(negocioId));
      res.json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los chats' });
    }
  }

  async getMessages(req: Request, res: Response) {
    try {
      const { chatId } = req.params; // remoteJid
      const negocioId = req.negocioId || 1;
      
      const messages = await service.getChatMessages(String(chatId), Number(negocioId));
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener mensajes' });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const { chatId, texto } = req.body;
      const negocioId = req.negocioId || 1;

      const response = await service.sendWhatsAppMessage(String(chatId), String(texto), Number(negocioId));
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: 'Error al enviar mensaje' });
    }
  }

  async searchChats(req: Request, res: Response) {
    try {
      const query = String(req.query.query || '');
      const negocioId = req.negocioId || 1;
      
      const chats = await service.search(query, Number(negocioId));
      res.json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Error en la búsqueda' });
    }
  }
}