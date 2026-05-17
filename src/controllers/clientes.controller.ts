import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
export const getClientes = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const clientes = await prisma.cliente.findMany({
      where: { negocioId },
      orderBy: { creadoEn: 'desc' },
    });
    res.json({ data: clientes, error: null });
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ data: null, error: 'Error al obtener clientes' });
  }
};
export const getClienteById = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const cliente = await prisma.cliente.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        citas: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
        },
        solicitudes: {
          orderBy: { recibidaEn: 'desc' },
          take: 20,
        },
        pagos: {
          orderBy: { registradoEn: 'desc' },
          take: 20,
        },
      },
    });
    if (!cliente) {
      return res.status(404).json({ data: null, error: 'Cliente no encontrado' });
    }
    res.json({ data: cliente, error: null });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ data: null, error: 'Error al obtener cliente' });
  }
};
export const crearCliente = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { nombre, numeroWhatsapp } = req.body;
  try {
    if (!nombre || !numeroWhatsapp) {
      return res.status(400).json({ data: null, error: 'Nombre y número de WhatsApp son requeridos' });
    }
    if (nombre.trim().length < 2) {
      return res.status(400).json({ data: null, error: 'El nombre debe tener al menos 2 caracteres' });
    }
    const telefonoLimpio = numeroWhatsapp.replace(/[^0-9+]/g, '');
    if (telefonoLimpio.length < 8) {
      return res.status(400).json({ data: null, error: 'El número de WhatsApp debe tener al menos 8 dígitos' });
    }
    const existente = await prisma.cliente.findUnique({
      where: { numeroWhatsapp: telefonoLimpio },
    });
    if (existente) {
      return res.status(409).json({ data: null, error: 'Ya existe un cliente con ese número de WhatsApp' });
    }
    const nuevoCliente = await prisma.cliente.create({
      data: {
        negocioId,
        nombre: nombre.trim(),
        numeroWhatsapp: telefonoLimpio,
      },
    });
    res.status(201).json({ data: nuevoCliente, error: null });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ data: null, error: 'Error al crear cliente' });
  }
};
