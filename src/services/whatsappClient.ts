import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import { usePrismaAuthState, clearAuthState } from './baileysAuth';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { v2 as cloudinary } from 'cloudinary';
import { ContextoConversacion, EstadoConversacion } from './aiService';
import { MAX_BOTS_ACTIVOS } from '../config';
import { getAvailableSlots } from './calendarService';
import { parsearFechaNatural, formatearFechaAmigable } from './dateParser';

import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim()
});

async function getConfigNegocio(negocioId: number) {
    let config = await prisma.configuracion.findUnique({ where: { negocioId } });
    if (!config) {
        config = await prisma.configuracion.create({ data: { negocioId } });
    }
    return {
        trigger: config.trigger,
        mensajeBienvenida: config.mensajeBienvenida,
        mensajeConfirmacion: config.mensajeConfirmacion,
    };
}

const normalizarTexto = (texto: string) =>
    texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

const esMensajeActivador = (mensaje: string, triggerConfig: string): boolean => {
    const texto = normalizarTexto(mensaje);
    if (!texto) return false;

    // Permite configurar varios triggers separados por coma.
    const triggersConfigurados = triggerConfig
        .split(',')
        .map(t => normalizarTexto(t))
        .filter(Boolean);

    const activadoresPorDefecto = [
        '/start',
        'quiero hacerme un tattoo',
        'quiero hacerme un tatuaje',
        'quiero un tattoo',
        'quiero un tatuaje',
    ];

    const activadores = [...new Set([...triggersConfigurados, ...activadoresPorDefecto])];
    return activadores.some(trigger => texto.startsWith(trigger));
};

const extraerTamanioTattoo = (mensaje: string): string | null => {
    // Acepta formatos como: 10x10, 10 x 10, 10x10 cm, 7.5 x 12 cm
    const limpio = mensaje.toLowerCase().replace(',', '.');
    const match = limpio.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*cm)?/i);
    if (!match) return null;
    const ancho = Number(match[1]);
    const alto = Number(match[2]);
    if (Number.isNaN(ancho) || Number.isNaN(alto) || ancho <= 0 || alto <= 0) return null;
    return `${ancho} x ${alto} cm`;
};

interface BotInstance {
    sock: ReturnType<typeof makeWASocket>;
    conectado: boolean;
    qr: string | null;
    intentos: number;
    io: Server;
    lidToPhone: Map<string, string>;
}

const bots = new Map<number, BotInstance>();

export const resolverTelefonoReal = (jid: string, negocioId?: number): string => {
    const numero = jid.split('@')[0];
    const suffix = jid.split('@')[1];
    if (suffix === 'lid' && negocioId) {
        const bot = bots.get(negocioId);
        const real = bot?.lidToPhone.get(numero);
        if (real) return real;
    }
    return numero;
};

const normalizarTelefono = (valor: string): string => valor.replace(/\D/g, '');

const esTelefonoValido = (valor: string): boolean => /^\d{7,}$/.test(valor);

const obtenerTelefonoCliente = (msg: any, remoteJid: string, negocioId: number): string | null => {
    const candidatos = [
        resolverTelefonoReal(remoteJid, negocioId),
        remoteJid.split('@')[0],
        msg?.key?.participant,
        msg?.key?.participantPn,
        msg?.participant,
    ];

    for (const candidato of candidatos) {
        if (!candidato || typeof candidato !== 'string') continue;
        const numero = normalizarTelefono(candidato.split('@')[0]);
        if (esTelefonoValido(numero)) return numero;
    }

    return null;
};

