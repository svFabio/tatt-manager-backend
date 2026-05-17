import { TamanioCap, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
type CapsUsadaInput = {
  tintaId: number;
  tamanioCap: TamanioCap;
  cantidadUsada: number;
};

type AgujasUsadaInput = {
  agujaId: number;
  cantidadUsada: number;
};
export async function descontarCaps(
  tx: Prisma.TransactionClient,
  capsUsadas: CapsUsadaInput[],
  registroSesionId: number,
  registradoPorId: number
): Promise<void> {
  for (const cap of capsUsadas) {
    const stock = await tx.stockTinta.findUnique({
      where: {
        tintaId_tamanioCap: {
          tintaId: cap.tintaId,
          tamanioCap: 'CHICA', // Siempre usamos CHICA porque ahora representa el stock global en ml
        },
      },
      include: { tinta: { select: { nombre: true, color: true, negocioId: true } } },
    });
    if (!stock) {
      throw {
        status: 400,
        message: `No existe stock registrado para la tinta ID ${cap.tintaId}`,
      };
    }
    
    // Obtener la capacidad en ml del tipo de Cap seleccionado en el inventario del negocio
    const capInventario = await tx.aguja.findFirst({
      where: {
        negocioId: stock.tinta.negocioId,
        categoria: 'CAP',
        tipo: cap.tamanioCap,
        activa: true,
      }
    });

    // Si el usuario registró un Cap de ese tamaño, usamos su calibre en ml. Si no, usamos un fallback por defecto.
    let mlPorCap = cap.tamanioCap === 'GRANDE' ? 3 : cap.tamanioCap === 'MEDIANA' ? 2 : 1;
    if (capInventario && capInventario.calibre) {
      const parsedMl = parseFloat(capInventario.calibre);
      if (!isNaN(parsedMl) && parsedMl > 0) {
        mlPorCap = parsedMl;
      }
    }

    const mlUsados = cap.cantidadUsada * mlPorCap;

    if (stock.cantidadActual < mlUsados) {
      throw {
        status: 400,
        message: `Stock insuficiente para "${stock.tinta.nombre}" (${stock.tinta.color}): disponible ${stock.cantidadActual} ml, necesario ${mlUsados} ml (por ${cap.cantidadUsada} cap(s) ${cap.tamanioCap})`,
      };
    }
    await tx.stockTinta.update({
      where: { id: stock.id },
      data: {
        cantidadActual: { decrement: mlUsados },
        actualizadoEn: new Date(),
      },
    });
    await tx.historialInventario.create({
      data: {
        tipoMovimiento: 'DESCUENTO_SESION',
        cantidad: -mlUsados,
        stockTintaId: stock.id,
        registradoPorId,
        registroSesionId,
      },
    });
  }
}

/**
 * Registra una entrada manual de stock para una tinta específica
 */
export async function entradaStock(
  tintaId: number,
  tamanioCap: TamanioCap,
  cantidad: number,
  registradoPorId: number,
  motivo?: string
) {
  const stock = await prisma.stockTinta.findUnique({
    where: { tintaId_tamanioCap: { tintaId, tamanioCap } },
  });
  if (!stock) {
    throw { status: 404, message: `No existe stock para tinta ID ${tintaId} tamaño ${tamanioCap}` };
  }
  const [updatedStock, historial] = await prisma.$transaction([
    prisma.stockTinta.update({
      where: { id: stock.id },
      data: {
        cantidadActual: { increment: cantidad },
        actualizadoEn: new Date(),
      },
    }),
    prisma.historialInventario.create({
      data: {
        tipoMovimiento: 'ENTRADA',
        cantidad,
        motivo,
        stockTintaId: stock.id,
        registradoPorId,
      },
    }),
  ]);
  return { stock: updatedStock, historial };
}

/**
 * Realiza un ajuste de stock (puede ser positivo o negativo) para correcciones de inventario
 */
export async function ajusteStock(
  tintaId: number,
  tamanioCap: TamanioCap,
  cantidad: number,
  registradoPorId: number,
  motivo: string
) {
  const stock = await prisma.stockTinta.findUnique({
    where: { tintaId_tamanioCap: { tintaId, tamanioCap } },
  });
  if (!stock) {
    throw { status: 404, message: `No existe stock para tinta ID ${tintaId} tamaño ${tamanioCap}` };
  }
  const nuevaCantidad = stock.cantidadActual + cantidad;
  if (nuevaCantidad < 0) {
    throw {
      status: 400,
      message: `El ajuste dejaría el stock en negativo (actual: ${stock.cantidadActual}, ajuste: ${cantidad})`,
    };
  }
  const [updatedStock, historial] = await prisma.$transaction([
    prisma.stockTinta.update({
      where: { id: stock.id },
      data: {
        cantidadActual: nuevaCantidad,
        actualizadoEn: new Date(),
      },
    }),
    prisma.historialInventario.create({
      data: {
        tipoMovimiento: 'AJUSTE_MANUAL',
        cantidad,
        motivo,
        stockTintaId: stock.id,
        registradoPorId,
      },
    }),
  ]);
  return { stock: updatedStock, historial };
}

/**
 * Ajuste rápido de stock para una aguja (positivo o negativo, sin motivo del usuario)
 */
export async function ajusteRapidoAguja(
  agujaId: number,
  negocioId: number,
  delta: number,
  registradoPorId: number
) {
  const aguja = await prisma.aguja.findFirst({ where: { id: agujaId, negocioId } });
  if (!aguja) throw { status: 404, message: `Aguja con ID ${agujaId} no encontrada` };

  const nuevaCantidad = aguja.cantidadActual + delta;
  if (nuevaCantidad < 0) {
    throw {
      status: 400,
      message: `El ajuste dejaría el stock en negativo (actual: ${aguja.cantidadActual}, ajuste: ${delta})`,
    };
  }

  const [agujaActualizada, historial] = await prisma.$transaction([
    prisma.aguja.update({
      where: { id: agujaId },
      data: { cantidadActual: nuevaCantidad, actualizadoEn: new Date() },
    }),
    prisma.historialInventario.create({
      data: {
        tipoMovimiento: 'AJUSTE_MANUAL',
        cantidad: delta,
        motivo: 'Ajuste rápido desde inventario',
        agujaId,
        registradoPorId,
      },
    }),
  ]);

  return { aguja: agujaActualizada, historial };
}

/**
 * Descuenta el stock de agujas utilizadas en una sesión
 */
export async function descontarAgujas(
  tx: Prisma.TransactionClient,
  agujasUsadas: AgujasUsadaInput[],
  registroSesionId: number,
  registradoPorId: number
): Promise<void> {
  for (const agujaUsada of agujasUsadas) {
    const aguja = await tx.aguja.findUnique({
      where: { id: agujaUsada.agujaId },
    });
    if (!aguja) {
      throw {
        status: 400,
        message: `No existe aguja con ID ${agujaUsada.agujaId}`,
      };
    }
    if (aguja.cantidadActual < agujaUsada.cantidadUsada) {
      throw {
        status: 400,
        message: `Stock insuficiente para aguja "${aguja.nombre}" (${aguja.marca}): disponible ${aguja.cantidadActual}, solicitado ${agujaUsada.cantidadUsada}`,
      };
    }
    await tx.aguja.update({
      where: { id: aguja.id },
      data: {
        cantidadActual: { decrement: agujaUsada.cantidadUsada },
        actualizadoEn: new Date(),
      },
    });
    await tx.historialInventario.create({
      data: {
        tipoMovimiento: 'DESCUENTO_SESION',
        cantidad: -agujaUsada.cantidadUsada,
        agujaId: aguja.id,
        registradoPorId,
        registroSesionId,
      },
    });
  }
}
