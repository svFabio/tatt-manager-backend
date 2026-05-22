import { Router } from 'express';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { requireAdmin } from '../middleware/permissions.middleware';
import { getInvitationCode, regenerateInvitationCode } from '../controllers/negocio.controller';

const router = Router();
router.use(verificarToken, tenantMiddleware, requireAdmin);
router.get('/invitation-code', getInvitationCode);
router.post('/invitation-code/regenerate', regenerateInvitationCode);

export default router;
