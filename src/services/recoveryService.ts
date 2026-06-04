import { prisma } from '../lib/prisma';
import { enviarCodigoRecuperacion } from './emailService';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

/* ─── Store en memoria: email → { código, expiración } ────────────── */

interface RecoveryEntry {
    codigo: string;
    expiry: number;     // timestamp ms
    cooldown: number;   // timestamp ms — cuándo se puede reenviar
}

const recoveryStore = new Map<string, RecoveryEntry>();

/* ─── Helpers ─────────────────────────────────────────────────────── */

/** Genera un código numérico de 6 dígitos */
function generarCodigo(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Genera un JWT básico (identidad, sin estudio) */
function generarTokenBasico(usuario: { id: number; email: string }) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

/* ─── Servicio ────────────────────────────────────────────────────── */

export class RecoveryService {

    /**
     * Enviar código de recuperación.
     * - Si el correo existe en la BD → genera código, lo guarda en memoria y lo envía.
     * - Si NO existe → no envía nada, pero NO retorna error (seguridad).
     * - Siempre responde éxito al frontend.
     */
    static async enviarCodigo(email: string): Promise<void> {
        const usuario = await prisma.usuario.findUnique({ where: { email } });

        if (!usuario) {
            // No revelar si el correo existe
            console.log(`[Recovery] Correo no registrado: ${email} (silenciado)`);
            return;
        }

        const codigo = generarCodigo();
        const ahora = Date.now();

        recoveryStore.set(email.toLowerCase(), {
            codigo,
            expiry: ahora + 10 * 60 * 1000,    // 10 minutos
            cooldown: ahora + 60 * 1000,         // 1 minuto de cooldown para reenvío
        });

        try {
            await enviarCodigoRecuperacion(email, codigo);
            console.log(`[Recovery] Código enviado a ${email}`);
        } catch (err) {
            console.error(`[Recovery] Error enviando email a ${email}:`, err);
            // No lanzar error al usuario — flujo silencioso
        }
    }

    /**
     * Verificar el código ingresado.
     * Retorna token + datos de usuario si es correcto.
     */
    static async verificarCodigo(email: string, codigo: string) {
        const key = email.toLowerCase();
        const entry = recoveryStore.get(key);

        if (!entry) {
            throw { status: 400, message: 'Código inválido. Intenta nuevamente.' };
        }

        // ¿Expiró? (> 10 minutos)
        if (Date.now() > entry.expiry) {
            recoveryStore.delete(key);
            throw { status: 400, message: 'El código ha expirado. Solicita uno nuevo.' };
        }

        // ¿Código correcto?
        if (entry.codigo !== codigo) {
            throw { status: 400, message: 'Código inválido. Intenta nuevamente.' };
        }

        // Código válido → limpiar store y autenticar
        recoveryStore.delete(key);

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario) {
            throw { status: 404, message: 'Usuario no encontrado.' };
        }

        const token = generarTokenBasico(usuario);
        return {
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                fotoUrl: usuario.fotoUrl,
            },
        };
    }

    /**
     * Reenviar código.
     * Respeta el cooldown de 1 minuto.
     */
    static async reenviarCodigo(email: string): Promise<{ cooldownRestante: number }> {
        const key = email.toLowerCase();
        const entry = recoveryStore.get(key);
        const ahora = Date.now();

        // Verificar cooldown
        if (entry && ahora < entry.cooldown) {
            const restante = Math.ceil((entry.cooldown - ahora) / 1000);
            throw { status: 429, message: `Espera ${restante} segundos para reenviar.`, cooldownRestante: restante };
        }

        // Enviar nuevo código
        await this.enviarCodigo(email);
        return { cooldownRestante: 60 };
    }
}
