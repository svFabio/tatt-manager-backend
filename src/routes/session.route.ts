import { Router } from 'express';
import {
    createSession,
    getAllSessions,
    getSessionsByMonth,
    getSessionById,
    updateSession,
    deleteSession
} from '../controllers/session.controller';

const router = Router();

// Rutas para HU-06: Registrar sesión manual
router.post('/', createSession);
router.get('/', getAllSessions);
router.get('/calendar', getSessionsByMonth);
router.get('/:id', getSessionById);
router.put('/:id', updateSession);
router.delete('/:id', deleteSession);

export default router;