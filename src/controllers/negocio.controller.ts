import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const seg = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
const generateCode = () => `TATT-${seg()}-${seg()}-${seg()}-${seg()}`;

export const getInvitationCode = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const negocio = await prisma.negocio.findUnique({
            where: { id: negocioId },
            select: { codigoInvitacion: true },
        });
        if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

        let codigo = negocio.codigoInvitacion;
        if (!codigo) {
            codigo = generateCode();
            await prisma.negocio.update({ where: { id: negocioId }, data: { codigoInvitacion: codigo } });
        }
        res.json({ codigo });
    } catch (error) {
        console.error('Error obteniendo código de invitación:', error);
        res.status(500).json({ error: 'Error al obtener el código' });
    }
};

export const regenerateInvitationCode = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const codigo = generateCode();
        await prisma.negocio.update({ where: { id: negocioId }, data: { codigoInvitacion: codigo } });
        res.json({ codigo });
    } catch (error) {
        console.error('Error regenerando código de invitación:', error);
        res.status(500).json({ error: 'Error al regenerar el código' });
    }
};
