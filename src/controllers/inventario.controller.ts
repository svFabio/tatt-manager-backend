import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ajusteRapidoAguja } from '../services/stockService';
import { uploadToCloudinary } from '../services/uploadService';

const CAP_LABEL: Record<string, string> = {
  CHICA: 'Cap Ch',
  MEDIANA: 'Cap M',
  GRANDE: 'Cap G',
};

type ItemInventario = {
  tipo: 'tinta' | 'aguja';
  refId: number;
  nombre: string;
  marca: string;
  cantidadActual: number;
  cantidadMinima: number;
  unidad: 'ml' | 'un';
  esBajo: boolean;
  colorHex?: string;
  fotoUrl?: string;
};

function normalizarTinta(stock: any): ItemInventario {
  return {
    tipo: 'tinta',
    refId: stock.id,
    nombre: stock.tinta.nombre, // Solo el nombre, sin etiquetas de Cap
    marca: stock.tinta.marca,
    cantidadActual: stock.cantidadActual,
    cantidadMinima: stock.cantidadMinima,
    unidad: 'ml',
    esBajo: stock.cantidadActual < stock.cantidadMinima,
    colorHex: stock.tinta.colorHex,
  };
}

function normalizarAguja(aguja: any): ItemInventario {
  return {
    tipo: 'aguja',
    refId: aguja.id,
    nombre: aguja.nombre,
    marca: aguja.marca,
    cantidadActual: aguja.cantidadActual,
    cantidadMinima: aguja.cantidadMinima,
    unidad: 'un',
    esBajo: aguja.cantidadActual < aguja.cantidadMinima,
  };
}

export const getInventario = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const buscar = (req.query.buscar as string | undefined)?.toLowerCase().trim();

  try {
    const [stocks, agujas] = await Promise.all([
      prisma.stockTinta.findMany({
        where: { 
          tinta: { negocioId, activa: true },
          tamanioCap: 'CHICA' // Solo traemos la 'CHICA' que ahora representa el stock global en ml
        },
        include: { tinta: { select: { nombre: true, marca: true, colorHex: true } } },
        orderBy: [{ tinta: { nombre: 'asc' } }],
      }),
      prisma.aguja.findMany({
        where: { negocioId, activa: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    let items: ItemInventario[] = [
      ...stocks.map(normalizarTinta),
      ...agujas.map(normalizarAguja),
    ];

    if (buscar) {
      items = items.filter(
        (i) =>
          i.nombre.toLowerCase().includes(buscar) ||
          i.marca.toLowerCase().includes(buscar)
      );
    }

    const enStockBajo = items.filter((i) => i.esBajo).length;

    res.json({
      ok: true,
      data: {
        stats: {
          totalItems: items.length,
          enStockBajo,
          enStockNormal: items.length - enStockBajo,
        },
        items,
      },
    });
  } catch (error) {
    console.error('Error obteniendo inventario:', error);
    res.status(500).json({ ok: false, error: 'Error al obtener inventario' });
  }
};

export const ajusteRapido = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const usuarioId = req.usuario!.id;
  const { tipo, refId, delta } = req.body;

  if (!tipo || refId === undefined || delta === undefined) {
    return res.status(400).json({ ok: false, error: 'tipo, refId y delta son requeridos' });
  }
  if (!['tinta', 'aguja'].includes(tipo)) {
    return res.status(400).json({ ok: false, error: 'tipo debe ser "tinta" o "aguja"' });
  }
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ ok: false, error: 'delta debe ser un entero distinto de cero' });
  }

  try {
    if (tipo === 'tinta') {
      const stock = await prisma.stockTinta.findUnique({
        where: { id: parseInt(refId) },
        include: { tinta: { select: { negocioId: true, nombre: true, marca: true, colorHex: true } } },
      });
      if (!stock || stock.tinta.negocioId !== negocioId) {
        return res.status(404).json({ ok: false, error: 'Stock de tinta no encontrado' });
      }
      const nuevaCantidad = stock.cantidadActual + delta;
      if (nuevaCantidad < 0) {
        return res.status(400).json({
          ok: false,
          error: `El ajuste dejaría el stock en negativo (actual: ${stock.cantidadActual}, ajuste: ${delta})`,
        });
      }
      const [updatedStock] = await prisma.$transaction([
        prisma.stockTinta.update({
          where: { id: stock.id },
          data: { cantidadActual: nuevaCantidad, actualizadoEn: new Date() },
        }),
        prisma.historialInventario.create({
          data: {
            tipoMovimiento: 'AJUSTE_MANUAL',
            cantidad: delta,
            motivo: 'Ajuste rápido desde inventario',
            stockTintaId: stock.id,
            registradoPorId: usuarioId,
          },
        }),
      ]);
      const item: ItemInventario = {
        tipo: 'tinta',
        refId: updatedStock.id,
        nombre: `${stock.tinta.nombre} · ${CAP_LABEL[stock.tamanioCap] ?? stock.tamanioCap}`,
        marca: stock.tinta.marca,
        cantidadActual: updatedStock.cantidadActual,
        cantidadMinima: updatedStock.cantidadMinima,
        unidad: 'ml',
        esBajo: updatedStock.cantidadActual < updatedStock.cantidadMinima,
        colorHex: stock.tinta.colorHex,
      };
      return res.json({ ok: true, data: item });
    }

    // tipo === 'aguja'
    const resultado = await ajusteRapidoAguja(parseInt(refId), negocioId, delta, usuarioId);
    const item = normalizarAguja(resultado.aguja);
    return res.json({ ok: true, data: item });
  } catch (error: any) {
    console.error('Error en ajuste rápido:', error);
    const status = error.status ?? 500;
    res.status(status).json({ ok: false, error: error.message ?? 'Error al ajustar stock' });
  }
};

