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
          tamanioCap: cap.tamanioCap,
        },
      },
      include: { tinta: { select: { nombre: true, color: true } } },
    });
    if (!stock) {
      throw {
        status: 400,
        message: `No existe stock para tinta ID ${cap.tintaId} en tamaño ${cap.tamanioCap}`,
      };
    }
    if (stock.cantidadActual < cap.cantidadUsada) {
      throw {
        status: 400,
        message: `Stock insuficiente para "${stock.tinta.nombre}" (${stock.tinta.color}) tamaño ${cap.tamanioCap}: disponible ${stock.cantidadActual}, solicitado ${cap.cantidadUsada}`,
      };
    }
    await tx.stockTinta.update({
      where: { id: stock.id },
      data: {
        cantidadActual: { decrement: cap.cantidadUsada },
        actualizadoEn: new Date(),
      },
    });
    await tx.historialInventario.create({
      data: {
        tipoMovimiento: 'DESCUENTO_SESION',
        cantidad: -cap.cantidadUsada,
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
