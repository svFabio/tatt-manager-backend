import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const seg = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
const generateCode = () => `TATT-${seg()}-${seg()}-${seg()}-${seg()}`;

export const actualizarNombre = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    const { nombre } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
        return res.status(400).json({ error: 'El nombre del estudio debe tener al menos 2 caracteres' });
    }

    const nombreLimpio = nombre.trim();

    try {
        // verifivcar si ya existe otro negocio con ese nombre (excluyendo el actual)
        const negosioExistente = await prisma.negocio.findFirst({
            where: {
                nombre: nombreLimpio,
                NOT: { id: negocioId }
            }
        });

        if (negosioExistente) {
            return res.status(400).json({ error: 'Ya existe un estudio con ese nombre' });
        }

        const negocio = await prisma.negocio.update({
            where: { id: negocioId },
            data: { nombre: nombre.trim() },
            select: { id: true, nombre: true },
        });
        res.json({ negocio });
    } catch (error) {
        console.error('Error actualizando nombre del negocio:', error);
        res.status(500).json({ error: 'Error al actualizar el nombre del estudio' });
    }
};

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
