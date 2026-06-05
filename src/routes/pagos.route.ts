import { Router } from 'express';
import { crearPago, getPagos, getPagosPendientesValidacion, confirmarPago, rechazarPago } from '../controllers/pagos.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';

const router = Router();
router.use(verificarToken, tenantMiddleware);

router.get('/pendientes', getPagosPendientesValidacion);  // ⚠️ Antes del /:id para evitar conflictos de rutas
router.post('/', crearPago);
router.get('/', getPagos);
router.patch('/:id/confirmar', confirmarPago);
router.patch('/:id/rechazar', rechazarPago);

export default router;