const CATEGORIAS_VALIDAS = ['TINTA', 'AGUJA', 'CAP'] as const;

const CAP_TAMANIOS = ['CHICA', 'MEDIANA', 'GRANDE'] as const;

export const crearInsumo = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { nombre, categoria, marca, stockInicial, stockMinimo } = req.body;

  // Validaciones
  if (!nombre || !categoria || !marca || stockInicial === undefined || stockMinimo === undefined) {
    return res.status(400).json({ ok: false, error: 'nombre, categoria, marca, stockInicial y stockMinimo son requeridos' });
  }
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    return res.status(400).json({ ok: false, error: 'categoria debe ser TINTA, AGUJA o CAP' });
  }
  const inicial = parseInt(stockInicial);
  const minimo = parseInt(stockMinimo);
  if (isNaN(inicial) || inicial < 0 || isNaN(minimo) || minimo < 0) {
    return res.status(400).json({ ok: false, error: 'stockInicial y stockMinimo deben ser enteros no negativos' });
  }

  try {
    // Upload foto si se envió
    let fotoUrl: string | undefined;
    let fotoPublicId: string | undefined;
    if (req.file) {
      const upload = await uploadToCloudinary(req.file.buffer, 'inventario');
      fotoUrl = upload.url;
      fotoPublicId = upload.publicId;
    }

    if (categoria === 'TINTA') {
      const tinta = await prisma.tinta.create({
        data: {
          negocioId,
          nombre: nombre.trim(),
          marca: marca.trim(),
          color: 'Sin especificar',
          colorHex: '#000000',
          fotoUrl,
          fotoPublicId,
          stock: {
            create: [{
              tamanioCap: 'CHICA', // Usamos CHICA como valor por defecto para representar el stock global en ml
              cantidadActual: inicial,
              cantidadMinima: minimo,
            }],
          },
        },
        include: { stock: true },
      });

      const s = tinta.stock[0];
      const items: ItemInventario[] = [{
        tipo: 'tinta',
        refId: s.id,
        nombre: tinta.nombre, // Solo el nombre de la tinta, sin etiquetas de Cap
        marca: tinta.marca,
        cantidadActual: s.cantidadActual,
        cantidadMinima: s.cantidadMinima,
        unidad: 'ml',
        esBajo: s.cantidadActual < s.cantidadMinima,
        colorHex: tinta.colorHex,
        fotoUrl: tinta.fotoUrl ?? undefined,
      }];

      return res.status(201).json({ ok: true, data: items });
    }

    // AGUJA o CAP
    const aguja = await prisma.aguja.create({
      data: {
        negocioId,
        nombre: nombre.trim(),
        marca: marca.trim(),
        categoria,
        tipo: categoria === 'CAP' ? (req.body.capSize || 'CHICA') : 'AGUJA',
        calibre: categoria === 'CAP' ? (req.body.capMl || '1') : undefined,
        fotoUrl,
        fotoPublicId,
        cantidadActual: inicial,
        cantidadMinima: minimo,
      },
    });

    const item: ItemInventario = normalizarAguja(aguja);
    return res.status(201).json({ ok: true, data: [item] });
  } catch (error: any) {
    console.error('Error creando insumo:', error);
    res.status(500).json({ ok: false, error: 'Error al guardar el ítem' });
  }
};

