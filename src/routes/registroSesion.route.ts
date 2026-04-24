import { Router } from 'express';
import {
  crearRegistroSesion,
  getRegistrosSesion,
  getRegistroSesionById,
  reportarRegistroSesion,
} from '../controllers/registroSesion.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
router.use(verificarToken, tenantMiddleware);
router.post('/', crearRegistroSesion);
router.get('/', getRegistrosSesion);
router.get('/:id', getRegistroSesionById);
router.patch('/:id/reportar', reportarRegistroSesion);
export default router;
