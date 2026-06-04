import { Request, Response } from 'express';
import { RecoveryService } from '../services/recoveryService';

const asError = (e: unknown): { status?: number; message?: string; cooldownRestante?: number } =>
    e instanceof Error ? e : (e as { status?: number; message?: string; cooldownRestante?: number });

/* ── Enviar código de recuperación ───────────────────────────────── */
export const enviarCodigo = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'El correo electrónico es requerido.' });

        // Validar formato
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'El correo ingresado no tiene un formato válido.' });
        }

        await RecoveryService.enviarCodigo(email);

        // Siempre responder éxito (no revelar si el correo existe)
        res.json({ message: 'Si el correo está registrado, recibirás un código de recuperación.' });
    } catch (error: unknown) {
        console.error('[Recovery] Error en enviarCodigo:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al enviar código.' });
    }
};

/* ── Verificar código ────────────────────────────────────────────── */
export const verificarCodigo = async (req: Request, res: Response) => {
    try {
        const { email, codigo } = req.body;
        if (!email || !codigo) return res.status(400).json({ error: 'Email y código son requeridos.' });

        const data = await RecoveryService.verificarCodigo(email, codigo);
        res.json(data);
    } catch (error: unknown) {
        console.error('[Recovery] Error en verificarCodigo:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al verificar código.' });
    }
};

/* ── Reenviar código ─────────────────────────────────────────────── */
export const reenviarCodigo = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'El correo electrónico es requerido.' });

        const result = await RecoveryService.reenviarCodigo(email);
        res.json({ message: 'Código reenviado.', ...result });
    } catch (error: unknown) {
        console.error('[Recovery] Error en reenviarCodigo:', error);
        const e = asError(error);
        res.status(e.status || 500).json({
            error: e.message || 'Error al reenviar código.',
            cooldownRestante: e.cooldownRestante,
        });
    }
};
