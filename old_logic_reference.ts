// import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'; // Reemplazar
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { usePrismaAuthState } from './src/services/baileysAuth';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { Server } from 'socket.io';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// --- Configuración de IA (Gemini) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// --- Variables Globales ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sock: any = null;
let estaConectado = false;
let qrActual: string | null = null;
let ioInstance: Server | null = null;
let intentoDeReconexion = 0;

// Historial de conversación (simple, en memoria)
interface MessageHistory {
    role: 'user' | 'model';
    parts: string;
}
const conversationHistory: Record<string, MessageHistory[]> = {};

export const iniciarWhatsApp = async (io: Server) => {
    ioInstance = io;
    // const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { state, saveCreds } = await usePrismaAuthState('main-session');
    const { version } = await fetchLatestBaileysVersion();
    // ...

    console.log(`[Bot] Iniciando con Baileys v${version.join('.')}...`);

    sock = makeWASocket({
        version,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: pino({ level: 'silent' }) as any, // 'silent' para menos ruido en Render
        // printQRInTerminal: true, // Deprecated
        auth: state,
        browser: ['Citas Spa Bot', 'Chrome', '1.0.0'], // Nombre personalizado
        // Optimización de timeouts para conexiones lentas
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    // --- Manejo de Eventos de Conexión ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[Bot] Nuevo QR generado');
            qrActual = qr;
            estaConectado = false;

            // Emitir QR al frontend
            ioInstance?.emit('whatsapp-status', {
                conectado: false,
                qr: qrActual
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[Bot] Conexión cerrada. ¿Reconectar?: ', shouldReconnect);

            estaConectado = false;
            qrActual = null;
            ioInstance?.emit('whatsapp-status', {
                conectado: false,
                qr: null
            });

            if (shouldReconnect) {
                if (intentoDeReconexion < 5) {
                    console.log(`[Bot] Reintentando conexión (${intentoDeReconexion + 1}/5)...`);
                    intentoDeReconexion++;
                    // Pequeña pausa antes de reconectar para no saturar
                    setTimeout(() => iniciarWhatsApp(io), 3000);
                } else {
                    console.error('[Bot] Demasiados intentos fallidos. Reinicia el servidor manualmente.');
                }
            } else {
                console.log('[Bot] Desconectado permanentemente (Logout).');
                // Al usar base de datos, no borramos "archivos" localmente.
                // Si quisieras limpiar la sesión en DB:
                // await prisma.baileysSession.deleteMany({ where: { id: { startsWith: 'session-main-session' } } });
                console.log('[Bot] Reiniciando para nuevo QR...');
                iniciarWhatsApp(io);
            }
        } else if (connection === 'open') {
            console.log('[Bot] ✅ Conexión exitosa a WhatsApp!');
            estaConectado = true;
            qrActual = null;
            intentoDeReconexion = 0;

            ioInstance?.emit('whatsapp-status', {
                conectado: true,
                qr: null
            });
        }
    });

    // --- Guardar Credenciales ---
    sock.ev.on('creds.update', saveCreds);

    // --- Manejo de Mensajes Entrantes ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sock.ev.on('messages.upsert', async (m: any) => {
        // message type 'notify' son mensajes nuevos normales
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message) continue;
            // Ignorar mensajes propios o de estados
            if (msg.key.fromMe) continue;
            if (msg.key.remoteJid === 'status@broadcast') continue;

            const remoteJid = msg.key.remoteJid!;

            // Extraer el texto del mensaje (soporta texto simple y respuesta extendida)
            const textMessage = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';

            if (!textMessage) continue;

            console.log(`[Bot] Mensaje de ${remoteJid}: ${textMessage}`);

            // --- Lógica de IA (Gemini) ---
            try {
                // Simular "escribiendo..."
                await sock.sendPresenceUpdate('composing', remoteJid);

                // Historial básico
                if (!conversationHistory[remoteJid]) {
                    conversationHistory[remoteJid] = [];
                }
                const history = conversationHistory[remoteJid];

                // Prompt del sistema (simplificado para ejemplo)
                const systemInstruction = `
                    Eres Sofía, asistente virtual de 'Samsara Spa'. Tu objetivo es agendar citas.
                    Hoy es: ${new Date().toLocaleString('es-ES', { timeZone: 'America/La_Paz' })}.
                    Sé amable, breve y profesional.
                `;

                // Construir chat para Gemini
                const chat = model.startChat({
                    history: [
                        { role: 'user', parts: [{ text: systemInstruction }] },
                        { role: 'model', parts: [{ text: "Entendido, soy Sofía del Samsara Spa." }] },
                        ...history.map(h => ({ role: h.role, parts: [{ text: h.parts }] }))
                    ],
                });

                const result = await chat.sendMessage(textMessage);
                const response = result.response.text();

                // Guardar en historial
                history.push({ role: 'user', parts: textMessage });
                history.push({ role: 'model', parts: response });
                if (history.length > 20) history.shift(); // Limitar historial

                // Responder en WhatsApp
                await sock.sendMessage(remoteJid, { text: response });

                // Dejar de escribir
                await sock.sendPresenceUpdate('paused', remoteJid);

            } catch (error) {
                console.error('[Bot] Error procesando IA:', error);
                // Opcional: enviar mensaje de error al usuario
            }
        }
    });
};

export const getEstadoWhatsApp = () => {
    return {
        conectado: estaConectado,
        qr: qrActual
    };
};

export const desvincularWhatsApp = async () => {
    try {
        if (sock) {
            console.log('[Bot] Desconectando sesión...');
            await sock.logout();
            estaConectado = false;
            qrActual = null;
            return { message: 'Sesión cerrada correctamente' };
        }
        return { message: 'No hay sesión activa' };
    } catch (error) {
        console.error('[Bot] Error al desvincular:', error);
        return { error: 'Error al cerrar sesión' };
    }
};