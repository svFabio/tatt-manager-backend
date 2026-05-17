import { prisma } from '../lib/prisma';
import { enviarMensaje } from './whatsappClient';
import { getAvailableSlots, getBusinessHours } from './calendarService';

export class CitasService {
    static async getPendientes(negocioId: number) {
        return await prisma.cita.findMany({
            where: { negocioId, estadoCita: 'PENDIENTE' },
            orderBy: { creadoEn: 'desc' },
            include: { cliente: true, solicitud: true }
        });
    }

    static async validarCita(id: number, accion: string, negocioId: number) {
        const nuevoEstado = (accion === 'CONFIRMAR' || accion === 'APROBAR') ? 'CONFIRMADA' : 'CANCELADA';
        const citaActual = await prisma.cita.findUnique({ where: { id, negocioId }, include: { cliente: true } });
        if (!citaActual) throw new Error('Cita no encontrada');

        const citaActualizada = await prisma.cita.update({
            where: { id, negocioId },
            data: { estadoCita: nuevoEstado },
            include: { cliente: true }
        });

        try {
            let mensaje = '';
            if (nuevoEstado === 'CONFIRMADA' && citaActualizada.fechaHoraInicio) {
                const fechaFormateada = citaActualizada.fechaHoraInicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                const horas = citaActualizada.fechaHoraInicio.getHours().toString().padStart(2, '0');
                const mins = citaActualizada.fechaHoraInicio.getMinutes().toString().padStart(2, '0');
                const horario = `${horas}:${mins}`;

                mensaje = `¡Hola ${citaActualizada.cliente?.nombre || 'Cliente'}! 👋\n\n✅ *Tu pago ha sido verificado y tu cita está CONFIRMADA.* 🎉\n\n📋 *Detalles de tu cita:*\n📅 Fecha: ${fechaFormateada}\n⏰ Hora: ${horario}\n💆‍♀️ Servicio: ${citaActualizada.tipoCita || 'Tatuaje'}\n\n✨ ¡Te esperamos! Cualquier consulta, escríbenos.`;
            } else if (nuevoEstado === 'CANCELADA') {
                mensaje = `Hola ${citaActualizada.cliente?.nombre || 'Cliente'}. 😔\n\n❌ Tu cita ha sido cancelada.\n\nSi crees que es un error o deseas reagendar, por favor contáctanos.`;
            }

            const clienteTelefono = citaActualizada.cliente?.numeroWhatsapp;
            if (mensaje && clienteTelefono) {
                const ultimoMsgEntrante = await prisma.mensajeChat.findFirst({
                    where: {
                        negocioId,
                        remoteJid: { contains: clienteTelefono },
                        direccion: 'ENTRANTE'
                    },
                    orderBy: { timestamp: 'desc' },
                    select: { remoteJid: true }
                });
                const jid = ultimoMsgEntrante?.remoteJid || `${clienteTelefono}@s.whatsapp.net`;
                await enviarMensaje(negocioId, jid, mensaje);
            }
        } catch (msgError) {
            console.error('[Validar] ❌ Error enviando notificación:', msgError);
        }
        return citaActualizada;
    }

    static async getAgenda(negocioId: number, desde?: string, hasta?: string) {
        const fechaDesde = desde ? new Date(desde) : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const fechaHasta = hasta ? new Date(hasta) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (hasta) {
            fechaHasta.setUTCHours(23, 59, 59, 999);
        }
        return await prisma.cita.findMany({
            where: {
                negocioId,
                fechaHoraInicio: { gte: fechaDesde, lte: fechaHasta },
                estadoCita: { not: 'CANCELADA' }
            },
            orderBy: { fechaHoraInicio: 'asc' },
            include: { cliente: true, artista: true }
        });
    }

    static async getResumen(negocioId: number) {
        const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
        const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);

