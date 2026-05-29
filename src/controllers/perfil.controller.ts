import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const obtenerPerfil = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuarioAuth = (req as any).usuario; 
    const usuarioId = usuarioAuth?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado. Token inválido o ausente.' });
      return;
    }

    // Buscamos el usuario de forma limpia
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(usuarioId) },
      // Usamos include de forma segura. Si da error de compilación, recuerda ejecutar 'npx prisma generate'
      include: {
        membresias: true 
      }
    });

    if (!usuario) {
      res.status(404).json({ error: 'Usuario no encontrado en la base de datos.' });
      return;
    }

    // Mapeamos el rol de forma segura para enviárselo estructurado al frontend
    let rolUsuario = 'ADMINISTRADOR'; // Rol por defecto si no tiene membresías
    if ((usuario as any).membresias && (usuario as any).membresias.length > 0) {
      rolUsuario = (usuario as any).membresias[0].rol;
    }

    // Enviamos una respuesta limpia, estructurada y fácil de leer para tu perfil.tsx
    res.status(200).json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: rolUsuario
    });

  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Hubo un error interno en el servidor.' });
  }
};

export const actualizarPerfil = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuarioAuth = (req as any).usuario; 
    const usuarioId = usuarioAuth?.id;
    const { nombre } = req.body;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    if (!nombre || nombre.trim() === '') {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }

    const regexAlfabetico = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!regexAlfabetico.test(nombre)) {
      res.status(400).json({ error: 'Ingrese solo caracteres alfabéticos.' });
      return;
    }

    if (nombre.length < 3 || nombre.length > 50) {
      res.status(400).json({ error: 'El nombre debe tener entre 3 y 50 caracteres.' });
      return;
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: Number(usuarioId) },
      data: { nombre: nombre.trim() },
      select: { id: true, nombre: true, email: true }
    });

    res.status(200).json({
      mensaje: 'Perfil actualizado correctamente.',
      usuario: usuarioActualizado
    });

  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Hubo un error al guardar los cambios.' });
  }
};