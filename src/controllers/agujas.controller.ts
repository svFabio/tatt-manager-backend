import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getAgujas = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const all = await prisma.aguja.findMany({
      where: { negocioId, activa: true },
    });
    const agujas = all.filter(a => a.categoria === 'AGUJA');
    const caps = all.filter(a => a.categoria === 'CAP');
    res.json({ data: agujas, caps, error: null });
  } catch (error) {
    console.error('Error obteniendo agujas:', error);
    res.status(500).json({ data: null, caps: null, error: 'Error al obtener agujas' });
  }
};
