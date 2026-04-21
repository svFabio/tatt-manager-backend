import { Request, Response } from 'express';
import { PrismaClient, TamanioCap } from '@prisma/client';
import { entradaStock, ajusteStock } from '../services/stockService';
const prisma = new PrismaClient();
const TAMANIOS: TamanioCap[] = ['CHICA', 'MEDIANA', 'GRANDE'];
export const getTintas = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const tintas = await prisma.tinta.findMany({
      where: { negocioId, activa: true },
      include: {
        stock: {
          orderBy: { tamanioCap: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json({ data: tintas, error: null });
  } catch (error) {
    console.error('Error obteniendo tintas:', error);
    res.status(500).json({ data: null, error: 'Error al obtener tintas' });
  }
};
export const crearTinta = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { nombre, marca, color, colorHex } = req.body;
  try {
    if (!nombre || !marca || !color || !colorHex) {
      return res.status(400).json({ data: null, error: 'nombre, marca, color y colorHex son requeridos' });
    }
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(colorHex)) {
      return res.status(400).json({ data: null, error: 'colorHex debe tener formato #RRGGBB' });
    }
    const nuevaTinta = await prisma.tinta.create({
      data: {
        negocioId,
        nombre: nombre.trim(),
        marca: marca.trim(),
        color: color.trim(),
        colorHex: colorHex.toUpperCase(),
        stock: {
          create: TAMANIOS.map((tamanioCap) => ({
            tamanioCap,
            cantidadActual: 0,
            cantidadMinima: 3,
          })),
        },
      },
      include: { stock: true },
    });
    res.status(201).json({ data: nuevaTinta, error: null });
  } catch (error) {
    console.error('Error creando tinta:', error);
    res.status(500).json({ data: null, error: 'Error al crear tinta' });
  }
};
export const editarTinta = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  const { nombre, marca, color, colorHex } = req.body;
  try {
    const tinta = await prisma.tinta.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!tinta) {
      return res.status(404).json({ data: null, error: 'Tinta no encontrada' });
    }
    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre.trim();
    if (marca !== undefined) updateData.marca = marca.trim();
    if (color !== undefined) updateData.color = color.trim();
    if (colorHex !== undefined) {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!hexRegex.test(colorHex)) {
        return res.status(400).json({ data: null, error: 'colorHex debe tener formato #RRGGBB' });
      }
      updateData.colorHex = colorHex.toUpperCase();
    }
    const tintaActualizada = await prisma.tinta.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: { stock: true },
    });
    res.json({ data: tintaActualizada, error: null });
  } catch (error) {
    console.error('Error editando tinta:', error);
    res.status(500).json({ data: null, error: 'Error al editar tinta' });
  }
};
export const eliminarTinta = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const tinta = await prisma.tinta.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!tinta) {
      return res.status(404).json({ data: null, error: 'Tinta no encontrada' });
    }
    await prisma.tinta.update({
      where: { id: parseInt(id) },
      data: { activa: false },
    });
    res.json({ data: { message: 'Tinta desactivada correctamente' }, error: null });
  } catch (error) {
    console.error('Error eliminando tinta:', error);
    res.status(500).json({ data: null, error: 'Error al eliminar tinta' });
  }
};
export const entradaStockTinta = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tamanioCap, cantidad, motivo } = req.body;
  const usuarioId = req.usuario!.id;
  try {
    if (!tamanioCap || !cantidad || cantidad <= 0) {
      return res.status(400).json({ data: null, error: 'tamanioCap y cantidad (> 0) son requeridos' });
    }
    if (!TAMANIOS.includes(tamanioCap)) {
      return res.status(400).json({ data: null, error: `tamanioCap debe ser uno de: ${TAMANIOS.join(', ')}` });
    }
    const resultado = await entradaStock(parseInt(id), tamanioCap, cantidad, usuarioId, motivo);
    res.json({ data: resultado, error: null });
  } catch (error: any) {
    console.error('Error en entrada de stock:', error);
    if (error.status) {
      return res.status(error.status).json({ data: null, error: error.message });
    }
    res.status(500).json({ data: null, error: 'Error al registrar entrada de stock' });
  }
};
export const ajusteStockTinta = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tamanioCap, cantidad, motivo } = req.body;
  const usuarioId = req.usuario!.id;
  try {
    if (!tamanioCap || cantidad === undefined || cantidad === null) {
      return res.status(400).json({ data: null, error: 'tamanioCap y cantidad son requeridos' });
    }
    if (!motivo || motivo.trim().length === 0) {
      return res.status(400).json({ data: null, error: 'motivo es requerido para ajustes manuales' });
    }
    if (!TAMANIOS.includes(tamanioCap)) {
      return res.status(400).json({ data: null, error: `tamanioCap debe ser uno de: ${TAMANIOS.join(', ')}` });
    }
    const resultado = await ajusteStock(parseInt(id), tamanioCap, cantidad, usuarioId, motivo.trim());
    res.json({ data: resultado, error: null });
  } catch (error: any) {
    console.error('Error en ajuste de stock:', error);
    if (error.status) {
      return res.status(error.status).json({ data: null, error: error.message });
    }
    res.status(500).json({ data: null, error: 'Error al ajustar stock' });
  }
};
