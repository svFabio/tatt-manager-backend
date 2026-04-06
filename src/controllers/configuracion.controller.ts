import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ServicioItem = { nombre: string; precio: number };
type HorariosMap = Record<string, string[]>;

// Devuelve (o crea con defaults) la config del negocio autenticado
export const getConfiguracion = async (req: Request, res: Response) => {
    try {
        const negocioId = req.negocioId!;

        let config = await prisma.configuracion.findUnique({ where: { negocioId } });

        if (!config) {
            config = await prisma.configuracion.create({ data: { negocioId } });
        }

        res.json(config);
    } catch (error) {
        console.error('[Config] Error obteniendo configuracion:', error);
        res.status(500).json({ error: 'Error al obtener la configuracion' });
    }
};

// Actualiza uno o varios campos de la config
export const updateConfiguracion = async (req: Request, res: Response) => {
    try {
        const negocioId = req.negocioId!;
        const { trigger, mensajeBienvenida, mensajeConfirmacion, servicios, horarios, cobrarAdelanto, porcentajeAdelanto } = req.body;

        // Validaciones basicas
        if (trigger !== undefined && (typeof trigger !== 'string' || trigger.trim().length === 0)) {
            return res.status(400).json({ error: 'El trigger no puede estar vacio' });
        }
        if (servicios !== undefined) {
            if (!Array.isArray(servicios) || !servicios.every((s: ServicioItem) => typeof s.nombre === 'string' && typeof s.precio === 'number')) {
                return res.status(400).json({ error: 'servicios debe ser un array de { nombre, precio }' });
            }
        }
        if (porcentajeAdelanto !== undefined && (typeof porcentajeAdelanto !== 'number' || porcentajeAdelanto < 1 || porcentajeAdelanto > 100)) {
            return res.status(400).json({ error: 'porcentajeAdelanto debe ser un numero entre 1 y 100' });
        }

        const updateData: Partial<{ trigger: string; mensajeBienvenida: string; mensajeConfirmacion: string; servicios: ServicioItem[]; horarios: HorariosMap; cobrarAdelanto: boolean; porcentajeAdelanto: number }> = {};
        if (trigger !== undefined) updateData.trigger = trigger.trim();
        if (mensajeBienvenida !== undefined) updateData.mensajeBienvenida = mensajeBienvenida;
        if (mensajeConfirmacion !== undefined) updateData.mensajeConfirmacion = mensajeConfirmacion;
        if (servicios !== undefined) updateData.servicios = servicios as ServicioItem[];
        if (horarios !== undefined) updateData.horarios = horarios as HorariosMap;
        if (cobrarAdelanto !== undefined) updateData.cobrarAdelanto = Boolean(cobrarAdelanto);
        if (porcentajeAdelanto !== undefined) updateData.porcentajeAdelanto = Number(porcentajeAdelanto);

        const config = await prisma.configuracion.upsert({
            where: { negocioId },
            update: updateData,
            create: { negocioId, ...updateData },
        });

        res.json(config);
    } catch (error) {
        console.error('[Config] Error actualizando configuracion:', error);
        res.status(500).json({ error: 'Error al guardar la configuracion' });
    }
};
