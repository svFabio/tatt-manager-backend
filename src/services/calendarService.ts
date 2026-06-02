import { prisma } from '../lib/prisma';

export interface BusinessHours {
    open: string;       // ej: "09:00"
    close: string;      // ej: "21:00"
    breakStart?: string; // ej: "12:00"
    breakEnd?: string;   // ej: "14:00"
    intervalMinutes: number; // ej: 60
}

/**
 * Convierte una hora en formato HH:mm a minutos totales desde las 00:00.
 */
const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
};

/**
 * Convierte minutos totales desde las 00:00 a formato HH:mm.
 */
const minutesToTime = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Obtiene los horarios dinámicos del negocio desde la BD.
 * Si no hay configuración, devuelve defaults razonables.
 */
export const getBusinessHours = async (negocioId: number): Promise<BusinessHours> => {
    try {
        const config = await prisma.configuracion.findUnique({ where: { negocioId } });
        if (config) {
            // Prioridad: campos dedicados horaApertura/horaCierre
            if (config.horaApertura && config.horaCierre) {
                return {
                    open: config.horaApertura,
                    close: config.horaCierre,
                    intervalMinutes: 60,
                };
            }
            // Fallback legacy: formato open/close dentro del JSON horarios
            const horarios = config.horarios as { open?: string; close?: string; breakStart?: string; breakEnd?: string; intervalMinutes?: number };
            if (horarios?.open && horarios?.close) {
                return {
                    open: horarios.open,
                    close: horarios.close,
                    breakStart: horarios.breakStart || undefined,
                    breakEnd: horarios.breakEnd || undefined,
                    intervalMinutes: horarios.intervalMinutes || 60,
                };
            }
        }
    } catch (e) {
        console.error(`[Calendar] Error leyendo horarios del negocio ${negocioId}:`, e);
    }

    // Defaults si no existe configuración
    return {
        open: "09:00",
        close: "21:00",
        breakStart: "12:00",
        breakEnd: "14:00",
        intervalMinutes: 60,
    };
};

export interface CitaExistente {
    horaInicio: string; // "14:00"
    horaFin: string;    // "16:00"
}

/**
 * Verifica si un rango de tiempo cruza o está dentro de un descanso.
 */
const crossesBreak = (startMins: number, endMins: number, breakStartMins: number, breakEndMins: number): boolean => {
    if (startMins >= breakEndMins) return false;
    if (endMins <= breakStartMins) return false;
    return true;
};

/**
 * Verifica si un rango de tiempo choca con una lista de citas existentes.
 */
const hasOverlap = (startMins: number, endMins: number, appointments: CitaExistente[]): boolean => {
    for (const appt of appointments) {
        const apptStart = timeToMinutes(appt.horaInicio);
        const apptEnd = timeToMinutes(appt.horaFin);
        if (startMins < apptEnd && endMins > apptStart) {
            return true;
        }
    }
    return false;
};

/**
 * Obtiene los slots de horarios disponibles para una fecha específica.
 * Si se pasa artistaId, solo revisa las citas de ESE artista.
 * Si no se pasa, revisa TODAS las citas del negocio (comportamiento legacy).
 */
export const getAvailableSlots = async (
    negocioId: number, 
    date: Date, 
    durationHours: number,
    artistaId?: number
): Promise<string[]> => {
    const config = await getBusinessHours(negocioId);
    
    const openMins = timeToMinutes(config.open);
    const closeMins = timeToMinutes(config.close);
    const durationMins = durationHours * 60;
    
    const breakStartMins = config.breakStart ? timeToMinutes(config.breakStart) : null;
    const breakEndMins = config.breakEnd ? timeToMinutes(config.breakEnd) : null;

    // Obtener citas existentes en ese día
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Filtrar por artista si se proporcionó, sino por todo el negocio
    const whereClause: {
        negocioId: number;
        estadoCita: { in: string[] };
        fechaHoraInicio: { gte: Date; lte: Date };
        artistaId?: number;
    } = {
        negocioId,
        estadoCita: { in: ['CONFIRMADA', 'PENDIENTE'] },
        fechaHoraInicio: { gte: startOfDay, lte: endOfDay }
    };

    if (artistaId) {
        whereClause.artistaId = artistaId;
    }

    const existingAppointmentsDB = await prisma.cita.findMany({
        where: whereClause,
        select: {
            fechaHoraInicio: true,
            fechaHoraFin: true,
        }
    });

    const existingAppointments: CitaExistente[] = existingAppointmentsDB.map(cita => {
        return {
            horaInicio: `${cita.fechaHoraInicio!.getHours().toString().padStart(2, '0')}:${cita.fechaHoraInicio!.getMinutes().toString().padStart(2, '0')}`,
            horaFin: `${cita.fechaHoraFin!.getHours().toString().padStart(2, '0')}:${cita.fechaHoraFin!.getMinutes().toString().padStart(2, '0')}`
        };
    });

    const validSlots: string[] = [];

    const now = new Date();
    const isToday = startOfDay.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const currentMinsNow = now.getHours() * 60 + now.getMinutes();

    for (let currentMins = openMins; currentMins < closeMins; currentMins += config.intervalMinutes) {
        const proposedStartMins = currentMins;
        const proposedEndMins = proposedStartMins + durationMins;

        // Regla: Si es hoy, no permitir horarios pasados
        if (isToday && proposedStartMins <= currentMinsNow) {
            continue;
        }

        // Regla A: Cierre del estudio
        if (proposedEndMins > closeMins) {
            continue;
        }

        // Regla B: Cruce con descanso
        if (breakStartMins !== null && breakEndMins !== null) {
            if (crossesBreak(proposedStartMins, proposedEndMins, breakStartMins, breakEndMins)) {
                continue;
            }
        }

        // Regla C: Superposición de citas del artista
        if (hasOverlap(proposedStartMins, proposedEndMins, existingAppointments)) {
            continue;
        }

        validSlots.push(minutesToTime(proposedStartMins));
    }

    return validSlots;
};

/**
 * Obtiene la lista de artistas (miembros con rol ARTISTA) del negocio.
 */
export const getArtistasDelNegocio = async (negocioId: number) => {
    const miembros = await prisma.miembroEstudio.findMany({
        where: { negocioId, rol: 'ARTISTA' },
        include: { usuario: { select: { id: true, nombre: true } } }
    });

    // También incluir ADMINs que pueden tatuar
    const admins = await prisma.miembroEstudio.findMany({
        where: { negocioId, rol: 'ADMIN' },
        include: { usuario: { select: { id: true, nombre: true } } }
    });

    const todos = [...miembros, ...admins];
    return todos.map(m => ({
        id: m.usuario.id,
        nombre: m.usuario.nombre
    }));
};
