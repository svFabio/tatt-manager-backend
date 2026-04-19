import { Request, Response } from 'express';
import { EstadoCita } from '@prisma/client';
import * as citasService from '../services/listarCitas.service';

// FUNCION PARA OBTENER LAS CITAS DE UN NEGOCIO
export const listarSolicitudes = async (req: Request, res: Response) => {
    // Obtenemos el negocioId del middleware de autenticación
    const negocioId = req.negocioId!; 

    try {
        // Llamamos al servicio que definiste
        const solicitudes = await citasService.getSolicitudes(negocioId);

        // Si la lista está vacía, igual devolvemos 200 con un array vacío
        return res.status(200).json({
            ok: true,
            count: solicitudes.length,
            data: solicitudes
        });

    } catch (error: any) {
        console.error('[Controlador getSolicitudes] ❌ Error:', error);
        
        return res.status(500).json({
            ok: false,
            message: error.message || "Error interno al recuperar las solicitudes."
        });
    }
};

// 1. Listar por estado (usando el servicio flexible que creaste)
export const listarCitasPorEstado = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    const { estado } = req.query; 

    try {
        // Casteamos el string de la query al Enum de Prisma
        const citas = await citasService.getCitasByEstado(
            negocioId, 
            estado as EstadoCita
        );
        return res.status(200).json({ ok: true, data: citas });
    } catch (error: any) {
        return res.status(500).json({ ok: false, message: error.message });
    }
};

// Obtener detalle validando pertenencia al negocio
export const obtenerDetalleCita = async (req: Request, res: Response) => {
    const { id } = req.params;
    const negocioId = req.negocioId!; // IMPORTANTE: Validar pertenencia

    try {
        const cita = await citasService.getCitaDetails(Number(id));

        // Seguridad: ¿La cita pertenece al negocio autenticado?
        if (cita.negocioId !== negocioId) {
            return res.status(403).json({ ok: false, message: "No tienes permiso para ver esta cita" });
        }

        return res.status(200).json({ ok: true, data: cita });
    } catch (error: any) {
        const status = error.message === "Cita no encontrada" ? 404 : 500;
        return res.status(status).json({ ok: false, message: error.message });
    }
};

