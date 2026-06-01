import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import { usePrismaAuthState, clearAuthState } from './baileysAuth';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { v2 as cloudinary } from 'cloudinary';
import { ContextoConversacion, EstadoConversacion } from './aiService';
import { MAX_BOTS_ACTIVOS } from '../config';
import { getAvailableSlots, getArtistasDelNegocio } from './calendarService';
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

// ✅ Fix 5: Backoff exponencial para reconexiones (3s → 6s → 12s → 24s → 48s → 60s)
const calcularBackoffDelay = (intentos: number): number => {
    const base = 3000;
    const delay = base * Math.pow(2, intentos - 1);
    return Math.min(delay, 60000); // Máximo 60 segundos
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
const initializingBots = new Set<number>(); // Mutex para evitar clones

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
    const fromMe = msg.key?.fromMe;
    if (fromMe) return null;

    const candidatos = [
        resolverTelefonoReal(remoteJid, negocioId),
        msg?.key?.participantPn,
        msg?.key?.participant,
        msg?.participant,
    ];

    // Intentar buscar el teléfono real primero (normalmente menos de 15 dígitos)
    for (const candidato of candidatos) {
        if (!candidato || typeof candidato !== 'string') continue;
        const numero = normalizarTelefono(candidato.split('@')[0]);
        if (esTelefonoValido(numero) && numero.length < 14) {
            return numero;
        }
    }

    // Fallback: Si WhatsApp no nos da el número real (ej. por dispositivo vinculado o privacidad)
    // usamos el ID único de lid (2728...) para que no se rompa el flujo
    const numeroFallback = normalizarTelefono(remoteJid.split('@')[0]);
    if (esTelefonoValido(numeroFallback)) {
        return numeroFallback;
    }

    return null;
};

