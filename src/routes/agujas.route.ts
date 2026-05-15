import { Router } from 'express';
import { getAgujas } from '../controllers/agujas.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';

const router = Router();
router.use(verificarToken, tenantMiddleware);
router.get('/', getAgujas);

export default router;
