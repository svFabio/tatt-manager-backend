import { Request, Response } from 'express';
import { CitasService } from '../services/citas.service';

export const getPendientes = async (req: Request, res: Response) => {
  try {
    const citas = await CitasService.getPendientes(req.negocioId!);
    res.json(citas);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error obteniendo citas' });
  }
};

export const validarCita = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accion } = req.body;
    const citaActualizada = await CitasService.validarCita(parseInt(id), accion, req.negocioId!);
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json(citaActualizada);
  } catch (error: any) {
    console.error("Error validando cita:", error);
    res.status(500).json({ error: 'No se pudo procesar la validación' });
  }
};

export const getAgenda = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = req.query;
    const citas = await CitasService.getAgenda(req.negocioId!, desde as string, hasta as string);
    res.json(citas);
  } catch {
    res.status(500).json({ error: 'Error al cargar la agenda' });
  }
};

export const getResumen = async (req: Request, res: Response) => {
  try {
    const resumen = await CitasService.getResumen(req.negocioId!);
    res.json(resumen);
  } catch (error) {
    console.error("Error en resumen:", error);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
};

export const getHorariosDisponibles = async (req: Request, res: Response) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    const horarios = await CitasService.getHorariosDisponibles(req.negocioId!, fecha as string);
    res.json({ horarios, fecha });
  } catch (error) {
    console.error("Error obteniendo horarios:", error);
    res.status(500).json({ error: 'Error al obtener horarios disponibles' });
  }
};

export const crearCitaAdmin = async (req: Request, res: Response) => {
  try {
    const { clienteNombre, clienteTelefono, fecha, horario } = req.body;
    if (!clienteNombre || !clienteTelefono || !fecha || !horario) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    if (clienteNombre.trim().length < 3) return res.status(400).json({ error: 'Nombre muy corto.' });

    const nuevaCita = await CitasService.crearCitaAdmin(req.negocioId!, req.body);
    const io = req.app.get('io');
    if (io) {
      io.emit('cambio-citas');
      io.emit('nueva-cita', { id: nuevaCita.id, clienteNombre: nuevaCita.clienteNombre, clienteTelefono: nuevaCita.clienteTelefono, fecha: nuevaCita.fecha, horario: nuevaCita.horario });
    }
    res.status(201).json(nuevaCita);
  } catch (error: any) {
    console.error("Error creando cita admin:", error);
    res.status(error.status || 500).json({ error: error.message || 'Error al crear la cita' });
  }
};

export const reprogramarCita = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha, horario } = req.body;
    if (!fecha || !horario) return res.status(400).json({ error: 'Fecha y horario son requeridos' });
    
    const citaActualizada = await CitasService.reprogramarCita(parseInt(id), req.negocioId!, fecha, horario);
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json(citaActualizada);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Error al reprogramar la cita' });
  }
};

export const marcarNoAsistio = async (req: Request, res: Response) => {
  try {
    const citaActualizada = await CitasService.cambiarEstadoLegacy(parseInt(req.params.id), req.negocioId!, 'NO_ASISTIO', true);
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json(citaActualizada);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Error al actualizar la cita' });
  }
};

export const marcarAsistio = async (req: Request, res: Response) => {
  try {
    const citaActualizada = await CitasService.cambiarEstadoLegacy(parseInt(req.params.id), req.negocioId!, 'CONFIRMADA');
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json(citaActualizada);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Error al actualizar la cita' });
  }
};

export const actualizarDescripcion = async (req: Request, res: Response) => {
  try {
    const citaActualizada = await CitasService.actualizarDescripcion(parseInt(req.params.id), req.negocioId!, req.body.descripcion);
    res.json(citaActualizada);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar descripción' });
  }
};

export const crearCitaTatuaje = async (req: Request, res: Response) => {
  try {
    const { fechaHoraInicio, artistaId, clienteId } = req.body;
    if (!fechaHoraInicio || !artistaId || !clienteId) {
      return res.status(400).json({ data: null, error: 'fechaHoraInicio, artistaId y clienteId requeridos' });
    }
    
    const nuevaCita = await CitasService.crearCitaTatuaje(req.negocioId!, req.body);
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    
    res.status(201).json({ data: nuevaCita, error: null });
  } catch (error: any) {
    console.error('Error creando cita de tatuaje:', error);
    res.status(error.status || 500).json({ data: null, error: error.message || 'Error al crear la cita' });
  }
};

export const getDisponibilidad = async (req: Request, res: Response) => {
  try {
    const { artistaId, fecha, duracionEnHoras } = req.query;
    if (!artistaId || !fecha || !duracionEnHoras) {
      return res.status(400).json({ data: null, error: 'artistaId, fecha y duracionEnHoras necesarios' });
    }
    const duracion = parseFloat(duracionEnHoras as string);
    if (duracion <= 0) return res.status(400).json({ data: null, error: 'duracionEnHoras debe ser > 0' });

    const slots = await CitasService.getDisponibilidad(req.negocioId!, parseInt(artistaId as string), fecha as string, duracion);
    res.json({ data: { fecha, artistaId: parseInt(artistaId as string), duracionEnHoras: duracion, slots }, error: null });
  } catch (error: any) {
    console.error('Error obteniendo disponibilidad:', error);
    res.status(500).json({ data: null, error: 'Error al obtener disponibilidad' });
  }
};

export const confirmarCita = async (req: Request, res: Response) => {
  try {
    const citaActualizada = await CitasService.cambiarEstadoNuevo(parseInt(req.params.id), req.negocioId!, 'CONFIRMADA');
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json({ data: citaActualizada, error: null });
  } catch (error: any) {
    console.error('Error confirmando cita:', error);
    res.status(error.status || 500).json({ data: null, error: error.message || 'Error al confirmar cita' });
  }
};

export const cancelarCita = async (req: Request, res: Response) => {
  try {
    const citaActualizada = await CitasService.cambiarEstadoNuevo(parseInt(req.params.id), req.negocioId!, 'CANCELADA');
    const io = req.app.get('io');
    if (io) io.emit('cambio-citas');
    res.json({ data: citaActualizada, error: null });
  } catch (error: any) {
    console.error('Error cancelando cita:', error);
    res.status(error.status || 500).json({ data: null, error: error.message || 'Error al cancelar cita' });
  }
};