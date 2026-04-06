import { Router } from 'express';
import { getConfiguracion, updateConfiguracion } from '../controllers/configuracion.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { requireAdmin } from '../middleware/permissions.middleware';

const router = Router();

router.use(verificarToken, tenantMiddleware);

router.get('/', getConfiguracion);
router.patch('/', requireAdmin, updateConfiguracion);

export default router;
