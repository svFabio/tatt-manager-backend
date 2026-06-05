import { Router } from 'express';
import {
    loginConGoogle,
    loginConEmail,
    registrarConEmail,
    enviarCodigoRegistro,
    verificarCodigoRegistro,
    me,
    misEstudios,
    seleccionarEstudio,
    crearEstudio,
    unirseAEstudio,
    googleMobileStart,
    googleMobileCallback,
    mobileTokenPoll,
    googleNativeLogin,
} from '../controllers/auth.controller';
import { verificarToken } from '../middleware/auth.middleware';

const router = Router();

// ── Rutas públicas (sin token) ──
router.post('/google', loginConGoogle);
router.post('/register/send-code', enviarCodigoRegistro);
router.post('/register/verify-code', verificarCodigoRegistro);
router.post('/register', registrarConEmail);
router.post('/login', loginConEmail);

// ── Google Mobile OAuth ──
router.post('/google-native', googleNativeLogin);
router.get('/google-mobile', googleMobileStart);
router.get('/mobile-callback', googleMobileCallback);
router.get('/mobile-token', mobileTokenPoll);

// ── Rutas autenticadas (token básico, sin estudio) ──
router.get('/me', verificarToken, me);
router.get('/estudios', verificarToken, misEstudios);
router.post('/estudios/crear', verificarToken, crearEstudio);
router.post('/estudios/unirse', verificarToken, unirseAEstudio);
router.post('/estudios/seleccionar/:negocioId', verificarToken, seleccionarEstudio);

export default router;