export const iniciarWhatsAppNegocio = async (negocioId: number, io: Server): Promise<{ error?: string, message?: string }> => {
    if (bots.has(negocioId)) {
        console.log(`[Bot:${negocioId}] Ya está en memoria, no reiniciamos.`);
        const bot = bots.get(negocioId)!;
        io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: bot.conectado, qr: bot.qr });
        return {};
    }

    if (initializingBots.has(negocioId)) {
        console.log(`[Bot:${negocioId}] Inicialización ya en progreso, ignorando petición duplicada.`);
        return { message: 'Bot iniciando...' };
    }

    if (bots.size >= MAX_BOTS_ACTIVOS) {
        console.warn(`[Bot] ⚠️ Límite de bots activos alcanzado (${MAX_BOTS_ACTIVOS}). Negocio ${negocioId} no puede iniciar.`);
        return { error: `Límite de bots activos alcanzado (máximo ${MAX_BOTS_ACTIVOS}). Contacta al soporte para ampliar el límite.` };
    }
    initializingBots.add(negocioId); // Bloqueamos nuevas peticiones

    try {
        const sessionId = `negocio-${negocioId}`;
        const { state, saveCreds } = await usePrismaAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`[Bot:${negocioId}] Iniciando con Baileys v${version.join('.')}...`);

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            browser: ['Ubuntu', 'Chrome', '110.0.5481.177'],
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
            io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: false, qr });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.error(`[Bot:${negocioId}] Conexión cerrada. Razón: ${reason}`);
            bot.conectado = false;
            bot.qr = null;
            io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null });

            if (shouldReconnect) {
                if (bot.intentos < 5) {
                    bot.intentos++;
                    const delay = calcularBackoffDelay(bot.intentos);
                    console.log(`[Bot:${negocioId}] Reintentando en ${delay / 1000}s (${bot.intentos}/5)...`);
                    bots.delete(negocioId);
                    setTimeout(() => iniciarWhatsAppNegocio(negocioId, io), delay);
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
            io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: true, qr: null });
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
                io.to(`negocio-${negocioId}`).emit('nuevo-mensaje', msgGuardado);
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
                // Simulación de lectura humana (1 a 3 segundos) antes de empezar a escribir
                const delayLectura = Math.floor(Math.random() * 2000) + 1000;
                await new Promise(resolve => setTimeout(resolve, delayLectura));
                await botInstance.sock.readMessages([msg.key]);

                await botInstance.sock.sendPresenceUpdate('composing', remoteJid);
                const cmd = textMessage.trim().toLowerCase();

                // Cancel commands
                if (/\b(cancelar|salir|adi[oó]s|reiniciar|chau|ya no)\b/i.test(cmd)) {
                    await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                    await botInstance.sock.sendMessage(remoteJid, { text: '👋 Entendido, cancelamos el proceso. ¡Hasta pronto!' });
                    continue;
                }

                let respuesta = '';
                const datos = sesion.datos as any;

                switch (contexto.estado) {
                    case 'INICIO': {
                        // Obtener nombre del negocio
                        const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, select: { nombre: true } });
                        const nombreEstudio = negocio?.nombre || 'nuestro estudio de tatuajes';
                        respuesta = `🎨 ¡Hola! 👋 Bienvenido/a a *${nombreEstudio}*.\n\nAntes de comenzar, ¿cuál es tu *nombre*?`;
                        await prisma.sesionChat.updateMany({
                            where: { id: remoteJid, negocioId },
                            data: { estado: 'ESPERANDO_NOMBRE' }
                        });
                        break;
                    }

                    case 'ESPERANDO_NOMBRE': {
                        if (textMessage.trim().length < 3) {
                            respuesta = 'Por favor, ingresa tu nombre (mínimo 3 caracteres).';
                        } else {
                            const nombre = textMessage.trim();
                            
                            // Obtener artistas del negocio
                            const artistas = await getArtistasDelNegocio(negocioId);
                            
                            if (artistas.length === 0) {
                                respuesta = `Mucho gusto, *${nombre}* 🔥\n\nLo sentimos, en este momento no hay artistas disponibles en el estudio. Por favor intenta más tarde.`;
                                await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            } else if (artistas.length === 1) {
                                // Solo hay un artista, asignarlo automáticamente
                                const artista = artistas[0];
                                respuesta = `Mucho gusto, *${nombre}* 🔥\n\nSerás atendido por *${artista.nombre}* 😎\n\nAhora cuéntame: ¿Qué tattoo quieres hacerte? Descríbelo brevemente.\n\nEj: "Una rosa en estilo realista", "Un dragón japonés", etc.`;
                                await prisma.sesionChat.updateMany({
                                    where: { id: remoteJid, negocioId },
                                    data: { 
                                        estado: 'ESPERANDO_DESCRIPCION', 
                                        datos: { ...datos, nombre, artistaId: artista.id, artistaNombre: artista.nombre } 
                                    }
                                });
                            } else {
                                // Mostrar lista de artistas
                                const listaArtistas = artistas.map((a, i) => `*${i + 1}.* ${a.nombre}`).join('\n');
                                respuesta = `Mucho gusto, *${nombre}* 🔥\n\nEstos son nuestros artistas disponibles:\n\n${listaArtistas}\n\nEscribe el *número* o *nombre* del artista con el que deseas tatuarte.`;
                                await prisma.sesionChat.updateMany({
                                    where: { id: remoteJid, negocioId },
                                    data: { 
                                        estado: 'ESPERANDO_ARTISTA', 
                                        datos: { ...datos, nombre, artistasDisponibles: artistas } 
                                    }
                                });
                            }
                        }
                        break;
                    }

                    case 'ESPERANDO_ARTISTA': {
                        const artistasDisponibles = datos.artistasDisponibles as { id: number; nombre: string }[];
                        if (!artistasDisponibles || artistasDisponibles.length === 0) {
                            respuesta = 'Ocurrió un error. Escribe */start* para reiniciar.';
                            await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            break;
                        }

                        const inputLower = normalizarTexto(textMessage);
                        let artistaSeleccionado: { id: number; nombre: string } | undefined;

                        // Intentar por número
                        const numero = parseInt(textMessage.trim());
                        if (!isNaN(numero) && numero >= 1 && numero <= artistasDisponibles.length) {
                            artistaSeleccionado = artistasDisponibles[numero - 1];
                        }

                        // Intentar por nombre (coincidencia parcial)
                        if (!artistaSeleccionado) {
                            artistaSeleccionado = artistasDisponibles.find(a => 
                                normalizarTexto(a.nombre).includes(inputLower) || 
                                inputLower.includes(normalizarTexto(a.nombre))
                            );
                        }

                        if (!artistaSeleccionado) {
                            const listaArtistas = artistasDisponibles.map((a, i) => `*${i + 1}.* ${a.nombre}`).join('\n');
                            respuesta = `No encontré ese artista. Por favor elige uno de la lista:\n\n${listaArtistas}\n\nEscribe el *número* o *nombre*.`;
                        } else {
                            respuesta = `Excelente elección, *${artistaSeleccionado.nombre}* 😎\n\nAhora cuéntame: ¿Qué tattoo quieres hacerte? Descríbelo brevemente.\n\nEj: "Una rosa en estilo realista", "Un dragón japonés", etc.`;
                            // Limpiamos artistasDisponibles del JSON para que no ocupe espacio
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { 
                                    estado: 'ESPERANDO_DESCRIPCION', 
                                    datos: { 
                                        nombre: datos.nombre, 
                                        artistaId: artistaSeleccionado.id, 
                                        artistaNombre: artistaSeleccionado.nombre 
                                    } 
                                }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_DESCRIPCION': {
                        if (textMessage.trim().length < 3) {
                            respuesta = 'Por favor, describe un poco más el tatuaje que deseas.';
                        } else {
                            const descripcion = textMessage.trim();
                            respuesta = `Perfecto 📸\n\nAhora envíame una *imagen de referencia* del tattoo que deseas.\n\n- Si la tienes, *envíala ahora*\n- Si no, escribe *"no"*`;
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_FOTO', datos: { ...datos, descripcionTattoo: descripcion } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_FOTO': {
                        // Candado atómico
                        const lock = await prisma.sesionChat.updateMany({
                            where: { id: remoteJid, negocioId, estado: 'ESPERANDO_FOTO' },
                            data: { estado: 'PROCESANDO_SOLICITUD' }
                        });
                        
                        if (lock.count === 0) {
                            console.log(`[Bot:${negocioId}] Candado activado: ignorando imagen duplicada de ${remoteJid}`);
                            continue;
                        }

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
                                await prisma.sesionChat.updateMany({ where: { id: remoteJid, negocioId }, data: { estado: 'ESPERANDO_FOTO' } });
                                break;
                            }
                        } else if (!noTieneFoto) {
                            respuesta = '📸 Por favor envía una *imagen* de referencia o escribe *"no"* si no tienes una.';
                            await prisma.sesionChat.updateMany({ where: { id: remoteJid, negocioId }, data: { estado: 'ESPERANDO_FOTO' } });
                            break;
                        }

                        respuesta = `${fotoUrl ? 'Imagen recibida ✅' : 'Entendido, sin foto de referencia.'}\n\nAhora indícame el *tamaño aproximado* del tattoo.\n\nEjemplos:\n- *5x5 cm*\n- *10x15 cm*\n- *20x12 cm*`;
                        await prisma.sesionChat.updateMany({
                            where: { id: remoteJid, negocioId },
                            data: { estado: 'ESPERANDO_TAMANIO', datos: { ...datos, fotoReferenciaUrl: fotoUrl } }
                        });
                        break;
                    }

                    case 'ESPERANDO_TAMANIO': {
                        const tamanioNormalizado = extraerTamanioTattoo(textMessage);
                        if (!tamanioNormalizado) {
                            respuesta = 'Para el tamaño necesito *dos medidas*.\n\nEnvíalo así:\n- *10 x 10 cm*\n- *5x5 cm*\n- *7.5 x 12 cm*';
                        } else {
                            respuesta = '¡Casi listos! 🙌\n\nPor último, ¿en qué *zona del cuerpo* te gustaría hacerte el tatuaje?\n\nEj: Antebrazo, pierna, espalda, pecho...';
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_ZONA', datos: { ...datos, tamanio: tamanioNormalizado } }
                            });
                        }
                        break;
                    }

                    case 'ESPERANDO_ZONA': {
                        if (textMessage.trim().length < 3) {
                            respuesta = 'Por favor, dime una zona del cuerpo válida (ej. brazo, pierna, espalda).';
                        } else {
                            const zonaDelCuerpo = textMessage.trim();
                            // --- Crear Cliente + Solicitud con artista asignado y zona del cuerpo ---
                            const telefonoCliente = obtenerTelefonoCliente(msg, remoteJid, negocioId);
                            const datosFinales = { ...datos, zonaDelCuerpo };

                            if (!telefonoCliente) {
                                respuesta = '⚠️ No pude obtener tu número de WhatsApp correctamente. Escribe */start* para reiniciar.';
                                await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                                break;
                            }

                            try {
                                const cliente = await prisma.cliente.upsert({
                                    where: { numeroWhatsapp_negocioId: { numeroWhatsapp: telefonoCliente, negocioId } },
                                    update: { nombre: datosFinales.nombre || 'Cliente' },
                                    create: { negocioId, nombre: datosFinales.nombre || 'Cliente', numeroWhatsapp: telefonoCliente }
                                });

                                const solicitud = await prisma.solicitud.create({
                                    data: {
                                        negocioId,
                                        clienteId: cliente.id,
                                        artistaId: datosFinales.artistaId || null,
                                        tipo: 'tatuaje',
                                        descripcion: datosFinales.descripcionTattoo || 'Sin descripción',
                                        tamanoEnCm: datosFinales.tamanio || null,
                                        fotoReferenciaUrl: datosFinales.fotoReferenciaUrl || null,
                                        zonaDelCuerpo: datosFinales.zonaDelCuerpo,
                                    }
                                });

                                io.to(`negocio-${negocioId}`).emit('nueva-solicitud', {
                                    id: solicitud.id,
                                    clienteNombre: cliente.nombre,
                                    clienteTelefono: telefonoCliente,
                                    tipo: 'tatuaje',
                                    descripcion: solicitud.descripcion,
                                    artistaNombre: datosFinales.artistaNombre || 'Sin asignar',
                                    zonaDelCuerpo: datosFinales.zonaDelCuerpo
                                });

                                const artistaNombre = datosFinales.artistaNombre || 'el estudio';
                                respuesta = `✅ *¡Solicitud registrada con éxito!*\n\n📋 *Resumen:*\n👤 Nombre: ${datosFinales.nombre}\n🎨 Tattoo: ${datosFinales.descripcionTattoo}\n📏 Tamaño: ${datosFinales.tamanio}\n📍 Zona: ${datosFinales.zonaDelCuerpo}\n📸 Foto: ${datosFinales.fotoReferenciaUrl ? 'Sí' : 'No'}\n📌 Artista: ${artistaNombre}\n\nTu solicitud fue enviada al artista *${artistaNombre}*.\nTe avisaremos cuando la cotización esté lista. ¡Gracias! 🙏`;

                                await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            } catch (dbError) {
                                console.error(`[Bot:${negocioId}] Error creando solicitud:`, dbError);
                                respuesta = '❌ Hubo un error al registrar tu solicitud. Intenta nuevamente escribiendo el comando de inicio.';
                                await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            }
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
                                const artistaIdParaSlots = datos.artistaId as number | undefined;
                                const disponibles = await getAvailableSlots(negocioId, fechaConsultada, horasTatuaje, artistaIdParaSlots);
                                const artistaNombre = datos.artistaNombre || 'tu artista';
                                
                                if (disponibles.length === 0) {
                                    respuesta = `Lo siento, para el *${formatearFechaAmigable(fechaConsultada)}* no hay horarios disponibles para *${artistaNombre}* que puedan acomodar las ${horasTatuaje} horas de tu sesión. 😢\n\n¿Te gustaría intentar con otra fecha?`;
                                } else {
                                    const listaHorarios = disponibles.map(h => `- *${h}*`).join('\n');
                                    respuesta = `Para el *${formatearFechaAmigable(fechaConsultada)}* tengo la siguiente disponibilidad para *${artistaNombre}*:\n\n${listaHorarios}\n\nElige un horario.`;
                                    
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
                        const horaRegex = /^([01]?\d|2[0-3]):?([0-5]\d)$/;
                        const match = horaElegida.match(horaRegex);
                        
                        if (!match) {
                            // Quizá quiere cambiar la fecha
                            const posibleFecha = parsearFechaNatural(textMessage);
                            if (posibleFecha && posibleFecha.confianza !== 'baja') {
                                const fechaConsultada = posibleFecha.fecha;
                                const hoy = new Date();
                                hoy.setHours(0, 0, 0, 0);

                                if (fechaConsultada < hoy) {
                                    respuesta = 'No podemos viajar en el tiempo 🕰️😅. Por favor elige una fecha que sea a partir de hoy.';
                                } else {
                                    const horasTatuaje = Number(datos.horasEstimadas) || 1;
                                    const artistaIdParaSlots = datos.artistaId as number | undefined;
                                    const disponibles = await getAvailableSlots(negocioId, fechaConsultada, horasTatuaje, artistaIdParaSlots);
                                    const artistaNombre = datos.artistaNombre || 'tu artista';
                                    
                                    if (disponibles.length === 0) {
                                        respuesta = `Lo siento, para el *${formatearFechaAmigable(fechaConsultada)}* no hay horarios disponibles para *${artistaNombre}*. 😢\n\n¿Te gustaría intentar con otra fecha?`;
                                        await prisma.sesionChat.updateMany({
                                            where: { id: remoteJid, negocioId },
                                            data: { estado: 'ESPERANDO_FECHA' }
                                        });
                                    } else {
                                        const listaHorarios = disponibles.map(h => `- *${h}*`).join('\n');
                                        respuesta = `¡Entendido! Cambiamos al *${formatearFechaAmigable(fechaConsultada)}*.\n\nDisponibilidad de *${artistaNombre}*:\n\n${listaHorarios}\n\nEscribe la hora que prefieres.`;
                                        
                                        await prisma.sesionChat.updateMany({
                                            where: { id: remoteJid, negocioId },
                                            data: { 
                                                estado: 'ESPERANDO_HORA', 
                                                datos: { ...datos, fechaSeleccionada: fechaConsultada }
                                            }
                                        });
                                    }
                                }
                                break;
                            }

                            respuesta = 'Por favor, escribe la hora en formato válido. Ej: "14:00", "16:30".';
                            break;
                        }

                        let horaFormateada = `${match[1].padStart(2, '0')}:${match[2]}`;
                        
                        // Doble chequeo de disponibilidad del ARTISTA
                        const fechaSeleccionada = new Date(datos.fechaSeleccionada);
                        const horasTatuaje = Number(datos.horasEstimadas) || 1;
                        const artistaIdParaValidar = datos.artistaId as number | undefined;
                        const disponiblesAhora = await getAvailableSlots(negocioId, fechaSeleccionada, horasTatuaje, artistaIdParaValidar);
                        
                        if (!disponiblesAhora.includes(horaFormateada)) {
                            const artistaNombre = datos.artistaNombre || 'tu artista';
                            if (disponiblesAhora.length === 0) {
                                respuesta = `¡Ups! Parece que ya no hay horarios disponibles para *${artistaNombre}* en esa fecha. 😅\n\n¿Te gustaría intentar con otra fecha?`;
                                await prisma.sesionChat.updateMany({
                                    where: { id: remoteJid, negocioId },
                                    data: { estado: 'ESPERANDO_FECHA' }
                                });
                            } else {
                                respuesta = `Ese horario ya no está disponible para *${artistaNombre}*. 😅\n\nEstos son los que quedan:\n${disponiblesAhora.map(h => `- *${h}*`).join('\n')}\n\n¿Cuál prefieres?`;
                            }
                            break;
                        }

                        // Crear la Cita en base de datos con el artista asignado
                        try {
                            const inicioCita = new Date(fechaSeleccionada);
                            const [horasStr, minsStr] = horaFormateada.split(':');
                            inicioCita.setHours(Number(horasStr), Number(minsStr), 0, 0);

                            const finCita = new Date(inicioCita);
                            finCita.setHours(inicioCita.getHours() + Math.floor(horasTatuaje));
                            finCita.setMinutes(inicioCita.getMinutes() + ((horasTatuaje % 1) * 60));

                            const solicitudRelacionada = await prisma.solicitud.findUnique({ where: { id: datos.solicitudId } });

                            // ── Obtener configuración de anticipo ──────────────────────────────
                            const config = await prisma.configuracion.findUnique({ where: { negocioId } });
                            const cobrarAdelanto = config?.cobrarAdelanto ?? true;
                            const porcentaje     = config?.porcentajeAdelanto ?? 50;
                            const precioCotizado = Number(datos.precioCotizado) || 0;
                            const montoAnticipo  = cobrarAdelanto && precioCotizado > 0
                                ? parseFloat(((precioCotizado * porcentaje) / 100).toFixed(2))
                                : 0;

                            // ── Cita en PENDIENTE hasta que llegue el comprobante ─────────────
                            const nuevaCita = await prisma.cita.create({
                                data: {
                                    negocioId,
                                    clienteId: solicitudRelacionada?.clienteId,
                                    artistaId: datos.artistaId || solicitudRelacionada?.artistaId || null,
                                    solicitudId: datos.solicitudId,
                                    fechaHoraInicio: inicioCita,
                                    fechaHoraFin: finCita,
                                    duracionEnHoras: horasTatuaje,
                                    estadoCita: cobrarAdelanto && montoAnticipo > 0 ? 'PENDIENTE' : 'CONFIRMADA'
                                }
                            });

                            const horaFinStr = `${finCita.getHours().toString().padStart(2, '0')}:${finCita.getMinutes().toString().padStart(2, '0')}`;
                            const artistaNombre = datos.artistaNombre || 'tu artista';

                            if (cobrarAdelanto && montoAnticipo > 0) {
                                // ── Pago provisional con expiración de 1 hora ────────────────
                                const expiradoEn = new Date(Date.now() + 60 * 60 * 1000);
                                await prisma.pago.create({
                                    data: {
                                        negocioId,
                                        monto: montoAnticipo,
                                        clienteId: solicitudRelacionada?.clienteId!,
                                        citaId: nuevaCita.id,
                                        estadoValidacion: 'PENDIENTE_VALIDACION',
                                        expiradoEn,
                                        // registradoPorId se establece como el primer admin del negocio
                                        registradoPorId: (await prisma.miembroEstudio.findFirst({
                                            where: { negocioId, rol: 'ADMIN' },
                                            select: { usuarioId: true }
                                        }))?.usuarioId ?? solicitudRelacionada?.artistaId ?? 1
                                    }
                                });

                                // ── Enviar QR del estudio + instrucciones ─────────────────────
                                const qrUrl = config?.qrContenido || '';
                                if (qrUrl && (qrUrl.startsWith('http') || qrUrl.startsWith('data:'))) {
                                    try {
                                        await botInstance.sock.sendMessage(remoteJid, { image: { url: qrUrl }, caption: '🏦 *QR de pago del estudio*' });
                                    } catch (imgErr) {
                                        console.error(`[Bot:${negocioId}] Error enviando QR:`, imgErr);
                                    }
                                }

                                respuesta = `📋 *Resumen de tu cita:*\n👤 Cliente: ${datos.nombre}\n📌 Artista: *${artistaNombre}*\n📅 Fecha: *${formatearFechaAmigable(fechaSeleccionada)}*\n🕐 Hora: *${horaFormateada}* - *${horaFinStr}*\n⏱️ Duración: ${horasTatuaje} horas\n💰 Precio total: $${precioCotizado}\n\n💳 *Anticipo requerido (${porcentaje}%): $${montoAnticipo}*\n\nTu reserva está *pendiente*. Tienes *1 hora* para enviarnos el comprobante de pago vía esta conversación y confirmar tu cita definitivamente.\n\n⏰ Si no recibimos el comprobante a tiempo, la reserva se liberará automáticamente.`;

                                // ── Cambiar sesión a ESPERANDO_COMPROBANTE ────────────────────
                                await prisma.sesionChat.updateMany({
                                    where: { id: remoteJid, negocioId },
                                    data: {
                                        estado: 'ESPERANDO_COMPROBANTE',
                                        datos: { ...datos, citaId: nuevaCita.id, montoAnticipo }
                                    }
                                });
                            } else {
                                // Sin anticipo → cita confirmada directamente
                                respuesta = `✅ *¡Cita confirmada!*\n\n📋 *Detalles:*\n👤 Cliente: ${datos.nombre}\n📌 Artista: *${artistaNombre}*\n📅 Fecha: *${formatearFechaAmigable(fechaSeleccionada)}*\n🕐 Hora: *${horaFormateada}* - *${horaFinStr}*\n⏱️ Duración: ${horasTatuaje} horas\n💰 Precio: ${precioCotizado ? `$${precioCotizado}` : 'Por confirmar'}\n\n¡Te esperamos! 🔥`;
                                await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                            }
                        } catch (err) {
                            console.error(`[Bot:${negocioId}] Error creando cita:`, err);
                            respuesta = 'Hubo un error al guardar tu cita. Por favor intenta de nuevo.';
                        }

                        break;
                    }

                    case 'ESPERANDO_COMPROBANTE': {
                        if (!hasImage) {
                            respuesta = '📸 Para confirmar tu cita, por favor *envía la imagen* del comprobante de pago.';
                            break;
                        }

                        // Candado atómico — evita procesar la misma imagen dos veces
                        const lock = await prisma.sesionChat.updateMany({
                            where: { id: remoteJid, negocioId, estado: 'ESPERANDO_COMPROBANTE' },
                            data: { estado: 'PROCESANDO_COMPROBANTE' }
                        });
                        if (lock.count === 0) {
                            console.log(`[Bot:${negocioId}] Candado activado: ignorando comprobante duplicado de ${remoteJid}`);
                            continue;
                        }

                        let comprobanteUrl: string | null = null;
                        try {
                            const buffer = await downloadMediaMessage(msg, 'buffer', {});
                            const uploadResult = await new Promise<import('cloudinary').UploadApiResponse>((resolve, reject) => {
                                cloudinary.uploader.upload_stream({ folder: 'comprobantes_pago' }, (error, result) => {
                                    if (error) reject(error); else resolve(result!);
                                }).end(buffer);
                            });
                            comprobanteUrl = uploadResult.secure_url;
                        } catch (uploadErr) {
                            console.error(`[Bot:${negocioId}] Error subiendo comprobante:`, uploadErr);
                            await prisma.sesionChat.updateMany({
                                where: { id: remoteJid, negocioId },
                                data: { estado: 'ESPERANDO_COMPROBANTE' }
                            });
                            respuesta = '❌ Error al subir la imagen. Intenta enviarla de nuevo.';
                            break;
                        }

                        // Actualizar el Pago provisional con la URL del comprobante
                        const pagoActualizado = await prisma.pago.updateMany({
                            where: {
                                negocioId,
                                citaId: datos.citaId,
                                estadoValidacion: 'PENDIENTE_VALIDACION',
                                fotoComprobanteUrl: null
                            },
                            data: { fotoComprobanteUrl: comprobanteUrl }
                        });

                        if (pagoActualizado.count === 0) {
                            console.warn(`[Bot:${negocioId}] No se encontró pago provisional para cita ${datos.citaId}`);
                        }

                        // Emitir evento Socket.IO para que la app mobile actualice la lista
                        io.to(`negocio-${negocioId}`).emit('nuevo-comprobante-pago', {
                            citaId: datos.citaId,
                            clienteNombre: datos.nombre,
                            comprobanteUrl
                        });

                        respuesta = `✅ *¡Comprobante recibido!*\n\nEl equipo revisará tu pago y confirmará tu cita a la brevedad. Te avisaremos por aquí.\n\n¡Gracias por tu confianza! 🙏🎨`;
                        await prisma.sesionChat.deleteMany({ where: { id: remoteJid, negocioId } });
                        break;
                    }

                    default:
                        respuesta = 'Algo salió mal. Escribe el comando de inicio para comenzar de nuevo.';
                }

                // Simulación Humana (Anti-Ban)
                // Calculamos un delay basado en la longitud de la respuesta + jitter aleatorio
                const jitter = Math.floor(Math.random() * 1000);
                const delaySimulado = Math.min(Math.max(respuesta.length * 30, 1500), 5000) + jitter;
                await new Promise(resolve => setTimeout(resolve, delaySimulado));

                // Send response
                await botInstance.sock.sendMessage(remoteJid, { text: respuesta });
                await botInstance.sock.sendPresenceUpdate('paused', remoteJid);

                // Save outgoing message
                try {
                    const msgGuardado = await prisma.mensajeChat.create({
                        data: { negocioId, remoteJid, contenido: respuesta, direccion: 'SALIENTE' }
                    });
                    io.to(`negocio-${negocioId}`).emit('nuevo-mensaje', msgGuardado);
                } catch (dbErr) {
                    console.error(`[Bot:${negocioId}] Error guardando msg saliente:`, dbErr);
                }
            } catch (error) {
                console.error(`[Bot:${negocioId}] Error:`, error);
                if (botInstance.conectado) {
                    try {
                        await botInstance.sock.sendMessage(remoteJid, { text: '❌ Error interno. Escribe el comando de inicio para reiniciar.' });
                    } catch {  }
                }
            }
        }
    });

    initializingBots.delete(negocioId);
    return {};
    } catch (initErr) {
        initializingBots.delete(negocioId);
        console.error(`[Bot:${negocioId}] Error en inicialización:`, initErr);
        return { error: 'Falló la inicialización del bot.' };
    }
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
        io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null, reiniciando: true });
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
            bot.io.to(`negocio-${negocioId}`).emit('nuevo-mensaje', msgGuardado);
        } catch (dbErr) {
            console.error(`[Bot:${negocioId}] Error guardando msg saliente:`, dbErr);
        }
        return true;
    } catch (error) {
        console.error(`[Bot:${negocioId}] Error enviando a ${remoteJid}:`, error);
        return false;
    }
};

