import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/uploadService';

type ServicioItem = { nombre: string; precio: number };
type HorariosMap = Record<string, string[]>;

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

export const updateConfiguracion = async (req: Request, res: Response) => {
    try {
        const negocioId = req.negocioId!;
        const { trigger, mensajeBienvenida, mensajeConfirmacion, servicios, horarios, cobrarAdelanto, porcentajeAdelanto, horaApertura, horaCierre } = req.body;

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

        const HORA_MIN = '07:00';
        const HORA_MAX = '22:00';
        const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (horaApertura !== undefined) {
            if (!horaRegex.test(horaApertura) || horaApertura < HORA_MIN || horaApertura > HORA_MAX) {
                return res.status(400).json({ error: `horaApertura debe estar entre ${HORA_MIN} y ${HORA_MAX}` });
            }
        }
        if (horaCierre !== undefined) {
            if (!horaRegex.test(horaCierre) || horaCierre < HORA_MIN || horaCierre > HORA_MAX) {
                return res.status(400).json({ error: `horaCierre debe estar entre ${HORA_MIN} y ${HORA_MAX}` });
            }
        }
        if (horaApertura !== undefined && horaCierre !== undefined && horaApertura >= horaCierre) {
            return res.status(400).json({ error: 'horaApertura debe ser menor que horaCierre' });
        }

        const updateData: Partial<{ trigger: string; mensajeBienvenida: string; mensajeConfirmacion: string; servicios: ServicioItem[]; horarios: HorariosMap; cobrarAdelanto: boolean; porcentajeAdelanto: number; horaApertura: string; horaCierre: string }> = {};
        if (trigger !== undefined) updateData.trigger = trigger.trim();
        if (mensajeBienvenida !== undefined) updateData.mensajeBienvenida = mensajeBienvenida;
        if (mensajeConfirmacion !== undefined) updateData.mensajeConfirmacion = mensajeConfirmacion;
        if (servicios !== undefined) updateData.servicios = servicios as ServicioItem[];
        if (horarios !== undefined) updateData.horarios = horarios as HorariosMap;
        if (cobrarAdelanto !== undefined) updateData.cobrarAdelanto = Boolean(cobrarAdelanto);
        if (porcentajeAdelanto !== undefined) updateData.porcentajeAdelanto = Number(porcentajeAdelanto);
        if (horaApertura !== undefined) updateData.horaApertura = horaApertura;
        if (horaCierre !== undefined) updateData.horaCierre = horaCierre;

        const config = await prisma.configuracion.upsert({
            where: { negocioId },
            update: updateData,
            create: { negocioId, ...updateData },
        });

        // Advertir si hay citas futuras fuera del nuevo horario
        let advertencia = null;
        if (horaApertura !== undefined || horaCierre !== undefined) {
            const apertura = config.horaApertura;
            const cierre   = config.horaCierre;

            const citasFuturas = await prisma.cita.findMany({
                where: {
                    negocioId,
                    estadoCita: { in: ['PENDIENTE', 'CONFIRMADA'] },
                    fechaHoraInicio: { gte: new Date() },
                },
                select: { id: true, fechaHoraInicio: true, fechaHoraFin: true, cliente: { select: { nombre: true } } }
            });

            const fuera = citasFuturas.filter(c => {
                if (!c.fechaHoraInicio || !c.fechaHoraFin) return false;
                const inicio = `${String(c.fechaHoraInicio.getHours()).padStart(2, '0')}:${String(c.fechaHoraInicio.getMinutes()).padStart(2, '0')}`;
                const fin    = `${String(c.fechaHoraFin.getHours()).padStart(2, '0')}:${String(c.fechaHoraFin.getMinutes()).padStart(2, '0')}`;
                return inicio < apertura || fin > cierre;
            });

            if (fuera.length > 0) {
                advertencia = {
                    mensaje: `Tienes ${fuera.length} cita(s) futura(s) fuera del nuevo horario (${apertura} - ${cierre}) que debes atender.`,
                    citas: fuera.map(c => ({
                        id: c.id,
                        cliente: c.cliente?.nombre ?? 'Sin nombre',
                        inicio: c.fechaHoraInicio,
                        fin: c.fechaHoraFin,
                    }))
                };
            }
        }

        res.json({ config, advertencia });
    } catch (error) {
        console.error('[Config] Error actualizando configuracion:', error);
        res.status(500).json({ error: 'Error al guardar la configuracion' });
    }
};

// Subir o reemplazar imagen del QR
export const actualizarQr = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Se requiere una imagen para el QR' });
        }

        // Eliminar imagen anterior de Cloudinary si existe
        const configActual = await prisma.configuracion.findUnique({ where: { negocioId } });
        if (configActual?.qrContenido_publicId) {
            await deleteFromCloudinary(configActual.qrContenido_publicId);
        }

        const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'qr_codigos');

        const config = await prisma.configuracion.upsert({
            where: { negocioId },
            update: { qrContenido: url, qrContenido_publicId: publicId },
            create: { negocioId, qrContenido: url, qrContenido_publicId: publicId },
        });

        res.json({ config });
    } catch (error) {
        console.error('[Config] Error actualizando QR:', error);
        res.status(500).json({ error: 'Error al actualizar el QR' });
    }
};

// Eliminar imagen del QR
export const eliminarQr = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const configActual = await prisma.configuracion.findUnique({ where: { negocioId } });
        if (!configActual?.qrContenido_publicId) {
            return res.status(404).json({ error: 'No hay QR registrado para eliminar' });
        }

        await deleteFromCloudinary(configActual.qrContenido_publicId);

        const config = await prisma.configuracion.update({
            where: { negocioId },
            data: { qrContenido: 'TU_CODIGO_QR_AQUI', qrContenido_publicId: null },
        });

        res.json({ config });
    } catch (error) {
        console.error('[Config] Error eliminando QR:', error);
        res.status(500).json({ error: 'Error al eliminar el QR' });
    }
};