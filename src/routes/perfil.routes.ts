import { Router } from 'express';
import { obtenerPerfil, actualizarPerfil } from '../controllers/perfil.controller';
import { verificarToken } from '../middleware/auth.middleware'; // 👈 Nombre corregido aquí

const router = Router();

// Endpoint: GET /api/perfil
router.get('/', verificarToken, obtenerPerfil);

// Endpoint: PUT /api/perfil
router.put('/', verificarToken, actualizarPerfil);

export default router;