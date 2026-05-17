import { EstadoCita } from '@prisma/client';
import { prisma } from '../lib/prisma';

// FUNCION PARA OBTENER SOLICITUDES CON ESTADO PENDIENTE, CONFIRMADA, CANCELADA O NO_ASISTIO
export const getSolicitudes = async (negocioId: number) => {
    try {
        const lista = await prisma.cita.findMany({
            where: {
                negocioId: negocioId,
                estadoCita: {
                    in: [
                        EstadoCita.PENDIENTE,
                        EstadoCita.CONFIRMADA,
                        EstadoCita.FINALIZADA,
                        EstadoCita.CANCELADA
                    ],
                },
            },
            orderBy: { creadoEn: 'desc' },
            include: {
                solicitud: true,
                negocio: true,
                cliente: true,
                artista: true,
            }

        });

        const solicitudesFormateadas = lista.map(cita => ({
            id: cita.id,
            fechaHoraInicio: cita.fechaHoraInicio,
            clienteNombre: cita.cliente?.nombre || 'Desconocido',
            artistaNombre: cita.artista?.nombre || 'Desconocido',
            recibido: cita.creadoEn,
            estado: cita.estadoCita,
        }));
        return solicitudesFormateadas;

    } catch (error) {
        console.error("Error al obtener solicitudes:", error);
        throw error;
    }
};

//FUNCION PARA OBTNER LAS CITAS DE UN ESTADO ESPECIFICO
export const getCitasByEstado = async (negocioId: number, estado?: EstadoCita) => {
    try {
        const citas = await prisma.cita.findMany({
            where: {
                negocioId: negocioId,
                estadoCita: estado ? estado : {
                    in: [
                        EstadoCita.PENDIENTE,
                        EstadoCita.CONFIRMADA,
                        EstadoCita.FINALIZADA,
                        EstadoCita.CANCELADA,
                    ],
                },
            },
            orderBy: { creadoEn: 'desc' },
            include: {
                negocio: true,
                solicitud: true,
                cliente: true,
                artista: true,
            }
        });
        const citasFormateadas = citas.map(cita => ({
            id: cita.id,
            fechaHoraInicio: cita.fechaHoraInicio,
            clienteNombre: cita.cliente?.nombre || 'Desconocido',
            artistaNombre: cita.artista?.nombre || 'Desconocido',
            recibido: cita.creadoEn,
            estado: cita.estadoCita,
        }));
        return citasFormateadas;

    } catch (error) {
        console.error("Error al obtener citas por estado:", error);
        throw error;
    }
};


//FUNCION PARA VER LOS DETALLES DE UNA CITA
export const getCitaDetails = async (citaId: number) => {
    try {
        const cita = await prisma.cita.findUnique({
            where: {
                id: citaId,
            },
            include: {
                negocio: true,
                solicitud: true,
                cliente: true,
                artista: true,
            },
        });

        if (!cita) {
            throw new Error("Cita no encontrada");
        }

        const citaFormateada = {
            id: cita.id,
            negocioId: cita.negocioId,
            fechaHoraInicio: cita.fechaHoraInicio || 'No especificada',
            recibido: cita.creadoEn || 'No especificada',
            referencia: cita.solicitud?.fotoReferenciaUrl || 'No especificada',
            zona: cita.zonaDelCuerpo || cita.solicitud?.zonaDelCuerpo || 'No especificada',
            tamano: (cita as any).tamanoEnCm || cita.solicitud?.tamanoEnCm || 'No especificado',
            clienteNombre: cita.cliente?.nombre || 'Desconocido',
            artistaNombre: cita.artista?.nombre || 'Desconocido',
            estado: cita.estadoCita,
        };

        return citaFormateada;

    } catch (error) {
        console.error("Error al obtener detalles de la cita:", error);
        throw new Error("No se pudieron recuperar los detalles de la cita");
    }
};