export const iniciarWhatsAppNegocio = async (negocioId: number, io: Server): Promise<{ error?: string }> => {
    if (bots.has(negocioId)) {
        const bot = bots.get(negocioId)!;
        io.emit(`whatsapp-status-${negocioId}`, { conectado: bot.conectado, qr: bot.qr });
        return {};
    }
    if (bots.size >= MAX_BOTS_ACTIVOS) {
        console.warn(`[Bot] ⚠️ Límite de bots activos alcanzado (${MAX_BOTS_ACTIVOS}). Negocio ${negocioId} no puede iniciar.`);
        return { error: `Límite de bots activos alcanzado (máximo ${MAX_BOTS_ACTIVOS}). Contacta al soporte para ampliar el límite.` };
    }

    const sessionId = `negocio-${negocioId}`;
    const { state, saveCreds } = await usePrismaAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[Bot:${negocioId}] Iniciando con Baileys v${version.join('.')}...`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: [`Negocio-${negocioId} Bot`, 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    const instance: BotInstance = {
        sock,
        conectado: false,
        qr: null,
        intentos: 0,
        io,
        lidToPhone: new Map()
    };
    bots.set(negocioId, instance);

    // --- Connection Events ---
    sock.ev.on('connection.update', async (update) => {
        const bot = bots.get(negocioId);
        if (!bot) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[Bot:${negocioId}] Nuevo QR generado`);
            bot.qr = qr;
            bot.conectado = false;
            io.emit(`whatsapp-status-${negocioId}`, { conectado: false, qr });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.error(`[Bot:${negocioId}] Conexión cerrada. Razón: ${reason}`);
            bot.conectado = false;
            bot.qr = null;
            io.emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null });

            if (shouldReconnect) {
                if (bot.intentos < 5) {
                    bot.intentos++;
                    console.log(`[Bot:${negocioId}] Reintentando (${bot.intentos}/5)...`);
                    bots.delete(negocioId);
                    setTimeout(() => iniciarWhatsAppNegocio(negocioId, io), 3000);
                } else {
                    console.error(`[Bot:${negocioId}] Demasiados intentos fallidos.`);
                    bots.delete(negocioId);
                }
            } else {
                console.log(`[Bot:${negocioId}] Logout permanente. Limpiando sesión...`);
                bots.delete(negocioId);
                await clearAuthState(sessionId);
                console.log(`[Bot:${negocioId}] Reiniciando para nuevo QR...`);
                iniciarWhatsAppNegocio(negocioId, io);
            }
        } else if (connection === 'open') {
            console.log(`[Bot:${negocioId}] ✅ Conectado a WhatsApp!`);
            bot.conectado = true;
            bot.qr = null;
            bot.intentos = 0;
            io.emit(`whatsapp-status-${negocioId}`, { conectado: true, qr: null });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('lid-mapping.update', ({ lid, pn }: { lid: string; pn: string }) => {
        const bot = bots.get(negocioId);
        if (!bot) return;
        const lidNum = lid.split('@')[0];
        const pnNum = pn.split('@')[0];
        bot.lidToPhone.set(lidNum, pnNum);
    });

    // --- Message Handler (Tattoo Solicitation Flow) ---
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;
            const remoteJid = msg.key.remoteJid!;
            if (remoteJid.endsWith('@g.us')) continue;

            const textMessage = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption || '';
            const hasImage = !!msg.message.imageMessage;

            console.log(`[Bot:${negocioId}] 📨 Mensaje de ${remoteJid}: ${textMessage || '[IMAGEN]'}`);

            // Save incoming message
            try {
                const msgGuardado = await prisma.mensajeChat.create({
                    data: { negocioId, remoteJid, contenido: textMessage || '[IMAGEN]', direccion: 'ENTRANTE' }
                });
                io.emit('nuevo-mensaje', msgGuardado);
            } catch (dbErr) {
                console.error(`[Bot:${negocioId}] Error guardando msg entrante:`, dbErr);
            }

            // Check trigger
            const cfg = await getConfigNegocio(negocioId);
            const isActivatingSession = esMensajeActivador(textMessage, cfg.trigger);

            let sesion = await prisma.sesionChat.findFirst({
                where: { id: remoteJid, negocioId }
            });

            if (!sesion && !isActivatingSession) continue;

            // Si el usuario manda el activador durante una sesión, reiniciamos el flujo.
            if (sesion && isActivatingSession) {
                await prisma.sesionChat.updateMany({
                    where: { id: remoteJid, negocioId },
                    data: { estado: 'INICIO', datos: {}, ultimoMensaje: new Date() }
                });
                sesion = await prisma.sesionChat.findFirst({
                    where: { id: remoteJid, negocioId }
                });
            }

            if (!sesion && isActivatingSession) {
                try {
                    sesion = await prisma.sesionChat.create({
                        data: { id: remoteJid, negocioId, estado: 'INICIO', datos: {}, ultimoMensaje: new Date() }
                    });
                } catch (err) {
                    console.error(`[Bot:${negocioId}] Error creando sesión:`, err);
                    continue;
                }
            }

            if (!sesion) continue;

            const contexto: ContextoConversacion = {
                estado: sesion.estado as EstadoConversacion,
                datos: sesion.datos as unknown as ContextoConversacion['datos'],
                intentosAclaracion: 0
            };

            const botInstance = bots.get(negocioId);
            if (!botInstance) continue;

            try {
                await botInstance.sock.sendPresenceUpdate('composing', remoteJid);
                const cmd = textMessage.trim().toLowerCase();

                // Cancel commands
                if (['cancelar', 'salir', 'adios', 'reiniciar', 'chau'].includes(cmd)) {
                    await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                    await botInstance.sock.sendMessage(remoteJid, { text: '👋 Entendido, cancelamos el proceso. ¡Hasta pronto!' });
                    continue;
                }

                let respuesta = '';
                const datos = sesion.datos as any;

                switch (contexto.estado) {
                    case 'INICIO': {
                        respuesta = '🎨 ¡Hola! Bienvenido/a al estudio de tatuajes.\n\nPara continuar, te pediremos unos datos.\n\n¿Cuál es tu *nombre completo*?';
                        await prisma.sesionChat.updateMany({
                            where: { id: remoteJid, negocioId },
                            data: { estado: 'ESPERANDO_NOMBRE' }
                        });
                        break;
                    }

                    case 'ESPERANDO_NOMBRE': {
                        if (textMessage.trim().length < 3) {
                            respuesta = 'Por favor, ingresa tu nombre completo (mínimo 3 caracteres).';
                        } else {
                            const nombre = textMessage.trim();
                            respuesta = `Perfecto, *${nombre}*! 🖊️\n\n¿Qué tatuaje te gustaría hacerte? Descríbelo brevemente.\n\nEj: "Una rosa en estilo realista", "Letras con el nombre de mi mamá", etc.`;
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_DESCRIPCION', datos: { ...datos, nombre } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_DESCRIPCION': {
                        if (textMessage.trim().length < 3) {
                            respuesta = 'Por favor, describe un poco más el tatuaje que deseas.';
                        } else {
                            const descripcion = textMessage.trim();
                            respuesta = `Genial! 📏\n\n¿De qué *tamaño* lo quieres?\n\n- *Chico* (5-10 cm)\n- *Mediano* (10-20 cm)\n- *Grande* (más de 20 cm)\n\nTambién puedes decirnos las medidas exactas, ej: "15 cm"`;
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_TAMANIO', datos: { ...datos, descripcionTattoo: descripcion } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_TAMANIO': {
                        const tamanioNormalizado = extraerTamanioTattoo(textMessage);
                        if (!tamanioNormalizado) {
                            respuesta = 'Para el tamaño necesito *dos medidas*.\n\nEnvíalo así:\n- *10 x 10 cm*\n- *5x5 cm*\n- *7.5 x 12 cm*';
                        } else {
                            respuesta = `Perfecto! 💪\n\n¿En qué *zona del cuerpo* te lo quieres hacer?\n\nEj: "brazo derecho", "espalda", "tobillo", "antebrazo", etc.`;
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_ZONA', datos: { ...datos, tamanio: tamanioNormalizado } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_ZONA': {
                        const zona = textMessage.trim();
                        if (zona.length < 2) {
                            respuesta = 'Por favor, indica la zona del cuerpo. Ej: brazo, espalda, pierna, etc.';
                        } else {
                            respuesta = `Excelente! 📸\n\n¿Tienes alguna *foto de referencia* del tatuaje que quieres?\n\n- Si la tienes, *envíala ahora*\n- Si no, escribe *"no"*`;
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_FOTO', datos: { ...datos, zona } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_FOTO': {
                        let fotoUrl: string | null = null;
                        const noTieneFoto = ['no', 'no tengo', 'nop', 'nope', 'sin foto', 'ninguna'].includes(cmd);

                        if (hasImage) {
                            try {
                                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                                const uploadResult = await new Promise<import('cloudinary').UploadApiResponse>((resolve, reject) => {
                                    cloudinary.uploader.upload_stream({ folder: 'referencias_tattoo' }, (error, result) => {
                                        if (error) reject(error); else resolve(result!);
                                    }).end(buffer);
                                });
                                fotoUrl = uploadResult.secure_url;
                            } catch (uploadError) {
                                console.error(`[Bot:${negocioId}] Error subiendo foto:`, uploadError);
                                respuesta = '❌ Hubo un error al subir la foto. Intenta enviarla de nuevo o escribe *"no"* para continuar sin foto.';
                                break;
                            }
                        } else if (!noTieneFoto) {
                            respuesta = '📸 Por favor envía una *imagen* de referencia o escribe *"no"* si no tienes una.';
                            break;
                        }

                        // --- Create Cliente + Solicitud ---
                        const telefonoCliente = obtenerTelefonoCliente(msg, remoteJid, negocioId);
                        const datosFinales = sesion.datos as any;

                        if (!telefonoCliente) {
                            respuesta = '⚠️ No pude obtener tu número de WhatsApp correctamente. Escribe */start* para reiniciar o intenta de nuevo en unos segundos.';
                            await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            break;
                        }

                        try {
                            const cliente = await prisma.cliente.upsert({
                                where: { numeroWhatsapp: telefonoCliente },
                                update: { nombre: datosFinales.nombre || 'Cliente' },
                                create: { negocioId, nombre: datosFinales.nombre || 'Cliente', numeroWhatsapp: telefonoCliente }
                            });

                            const solicitud = await prisma.solicitud.create({
                                data: {
                                    negocioId,
                                    clienteId: cliente.id,
                                    tipo: 'tatuaje',
                                    descripcion: datosFinales.descripcionTattoo || 'Sin descripción',
                                    tamanoEnCm: datosFinales.tamanio || null,
                                    zonaDelCuerpo: datosFinales.zona || null,
                                    fotoReferenciaUrl: fotoUrl,
                                }
                            });

                            io.emit('nueva-solicitud', {
                                id: solicitud.id,
                                clienteNombre: cliente.nombre,
                                clienteTelefono: telefonoCliente,
                                tipo: 'tatuaje',
                                descripcion: solicitud.descripcion,
                            });

                            respuesta = `✅ *¡Solicitud registrada con éxito!*\n\n📋 *Resumen:*\n👤 Nombre: ${datosFinales.nombre}\n📱 Teléfono: ${telefonoCliente}\n🎨 Tattoo: ${datosFinales.descripcionTattoo}\n📏 Tamaño: ${datosFinales.tamanio}\n💪 Zona: ${datosFinales.zona}\n📸 Foto: ${fotoUrl ? 'Sí' : 'No'}\n\nNuestro equipo revisará tu solicitud y te contactará pronto. ¡Gracias! 🙏`;

                            await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                        } catch (dbError) {
                            console.error(`[Bot:${negocioId}] Error creando solicitud:`, dbError);
                            respuesta = '❌ Hubo un error al registrar tu solicitud. Intenta nuevamente escribiendo el comando de inicio.';
                            await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                        }
                        break;
                    }

                    case 'ESPERANDO_FECHA': {
                        const parsedDate = parsearFechaNatural(textMessage);
                        if (!parsedDate || parsedDate.confianza === 'baja') {
                            respuesta = '🤔 No logré entender bien la fecha. ¿Podrías ser más específico? (Ej. "mañana", "el 15 de mayo", "este viernes").';
                        } else {
                            const fechaConsultada = parsedDate.fecha;
                            const hoy = new Date();
                            hoy.setHours(0, 0, 0, 0);

                            if (fechaConsultada < hoy) {
                                respuesta = 'No podemos viajar en el tiempo 🕰️😅. Por favor elige una fecha que sea a partir de hoy.';
                            } else {
                                const horasTatuaje = Number(datos.horasEstimadas) || 1;
                                const disponibles = await getAvailableSlots(negocioId, fechaConsultada, horasTatuaje);
                                
                                if (disponibles.length === 0) {
                                respuesta = `Lo siento, para el *${formatearFechaAmigable(fechaConsultada)}* no me quedan horarios que puedan acomodar las ${horasTatuaje} horas que tomará tu tatuaje. 😢\n\n¿Te gustaría intentar con otra fecha?`;
                            } else {
                                const listaHorarios = disponibles.map(h => `- *${h}*`).join('\n');
                                respuesta = `¡Genial! Para el *${formatearFechaAmigable(fechaConsultada)}* tengo los siguientes horarios disponibles:\n\n${listaHorarios}\n\nEscribe la hora que prefieres para confirmar tu cita.`;
                                
                                await prisma.sesionChat.updateMany({
                                    where: { id: remoteJid, negocioId },
                                    data: { 
                                        estado: 'ESPERANDO_HORA', 
                                        datos: { ...datos, fechaSeleccionada: fechaConsultada }
                                    }
                                });
                            }
                        }
                    }
                    break;
                    }

                    case 'ESPERANDO_HORA': {
                        const horaElegida = textMessage.trim();
                        // Validar formato de hora usando una regex simple HH:mm
                        const horaRegex = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
                        const match = horaElegida.match(horaRegex);
                        
                        if (!match) {
                            respuesta = 'Por favor, escribe la hora en formato válido. Ej: "14:00", "16:30".';
                            break;
                        }

                        let horaFormateada = `${match[1].padStart(2, '0')}:${match[2]}`;
                        
                        // Doble chequeo de disponibilidad (Race condition prevention)
                        const fechaSeleccionada = new Date(datos.fechaSeleccionada);
                        const horasTatuaje = Number(datos.horasEstimadas) || 1;
                        const disponiblesAhora = await getAvailableSlots(negocioId, fechaSeleccionada, horasTatuaje);
                        
                        if (!disponiblesAhora.includes(horaFormateada)) {
                            respuesta = `Uy! Parece que alguien acaba de tomar ese horario o no está disponible. 😅\n\nEstos son los que quedan:\n${disponiblesAhora.map(h => `- *${h}*`).join('\n')}\n\n¿Cuál prefieres?`;
                            break;
                        }

                        // Crear la Cita en base de datos
                        try {
                            const inicioCita = new Date(fechaSeleccionada);
                            const [horasStr, minsStr] = horaFormateada.split(':');
                            inicioCita.setHours(Number(horasStr), Number(minsStr), 0, 0);

                            const finCita = new Date(inicioCita);
                            finCita.setHours(inicioCita.getHours() + Math.floor(horasTatuaje));
                            finCita.setMinutes(inicioCita.getMinutes() + ((horasTatuaje % 1) * 60));

                            const solicitudRelacionada = await prisma.solicitud.findUnique({ where: { id: datos.solicitudId } });
                            const nuevaCita = await prisma.cita.create({
                                data: {
                                    negocioId,
                                    clienteId: solicitudRelacionada?.clienteId,
                                    solicitudId: datos.solicitudId,
                                    fechaHoraInicio: inicioCita,
                                    fechaHoraFin: finCita,
                                    duracionEnHoras: horasTatuaje,
                                    estadoCita: 'CONFIRMADA'
                                }
                            });

                            // Actualizar la solicitud a estado AGENDADO o similar si existiese.
                            
                            const horaFinStr = `${finCita.getHours().toString().padStart(2, '0')}:${finCita.getMinutes().toString().padStart(2, '0')}`;
                            respuesta = `¡Perfecto ${datos.nombre}!\n\nTu cita quedó agendada para *${formatearFechaAmigable(fechaSeleccionada)}* a las *${horaFormateada}*.\nLa sesión finalizará aproximadamente a las *${horaFinStr}*.\n\nTe esperamos en el estudio 🔥`;

                            await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                        } catch (err) {
                            console.error(`[Bot:${negocioId}] Error creando cita:`, err);
                            respuesta = 'Hubo un error al guardar tu cita. Por favor intenta de nuevo.';
                        }

                        break;
                    }

                    default:
                        respuesta = 'Algo salió mal. Escribe el comando de inicio para comenzar de nuevo.';
                }

                // Send response
                await botInstance.sock.sendMessage(remoteJid, { text: respuesta });
                await botInstance.sock.sendPresenceUpdate('paused', remoteJid);

                // Save outgoing message
                try {
                    const msgGuardado = await prisma.mensajeChat.create({
                        data: { negocioId, remoteJid, contenido: respuesta, direccion: 'SALIENTE' }
                    });
                    io.emit('nuevo-mensaje', msgGuardado);
                } catch (dbErr) {
                    console.error(`[Bot:${negocioId}] Error guardando msg saliente:`, dbErr);
                }
            } catch (error) {
                console.error(`[Bot:${negocioId}] Error:`, error);
                try {
                    await botInstance.sock.sendMessage(remoteJid, { text: '❌ Error interno. Escribe el comando de inicio para reiniciar.' });
                } catch {  }
            }
        }
    });

    return {};
};

// --- Utility Exports (unchanged) ---

export const getEstadoWhatsApp = (negocioId: number) => {
    const bot = bots.get(negocioId);
    return { conectado: bot?.conectado ?? false, qr: bot?.qr ?? null, activo: bots.has(negocioId) };
};

export const getBotsActivos = () => bots.size;

export const desvincularWhatsApp = async (negocioId: number) => {
    const bot = bots.get(negocioId);
    try {
        if (bot) {
            console.log(`[Bot:${negocioId}] Desconectando...`);
            await bot.sock.logout();
            bots.delete(negocioId);
            return { message: 'Sesión cerrada correctamente' };
        }
        return { message: 'No hay sesión activa' };
    } catch (error) {
        console.error(`[Bot:${negocioId}] Error al desvincular:`, error);
        bots.delete(negocioId);
        return { error: 'Error al cerrar sesión' };
    }
};

export const reiniciarWhatsApp = async (negocioId: number, io: Server) => {
    try {
        const bot = bots.get(negocioId);
        if (bot) {
            try { bot.sock.end(undefined); } catch {  }
            bots.delete(negocioId);
        }
        await clearAuthState(`negocio-${negocioId}`);
        io.emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null, reiniciando: true });
        setTimeout(() => iniciarWhatsAppNegocio(negocioId, io), 1000);
        return { message: 'Bot reiniciado. Espera el nuevo QR.' };
    } catch (error) {
        console.error(`[Bot:${negocioId}] Error reiniciando:`, error);
        return { error: 'Error al reiniciar el bot' };
    }
};

export const enviarMensaje = async (negocioId: number, remoteJid: string, text: string): Promise<boolean> => {
    const bot = bots.get(negocioId);
    if (!bot || !bot.conectado) {
        console.warn(`[Bot:${negocioId}] Sin conexión activa.`);
        return false;
    }
    try {
        await bot.sock.sendMessage(remoteJid, { text });
        try {
            const msgGuardado = await prisma.mensajeChat.create({
                data: { negocioId, remoteJid, contenido: text, direccion: 'SALIENTE' }
            });
            bot.io.emit('nuevo-mensaje', msgGuardado);
        } catch (dbErr) {
            console.error(`[Bot:${negocioId}] Error guardando msg saliente:`, dbErr);
        }
        return true;
    } catch (error) {
        console.error(`[Bot:${negocioId}] Error enviando a ${remoteJid}:`, error);
        return false;
    }
};

export const iniciarWhatsApp = (io: Server) => iniciarWhatsAppNegocio(1, io);

export const solicitarCodigoPairing = async (
    negocioId: number,
    telefono: string,
    io: Server
): Promise<{ codigo?: string; error?: string }> => {
    const telefonoLimpio = telefono.replace(/\D/g, '');
    if (telefonoLimpio.length < 7) {
        return { error: 'Numero invalido. Incluye el codigo de pais sin + (ej: 5491155443322).' };
    }
    if (bots.size >= MAX_BOTS_ACTIVOS && !bots.has(negocioId)) {
        return { error: `Limite de bots activos alcanzado (maximo ${MAX_BOTS_ACTIVOS}).` };
    }

    const botExistente = bots.get(negocioId);
    if (botExistente) {
        if (botExistente.conectado) {
            return { error: 'El bot ya esta conectado. Desvinculalo primero.' };
        }
        try { botExistente.sock.end(undefined); } catch {  }
        bots.delete(negocioId);
    }

    const sessionId = `negocio-${negocioId}`;
    await clearAuthState(sessionId);
    const { state, saveCreds } = await usePrismaAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[Bot:${negocioId}] Iniciando socket limpio para pairing code...`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    const instance: BotInstance = {
        sock,
        conectado: false,
        qr: null,
        intentos: 0,
        io,
        lidToPhone: new Map()
    };
    bots.set(negocioId, instance);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const bot = bots.get(negocioId);
        if (!bot) return;
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`[Bot:${negocioId}] Conectado via pairing code.`);
            bot.conectado = true;
            bot.qr = null;
            bot.intentos = 0;
            io.emit(`whatsapp-status-${negocioId}`, { conectado: true, qr: null, activo: true });
        }
        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            bot.conectado = false;
            io.emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null, activo: false });

            if (shouldReconnect && bot.intentos < 5) {
                bot.intentos++;
                bots.delete(negocioId);
                setTimeout(() => iniciarWhatsAppNegocio(negocioId, io), 3000);
            } else {
                bots.delete(negocioId);
                if (!shouldReconnect) await clearAuthState(sessionId);
            }
        }
    });

    try {
        await new Promise(resolve => setTimeout(resolve, 800));
        console.log(`[Bot:${negocioId}] Solicitando pairing code para ${telefonoLimpio}...`);
        const codigo = await sock.requestPairingCode(telefonoLimpio);
        console.log(`[Bot:${negocioId}] Codigo: ${codigo}`);
        return { codigo };
    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(`[Bot:${negocioId}] Error en pairing code:`, error);
        try { sock.end(undefined); } catch {  }
        bots.delete(negocioId);
        return { error: err?.message || 'Error al generar el codigo. Intenta con QR.' };
    }
};