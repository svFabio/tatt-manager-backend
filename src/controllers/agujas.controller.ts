import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getAgujas = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const agujas = await prisma.aguja.findMany({
      where: { negocioId, activa: true },
    });
    res.json({ data: agujas, error: null });
  } catch (error) {
    console.error('Error obteniendo agujas:', error);
    res.status(500).json({ data: null, error: 'Error al obtener agujas' });
  }
};
