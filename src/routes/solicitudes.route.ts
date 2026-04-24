import { Router } from 'express';
import {
  getSolicitudes,
  getSolicitudById,
  cotizarSolicitud,
  rechazarSolicitud,
} from '../controllers/solicitudes.controller';
// import { verificarToken } from '../middleware/auth.middleware';
// import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
// router.use(verificarToken, tenantMiddleware);

// Middleware temporal para desarrollo
router.use((req, res, next) => { req.negocioId = 1; next(); });
router.get('/', getSolicitudes);
router.get('/:id', getSolicitudById);
router.patch('/:id/cotizar', cotizarSolicitud);
router.patch('/:id/rechazar', rechazarSolicitud);
export default router;
