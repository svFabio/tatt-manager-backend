import { Router } from 'express';
import {
    getPendientes,
    validarCita,
    getAgenda,
    getResumen,
    getHorariosDisponibles,
    crearCitaAdmin,
    reprogramarCita,
    marcarNoAsistio,
    marcarAsistio,
    actualizarDescripcion,
    crearCitaTatuaje,
    getDisponibilidad,
    confirmarCita,
    cancelarCita
} from '../controllers/citas.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
const router = Router();
router.use(verificarToken, tenantMiddleware);
router.get('/', getAgenda);
router.get('/pendientes', getPendientes);
router.get('/resumen', getResumen);
router.get('/horarios-disponibles', getHorariosDisponibles);
router.post('/admin', crearCitaAdmin);
router.post('/:id/validar', validarCita);
router.put('/:id/reprogramar', reprogramarCita);
router.put('/:id/no-asistio', marcarNoAsistio);
router.put('/:id/asistio', marcarAsistio);
router.put('/:id/descripcion', actualizarDescripcion);
router.get('/disponibilidad', getDisponibilidad);
router.post('/nueva', crearCitaTatuaje);
router.patch('/:id/confirmar', confirmarCita);
router.patch('/:id/cancelar', cancelarCita);
export default router;