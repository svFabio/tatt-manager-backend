import { prisma } from '../lib/prisma';
import { enviarCodigoRegistroEmail } from './emailService';

/* ─── Store en memoria: email → { código, expiración } ────────────── */
interface VerificationEntry {
    codigo: string;
    expiry: number;     // timestamp ms
    cooldown: number;   // timestamp ms — cuándo se puede reenviar
}

const verificationStore = new Map<string, VerificationEntry>();

/** Genera un código numérico de 6 dígitos */
function generarCodigo(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export class VerificationService {
    /**
     * Enviar código de verificación para registro.
     * Si el correo ya existe en la BD, retorna un error.
     */
    static async enviarCodigo(email: string): Promise<void> {
        const usuario = await prisma.usuario.findUnique({ where: { email } });

        if (usuario) {
            throw { status: 400, message: 'El correo ya está registrado en el sistema.' };
        }

        const codigo = generarCodigo();
        const ahora = Date.now();

        verificationStore.set(email.toLowerCase(), {
            codigo,
            expiry: ahora + 10 * 60 * 1000,    // 10 minutos
            cooldown: ahora + 60 * 1000,         // 1 minuto de cooldown para reenvío
        });

        try {
            await enviarCodigoRegistroEmail(email, codigo);
            console.log(`[Verification] Código de registro enviado a ${email}`);
        } catch (err) {
            console.error(`[Verification] Error enviando email a ${email}:`, err);
            throw { status: 500, message: 'Error al enviar el código de verificación por correo.' };
        }
    }

    /**
     * Verificar el código de registro ingresado.
     * Retorna true si es válido, lanza error si no lo es.
     * No borramos el código aún para que puedan completar el registro inmediatamente después,
     * o podemos borrarlo y asumir que el cliente mandará el código de nuevo y simplemente lo verificamos temporalmente?
     * Mejor, lo validamos al crear la cuenta, o creamos un token temporal. 
     * Para mantenerlo simple: el cliente verifica el código y la ruta de registro final lo vuelve a validar.
     */
    static async verificarCodigo(email: string, codigo: string): Promise<boolean> {
        const key = email.toLowerCase();
        const entry = verificationStore.get(key);

        if (!entry) {
            throw { status: 400, message: 'Código inválido o no solicitado.' };
        }

        if (Date.now() > entry.expiry) {
            verificationStore.delete(key);
            throw { status: 400, message: 'El código ha expirado. Solicita uno nuevo.' };
        }

        if (entry.codigo !== codigo) {
            throw { status: 400, message: 'Código inválido. Intenta nuevamente.' };
        }

        return true;
    }

    /**
     * Usar y limpiar el código (llamado al completar el registro)
     */
    static consumirCodigo(email: string, codigo: string) {
        const key = email.toLowerCase();
        const entry = verificationStore.get(key);
        
        if (!entry || entry.codigo !== codigo || Date.now() > entry.expiry) {
            throw { status: 400, message: 'Código de verificación inválido o expirado.' };
        }

        verificationStore.delete(key);
    }

    /**
     * Reenviar código de registro.
     */
    static async reenviarCodigo(email: string): Promise<{ cooldownRestante: number }> {
        const key = email.toLowerCase();
        const entry = verificationStore.get(key);
        const ahora = Date.now();

        if (entry && ahora < entry.cooldown) {
            const restante = Math.ceil((entry.cooldown - ahora) / 1000);
            throw { status: 429, message: `Espera ${restante} segundos para reenviar.`, cooldownRestante: restante };
        }

        await this.enviarCodigo(email);
        return { cooldownRestante: 60 };
    }
}