export const iniciarWhatsApp = async (io: Server) => {
    try {
        console.log('[Bot] 🔄 Buscando sesiones de WhatsApp activas en la base de datos...');
        // Buscamos todas las credenciales guardadas. Tienen formato "session-negocio-X-creds"
        const sesionesActivas = await prisma.baileysSession.findMany({
            where: {
                id: {
                    endsWith: '-creds'
                }
            }
        });

        if (sesionesActivas.length === 0) {
            console.log('[Bot] 📭 No hay sesiones activas guardadas.');
            return;
        }

        for (const sesion of sesionesActivas) {
            // Extraer el negocioId del id (ej: "session-negocio-1-creds")
            const match = sesion.id.match(/session-negocio-(\d+)-creds/);
            if (match && match[1]) {
                const negocioId = parseInt(match[1]);
                console.log(`[Bot] 🔌 Reconectando automáticamente negocio ${negocioId}...`);
                // Inicializamos el bot sin bloquear el ciclo
                iniciarWhatsAppNegocio(negocioId, io).catch(err => {
                    console.error(`[Bot] Error auto-conectando negocio ${negocioId}:`, err);
                });
            }
        }
    } catch (error) {
        console.error('[Bot] ❌ Error al buscar sesiones activas:', error);
    }
};

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
        browser: ['Ubuntu', 'Chrome', '110.0.5481.177'],
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
            io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: true, qr: null, activo: true });
        }
        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            bot.conectado = false;
            io.to(`negocio-${negocioId}`).emit(`whatsapp-status-${negocioId}`, { conectado: false, qr: null, activo: false });

            if (shouldReconnect && bot.intentos < 5) {
                bot.intentos++;
                const delay = calcularBackoffDelay(bot.intentos);
                bots.delete(negocioId);
                setTimeout(() => iniciarWhatsAppNegocio(negocioId, io), delay);
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