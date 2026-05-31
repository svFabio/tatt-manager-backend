import { Router } from 'express';
import { obtenerPerfil, actualizarPerfil } from '../controllers/perfil.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { uploadFoto } from '../middleware/upload.middleware';

const router = Router();

// Endpoint: GET /api/perfil
router.get('/', verificarToken, obtenerPerfil);

// Endpoint: PUT /api/perfil
router.put('/', verificarToken, uploadFoto, actualizarPerfil);

export default router;