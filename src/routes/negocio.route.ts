import { Router } from 'express';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { requireAdmin } from '../middleware/permissions.middleware';
import { getInvitationCode, regenerateInvitationCode, actualizarNombre } from '../controllers/negocio.controller';

const router = Router();
router.use(verificarToken, tenantMiddleware, requireAdmin);
router.patch('/nombre', actualizarNombre);
router.get('/invitation-code', getInvitationCode);
router.post('/invitation-code/regenerate', regenerateInvitationCode);

export default router;
