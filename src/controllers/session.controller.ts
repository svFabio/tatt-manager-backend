import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Crear nueva sesión manual (HU-06)
export const createSession = async (req: Request, res: Response) => {
  try {
    const { nombre, telefono, zona, horas, fecha, horario, cotizacion, negocioId } = req.body;

    console.log('📝 Creando sesión:', { nombre, telefono, zona, horas, fecha, horario, cotizacion });

    // Validar campos obligatorios
    if (!nombre || !telefono || !zona || !horas || !fecha || !horario || !cotizacion) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Validar números positivos
    if (horas <= 0) {
      return res.status(400).json({ error: 'Las horas deben ser mayores a 0' });
    }

    if (cotizacion <= 0) {
      return res.status(400).json({ error: 'La cotización debe ser mayor a 0' });
    }

    // Formatear fecha correctamente (sin problema de zona horaria)
    let fechaObj: Date;
    if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = fecha.split('-').map(Number);
      fechaObj = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      fechaObj = new Date(fecha);
    }

    // CRITERIO 4: Verificar si ya existe una cita en la misma fecha y horario
    const fechaInicio = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate(), 0, 0, 0);
    const fechaFin = new Date(fechaObj.getFullYear(), fechaObj.getMonth(), fechaObj.getDate() + 1, 0, 0, 0);

    const existingCita = await prisma.cita.findFirst({
      where: {
        negocioId: negocioId || 1,
        fecha: {
          gte: fechaInicio,
          lt: fechaFin
        },
        horario: horario
      }
    });

    if (existingCita) {
      console.log(`⚠️ Horario ocupado: ${horario} el día ${fecha}`);
      return res.status(409).json({ 
        error: `❌ El horario de las ${horario} ya está ocupado para esta fecha. Por favor, elige otro horario.`,
        conflicto: true,
        horarioOcupado: horario,
        fechaOcupada: fecha
      });
    }

    // Crear nueva cita
    const nuevaCita = await prisma.cita.create({
      data: {
        clienteNombre: nombre,
        clienteTelefono: telefono,
        servicio: zona,
        monto: cotizacion,
        fecha: fechaObj,
        horario: horario,
        descripcion: `Duración: ${horas} hora(s)`,
        origen: 'manual',
        estado: 'CONFIRMADA',
        negocioId: negocioId || 1
      }
    });

    console.log('✅ Sesión creada:', nuevaCita.id);

    // CRITERIO 5: Mensaje de éxito visible
    res.status(201).json({
      success: true,
      message: '✅ ¡Sesión registrada exitosamente! La cita ha sido agendada.',
      session: {
        id: nuevaCita.id,
        nombre: nuevaCita.clienteNombre,
        telefono: nuevaCita.clienteTelefono,
        zona: nuevaCita.servicio,
        horas: horas,
        fecha: nuevaCita.fecha,
        horario: nuevaCita.horario,
        cotizacion: nuevaCita.monto
      }
    });

  } catch (error: any) {
    console.error('❌ Error createSession:', error);
    res.status(500).json({ error: 'Error al registrar la sesión: ' + error.message });
  }
};

// Obtener todas las sesiones
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    const { negocioId } = req.query;
    
    const citas = await prisma.cita.findMany({
      where: {
        negocioId: negocioId ? parseInt(negocioId as string) : 1,
        origen: 'manual'
      },
      orderBy: { fecha: 'desc' }
    });

    const sessions = citas.map(cita => ({
      id: cita.id,
      nombre: cita.clienteNombre,
      telefono: cita.clienteTelefono,
      zona: cita.servicio,
      fecha: cita.fecha,
      horario: cita.horario,
      cotizacion: cita.monto,
      estado: cita.estado
    }));

    res.json(sessions);
  } catch (error: any) {
    console.error('❌ Error getAllSessions:', error);
    res.status(500).json({ error: 'Error al obtener las sesiones: ' + error.message });
  }
};

// Obtener sesiones por mes (para calendario)
export const getSessionsByMonth = async (req: Request, res: Response) => {
  try {
    const { month, year, negocioId } = req.query;
    
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    
    const citas = await prisma.cita.findMany({
      where: {
        negocioId: negocioId ? parseInt(negocioId as string) : 1,
        fecha: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { fecha: 'asc' }
    });

    res.json(citas);
  } catch (error: any) {
    console.error('❌ Error getSessionsByMonth:', error);
    res.status(500).json({ error: 'Error al obtener sesiones: ' + error.message });
  }
};

// Obtener una sesión por ID
export const getSessionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const cita = await prisma.cita.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!cita) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    
    res.json(cita);
  } catch (error: any) {
    console.error('❌ Error getSessionById:', error);
    res.status(500).json({ error: 'Error al obtener la sesión: ' + error.message });
  }
};

// Actualizar sesión
export const updateSession = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, zona, horas, fecha, horario, cotizacion, estado } = req.body;
    
    let fechaObj: Date;
    if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = fecha.split('-').map(Number);
      fechaObj = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      fechaObj = new Date(fecha);
    }
    
    const citaActualizada = await prisma.cita.update({
      where: { id: parseInt(id) },
      data: {
        clienteNombre: nombre,
        clienteTelefono: telefono,
        servicio: zona,
        monto: cotizacion,
        fecha: fechaObj,
        horario: horario,
        estado: estado || 'CONFIRMADA',
        descripcion: `Duración: ${horas} hora(s)`
      }
    });
    
    console.log('✏️ Sesión actualizada:', id);
    
    res.json({ 
      message: '✅ Sesión actualizada exitosamente', 
      session: {
        id: citaActualizada.id,
        nombre: citaActualizada.clienteNombre,
        telefono: citaActualizada.clienteTelefono,
        zona: citaActualizada.servicio,
        fecha: citaActualizada.fecha,
        horario: citaActualizada.horario,
        cotizacion: citaActualizada.monto
      }
    });
  } catch (error: any) {
    console.error('❌ Error updateSession:', error);
    res.status(500).json({ error: 'Error al actualizar: ' + error.message });
  }
};

// ELIMINAR sesión
export const deleteSession = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idNumber = parseInt(id);
    
    console.log(`🗑️ Intentando eliminar sesión con ID: ${idNumber}`);
    
    const existe = await prisma.cita.findUnique({
      where: { id: idNumber }
    });
    
    if (!existe) {
      console.log(`❌ Sesión con ID ${idNumber} no encontrada`);
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    
    await prisma.cita.delete({
      where: { id: idNumber }
    });
    
    console.log(`✅ Sesión con ID ${idNumber} eliminada exitosamente`);
    
    res.json({ 
      message: '✅ Sesión eliminada exitosamente',
      deletedId: idNumber
    });
    
  } catch (error: any) {
    console.error('❌ Error en deleteSession:', error);
    res.status(500).json({ 
      error: 'Error al eliminar la sesión: ' + error.message 
    });
  }
};