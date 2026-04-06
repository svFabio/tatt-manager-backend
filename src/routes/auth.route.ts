import { Router } from 'express';
import { loginConGoogle, loginConEmail, registrarConEmail, me, googleMobileStart, googleMobileCallback, mobileTokenPoll } from '../controllers/auth.controller';
import { verificarToken } from '../middleware/auth.middleware';

const router = Router();

// Google OAuth (register + login en un solo paso)
router.post('/google', loginConGoogle);

// Email / contraseña
router.post('/register', registrarConEmail);
router.post('/login', loginConEmail);

// Info del usuario autenticado
router.get('/me', verificarToken, me);

// Google OAuth nativo para app móvil (via backend + polling)
router.get('/google-mobile', googleMobileStart);
router.get('/mobile-callback', googleMobileCallback);
router.get('/mobile-token', mobileTokenPoll);

export default router;
