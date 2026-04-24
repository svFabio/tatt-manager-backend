import { Router, Request, Response, NextFunction } from 'express';
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
import {
    listarSolicitudes,
    listarCitasPorEstado,
    obtenerDetalleCita
} from '../controllers/listarCitas.controller';

const router = Router();

// TODO AUTH: reemplazar por `verificarToken, tenantMiddleware` cuando se implemente la autenticación.
const devBypassMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const negocioIdQuery = req.query.negocioId;
    req.negocioId = negocioIdQuery ? parseInt(negocioIdQuery as string, 10) : 1;
    next();
};
router.use(devBypassMiddleware);

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

router.get('/solicitudes', listarSolicitudes);
router.get('/por-estado', listarCitasPorEstado);
router.get('/:id/detalle', obtenerDetalleCita);

export default router;