export const editarInsumo = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { tipo, refId, nombre, marca, cantidadMinima } = req.body;

  if (!tipo || !refId || !nombre || !marca || cantidadMinima === undefined) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios' });
  }

  try {
    if (tipo === 'aguja') {
      const aguja = await prisma.aguja.findUnique({ where: { id: Number(refId) } });
      if (!aguja || aguja.negocioId !== negocioId) {
        return res.status(404).json({ ok: false, error: 'Aguja no encontrada' });
      }

      const updatedAguja = await prisma.aguja.update({
        where: { id: Number(refId) },
        data: {
          nombre: nombre,
          marca: marca,
          cantidadMinima: Number(cantidadMinima),
        },
      });

      res.json({ ok: true, data: normalizarAguja(updatedAguja) });

    } else if (tipo === 'tinta') {
      const stock = await prisma.stockTinta.findUnique({
        where: { id: Number(refId) },
        include: { tinta: true },
      });
      if (!stock || stock.tinta.negocioId !== negocioId) {
        return res.status(404).json({ ok: false, error: 'Tinta no encontrada' });
      }

      // If they send "Black Ink · Cap M", we extract "Black Ink"
      const baseNombre = nombre.split(' · ')[0].trim();

      const [updatedTinta, updatedStock] = await prisma.$transaction([
        prisma.tinta.update({
          where: { id: stock.tintaId },
          data: {
            nombre: baseNombre,
            marca: marca,
          },
        }),
        prisma.stockTinta.update({
          where: { id: Number(refId) },
          data: {
            cantidadMinima: Number(cantidadMinima),
          },
          include: { tinta: true }
        })
      ]);

      res.json({ ok: true, data: normalizarTinta(updatedStock) });

    } else {
      return res.status(400).json({ ok: false, error: 'Tipo de insumo inválido' });
    }

  } catch (error) {
    console.error('Error editando insumo:', error);
    res.status(500).json({ ok: false, error: 'Error al editar el insumo' });
  }
};

export const eliminarInsumo = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { tipo, refId } = req.params;

  if (!tipo || !refId) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros obligatorios' });
  }

  try {
    if (tipo === 'aguja') {
      const aguja = await prisma.aguja.findUnique({ where: { id: Number(refId) } });
      if (!aguja || aguja.negocioId !== negocioId) {
        return res.status(404).json({ ok: false, error: 'Aguja no encontrada' });
      }
      await prisma.aguja.update({
        where: { id: Number(refId) },
        data: { activa: false }
      });
    } else if (tipo === 'tinta') {
      const stock = await prisma.stockTinta.findUnique({
        where: { id: Number(refId) },
        include: { tinta: true },
      });
      if (!stock || stock.tinta.negocioId !== negocioId) {
        return res.status(404).json({ ok: false, error: 'Tinta no encontrada' });
      }
      
      // Soft-delete the entire Tinta since we cannot hard-delete StockTinta due to Historial constraints
      await prisma.tinta.update({
        where: { id: stock.tintaId },
        data: { activa: false }
      });
      
    } else {
      return res.status(400).json({ ok: false, error: 'Tipo de insumo inválido' });
    }

    res.json({ ok: true, data: { message: 'Insumo eliminado exitosamente' } });
  } catch (error) {
    console.error('Error eliminando insumo:', error);
    res.status(500).json({ ok: false, error: 'Error al eliminar el insumo' });
  }
};
