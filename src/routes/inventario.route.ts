import { Router } from 'express';
import { getInventario, ajusteRapido, crearInsumo, editarInsumo, eliminarInsumo } from '../controllers/inventario.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { uploadFoto } from '../middleware/upload.middleware';

const router = Router();

router.use(verificarToken, tenantMiddleware);

router.get('/', getInventario);                      // ?buscar=X — lista unificada + stats
router.post('/', uploadFoto, crearInsumo);           // multipart/form-data — crear insumo
router.patch('/ajuste-rapido', ajusteRapido);        // { tipo, refId, delta }
router.put('/editar', editarInsumo);                 // { tipo, refId, nombre, marca, cantidadMinima }
router.delete('/eliminar/:tipo/:refId', eliminarInsumo); // params

export default router;
