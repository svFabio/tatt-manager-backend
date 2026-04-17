import { Router } from 'express';
import {
  getSolicitudes,
  getSolicitudById,
  cotizarSolicitud,
  rechazarSolicitud,
} from '../controllers/solicitudes.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
router.use(verificarToken, tenantMiddleware);
router.get('/', getSolicitudes);
router.get('/:id', getSolicitudById);
router.patch('/:id/cotizar', cotizarSolicitud);
router.patch('/:id/rechazar', rechazarSolicitud);
export default router;
