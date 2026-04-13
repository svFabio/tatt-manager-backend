import { Router } from 'express';
import { crearPago, getPagos } from '../controllers/pagos.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
router.use(verificarToken, tenantMiddleware);
router.post('/', crearPago);
router.get('/', getPagos);
export default router;
