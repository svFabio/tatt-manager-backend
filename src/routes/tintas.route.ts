import { Router } from 'express';
import {
  getTintas,
  crearTinta,
  editarTinta,
  eliminarTinta,
  entradaStockTinta,
  ajusteStockTinta,
} from '../controllers/tintas.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
router.use(verificarToken, tenantMiddleware);
router.get('/', getTintas);
router.post('/', crearTinta);
router.patch('/:id', editarTinta);
router.delete('/:id', eliminarTinta);
router.post('/:id/entrada-stock', entradaStockTinta);
router.post('/:id/ajuste-stock', ajusteStockTinta);
export default router;
