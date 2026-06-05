import { Router } from 'express';
import { getConfiguracion, updateConfiguracion, actualizarQr, eliminarQr } from '../controllers/configuracion.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { requireAdmin } from '../middleware/permissions.middleware';
import { uploadFoto } from '../middleware/upload.middleware';

const router = Router();

router.use(verificarToken, tenantMiddleware);

router.get('/', getConfiguracion);
router.patch('/', requireAdmin, updateConfiguracion);
router.patch('/qr', requireAdmin, uploadFoto, actualizarQr);   // subir/reemplazar QR
router.delete('/qr', requireAdmin, eliminarQr);                // eliminar QR

export default router;