        const citasHoy = await prisma.cita.count({
            where: { negocioId, fechaHoraInicio: { gte: inicioHoy, lte: finHoy }, estadoCita: 'CONFIRMADA' }
        });
        const pendientes = await prisma.cita.count({
            where: { negocioId, estadoCita: 'PENDIENTE' }
        });
        const proximasCitas = await prisma.cita.findMany({
            where: { negocioId, fechaHoraInicio: { gte: inicioHoy, lte: finHoy }, estadoCita: { not: 'CANCELADA' } },
            orderBy: { fechaHoraInicio: 'asc' },
            take: 5,
            include: { cliente: true }
        });
        const totalFuturas = await prisma.cita.count({
            where: { negocioId, fechaHoraInicio: { gte: new Date() }, estadoCita: { not: 'CANCELADA' } }
        });
        return { citasHoy, pendientes, proximasCitas, totalFuturas };
    }

    static async getHorariosDisponibles(negocioId: number, fecha: string, duracionHoras: number = 1) {
        const [year, month, day] = fecha.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return getAvailableSlots(negocioId, date, duracionHoras);
    }

    static async crearCitaAdmin(negocioId: number, data: any) {
        const { clienteNombre, clienteTelefono, fecha, horario, duracionEnHoras: durInput, zonaDelCuerpo, tamanoEnCm, cotizacion } = data;

        const telefonoLimpio = clienteTelefono.replace(/[^0-9+]/g, '');
        if (telefonoLimpio.replace(/[^0-9]/g, '').length < 7) throw { status: 400, message: 'El teléfono debe tener al menos 7 dígitos numéricos.' };

        // Validate horario against real available slots
        const duracion = Number(durInput) || 1;
        const slotsDisponibles = await CitasService.getHorariosDisponibles(negocioId, fecha, duracion);
        if (!slotsDisponibles.includes(horario)) {
            throw { status: 400, message: `Horario no disponible. Horarios libres: ${slotsDisponibles.join(', ') || 'ninguno'}` };
        }

        const [year, month, day] = fecha.split('-').map(Number);
        const fechaCita = new Date(year, month - 1, day);
        const [horas, minutos] = horario.split(':').map(Number);
        fechaCita.setHours(horas, minutos, 0, 0);

        const fechaFin = new Date(fechaCita);
        fechaFin.setHours(fechaFin.getHours() + duracion);

        let cliente = await prisma.cliente.findUnique({
            where: { numeroWhatsapp: telefonoLimpio }
        });

        if (!cliente) {
            cliente = await prisma.cliente.create({
                data: { nombre: clienteNombre, numeroWhatsapp: telefonoLimpio, negocioId }
            });
        } else if (cliente.nombre !== clienteNombre.trim()) {
            // Admin typed a different name — update the client record
            cliente = await prisma.cliente.update({
                where: { id: cliente.id },
                data: { nombre: clienteNombre.trim() }
            });
        }

        // Check for overlapping appointments (range overlap, not just exact match)
        const citaSolapada = await prisma.cita.findFirst({
            where: {
                negocioId,
                estadoCita: { not: 'CANCELADA' },
                fechaHoraInicio: { lt: fechaFin },
                fechaHoraFin: { gt: fechaCita },
            }
        });
        if (citaSolapada) throw { status: 409, message: 'Este horario se solapa con otra cita existente.' };

        return await prisma.cita.create({
            data: {
                negocioId,
                clienteId: cliente.id,
                fechaHoraInicio: fechaCita,
                fechaHoraFin: fechaFin,
                duracionEnHoras: duracion,
                estadoCita: 'CONFIRMADA',
                zonaDelCuerpo: zonaDelCuerpo || null,
                tamanoEnCm: tamanoEnCm || null,
                seniaPagada: Number(cotizacion) || 0,
            },
            include: { cliente: true }
        });
    }

    static async reprogramarCita(id: number, negocioId: number, fecha: string, horario: string) {
        const citaActual = await prisma.cita.findUnique({ where: { id, negocioId }, include: { cliente: true } });
        if (!citaActual) throw { status: 404, message: 'Cita no encontrada' };

        const duracion = Number(citaActual.duracionEnHoras) || 1;

        // Validate against real available slots
        const slotsDisponibles = await CitasService.getHorariosDisponibles(negocioId, fecha, duracion);
        if (!slotsDisponibles.includes(horario)) {
            throw { status: 400, message: `Horario no disponible. Horarios libres: ${slotsDisponibles.join(', ') || 'ninguno'}` };
        }

        const [year, month, day] = fecha.split('-').map(Number);
        const nuevaFecha = new Date(year, month - 1, day);
        const [horas, minutos] = horario.split(':').map(Number);
        nuevaFecha.setHours(horas, minutos, 0, 0);
        const nuevaFechaFin = new Date(nuevaFecha.getTime() + duracion * 60 * 60 * 1000);

        return await prisma.cita.update({
            where: { id },
            data: { fechaHoraInicio: nuevaFecha, fechaHoraFin: nuevaFechaFin },
            include: { cliente: true }
        });
    }

    static async cambiarEstadoLegacy(id: number, negocioId: number, nuevoEstado: string, verificarPasado: boolean = false) {
        const cita = await prisma.cita.findUnique({ where: { id, negocioId } });
        if (!cita) throw { status: 404, message: 'Cita no encontrada' };

        if (verificarPasado) {
            const ahora = new Date();
            if (cita.fechaHoraInicio && cita.fechaHoraInicio > ahora) throw { status: 400, message: `Solo se pueden marcar citas pasadas.` };
        }

        return await prisma.cita.update({
            where: { id },
            data: { estadoCita: nuevoEstado as any }
        });
    }

    static async actualizarDescripcion(id: number, negocioId: number, descripcion: string) {
        return await prisma.cita.update({
            where: { id, negocioId },
            data: { descripcion: descripcion || null }
        });
    }

    static async crearCitaTatuaje(negocioId: number, input: any) {
        const { fechaHoraInicio, duracionEnHoras: duracionInput, tipoCita = 'tatuaje', artistaId, clienteId, solicitudId, estiloDeTatuaje, zonaDelCuerpo, seniaPagada = 0 } = input;

        const duracionEnHoras = tipoCita === 'consulta' ? 0.5 : parseFloat(duracionInput);
        if (!duracionEnHoras || duracionEnHoras <= 0) throw { status: 400, message: 'duracionEnHoras debe ser mayor a 0' };

        const inicio = new Date(fechaHoraInicio);
        const fin = new Date(inicio.getTime() + duracionEnHoras * 60 * 60 * 1000);

        const artista = await prisma.usuario.findFirst({ where: { id: artistaId, negocioId } });
        if (!artista) throw { status: 404, message: 'Artista no encontrado en este negocio' };

        const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, negocioId } });
        if (!cliente) throw { status: 404, message: 'Cliente no encontrado en este negocio' };

        const citaSolapada = await prisma.cita.findFirst({
            where: {
                negocioId, artistaId, estadoCita: { in: ['PENDIENTE', 'CONFIRMADA'] },
                fechaHoraInicio: { lt: fin }, fechaHoraFin: { gt: inicio },
            },
        });
        if (citaSolapada) throw { status: 409, message: `El artista tiene una cita que se solapa (Cita #${citaSolapada.id})` };

        return await prisma.cita.create({
            data: {
                negocioId, fechaHoraInicio: inicio, fechaHoraFin: fin, duracionEnHoras, tipoCita, estadoCita: 'PENDIENTE',
                estiloDeTatuaje: estiloDeTatuaje || null, zonaDelCuerpo: zonaDelCuerpo || null, seniaPagada: seniaPagada || 0,
                clienteId, artistaId, solicitudId: solicitudId || null
            },
            include: {
                cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
                artista: { select: { id: true, nombre: true } },
            },
        });
    }

    static async getDisponibilidad(negocioId: number, artistaId: number, fecha: string, duracion: number) {
        const [year, month, day] = fecha.split('-').map(Number);
        const inicioDia = new Date(year, month - 1, day, 9, 0, 0);
        const finDia = new Date(year, month - 1, day, 20, 0, 0);

        const citasDelDia = await prisma.cita.findMany({
            where: { negocioId, artistaId, estadoCita: { in: ['PENDIENTE', 'CONFIRMADA'] }, fechaHoraInicio: { gte: inicioDia, lt: finDia } },
            orderBy: { fechaHoraInicio: 'asc' },
            select: { fechaHoraInicio: true, fechaHoraFin: true },
        });

        const duracionMs = duracion * 60 * 60 * 1000;
        const slots: { inicio: string; fin: string }[] = [];
        const bloques = citasDelDia
            .filter(c => c.fechaHoraInicio && c.fechaHoraFin)
            .map(c => ({ inicio: new Date(c.fechaHoraInicio!).getTime(), fin: new Date(c.fechaHoraFin!).getTime() }))
            .sort((a, b) => a.inicio - b.inicio);

        let cursor = inicioDia.getTime();
        for (const bloque of bloques) {
            if (bloque.inicio > cursor) {
                let slotInicio = cursor;
                while (slotInicio + duracionMs <= bloque.inicio) {
                    slots.push({ inicio: new Date(slotInicio).toISOString(), fin: new Date(slotInicio + duracionMs).toISOString() });
                    slotInicio += 30 * 60 * 1000;
                }
            }
            cursor = Math.max(cursor, bloque.fin);
        }
        if (cursor < finDia.getTime()) {
            let slotInicio = cursor;
            while (slotInicio + duracionMs <= finDia.getTime()) {
                slots.push({ inicio: new Date(slotInicio).toISOString(), fin: new Date(slotInicio + duracionMs).toISOString() });
                slotInicio += 30 * 60 * 1000;
            }
        }
        return slots;
    }

    static async cambiarEstadoNuevo(id: number, negocioId: number, estadoFaltante: string) {
        const cita = await prisma.cita.findFirst({ where: { id, negocioId } });
        if (!cita) throw { status: 404, message: 'Cita no encontrada' };

        if (estadoFaltante === 'CONFIRMADA' && (cita.estadoCita === 'FINALIZADA' || cita.estadoCita === 'CANCELADA')) {
            throw { status: 400, message: `No se puede confirmar una cita en estado ${cita.estadoCita}` };
        }
        if (estadoFaltante === 'CANCELADA' && cita.estadoCita === 'FINALIZADA') {
            throw { status: 400, message: 'No se puede cancelar una cita ya finalizada' };
        }

        return await prisma.cita.update({
            where: { id },
            data: { estadoCita: estadoFaltante as any },
        });
    }

}


