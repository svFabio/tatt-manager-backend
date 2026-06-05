import { Router } from 'express';
import {
    enviarCodigo,
    verificarCodigo,
    reenviarCodigo,
} from '../controllers/recovery.controller';

const router = Router();

// Todas las rutas son públicas (sin token)
router.post('/send-code', enviarCodigo);
router.post('/verify', verificarCodigo);
router.post('/resend', reenviarCodigo);

export default router;
