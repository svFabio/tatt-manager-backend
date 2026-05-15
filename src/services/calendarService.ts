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
 * Obtiene los horarios dinámicos del negocio.
 * En el futuro esto consultará a la BD usando `negocioId`.
 */
export const getBusinessHours = async (negocioId: number): Promise<BusinessHours> => {
    //TODO: Leer de prisma.configuracion.horarios
    return {
        open: "09:00",
        close: "21:00",
        breakStart: "12:00",
        breakEnd: "14:00",
        intervalMinutes: 60, // Intervalos de 1 hora
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
    // Si empieza después o igual al fin del descanso, está bien
    if (startMins >= breakEndMins) return false;
    // Si termina antes o igual al inicio del descanso, está bien
    if (endMins <= breakStartMins) return false;
    // En cualquier otro caso, hay superposición
    return true;
};

/**
 * Verifica si un rango de tiempo choca con una lista de citas existentes.
 */
const hasOverlap = (startMins: number, endMins: number, appointments: CitaExistente[]): boolean => {
    for (const appt of appointments) {
        const apptStart = timeToMinutes(appt.horaInicio);
        const apptEnd = timeToMinutes(appt.horaFin);
        
        // Si mi cita termina después de que empieza la otra, 
        // y mi cita empieza antes de que termine la otra, hay choque.
        if (startMins < apptEnd && endMins > apptStart) {
            return true;
        }
    }
    return false;
};

/**
 * Obtiene los slots de horarios disponibles para una fecha específica.
 */
export const getAvailableSlots = async (
    negocioId: number, 
    date: Date, 
    durationHours: number
): Promise<string[]> => {
    const config = await getBusinessHours(negocioId);
    
    // 1. Convertir todo a minutos para facilitar el cálculo
    const openMins = timeToMinutes(config.open);
    const closeMins = timeToMinutes(config.close);
    const durationMins = durationHours * 60;
    
    const breakStartMins = config.breakStart ? timeToMinutes(config.breakStart) : null;
    const breakEndMins = config.breakEnd ? timeToMinutes(config.breakEnd) : null;

    // 2. Obtener citas existentes en ese día para ese negocio
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointmentsDB = await prisma.cita.findMany({
        where: {
            negocioId,
            estadoCita: {
                in: ['CONFIRMADA', 'PENDIENTE']
            },
            fechaHoraInicio: {
                gte: startOfDay,
                lte: endOfDay
            }
        },
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

    // 3. Generar y filtrar intervalos
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
            continue; // Termina después del horario de cierre
        }

        // Regla B: Cruce con descanso
        if (breakStartMins !== null && breakEndMins !== null) {
            if (crossesBreak(proposedStartMins, proposedEndMins, breakStartMins, breakEndMins)) {
                continue; // Atraviesa el descanso
            }
        }

        // Regla C: Superposición de citas
        if (hasOverlap(proposedStartMins, proposedEndMins, existingAppointments)) {
            continue; // Choca con otra cita
        }

        // Si pasa todas las validaciones, el slot es válido
        validSlots.push(minutesToTime(proposedStartMins));
    }

    return validSlots;
};
