import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * GET /api/users
 * Listar todos los usuarios del negocio autenticado (solo ADMIN)
 */
export const getAllUsers = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const usuarios = await prisma.usuario.findMany({
            where: { negocioId },
            select: { id: true, nombre: true, email: true, rol: true, creadoEn: true },
            orderBy: { creadoEn: 'desc' }
        });
        res.json(usuarios);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
};

/**
 * POST /api/users
 * Crear nuevo usuario de staff para el negocio (solo ADMIN)
 */
export const createUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { nombre, email, password, rol } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }
        if (rol && !['ADMIN', 'STAFF'].includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido. Debe ser ADMIN o STAFF' });
        }

        const existente = await prisma.usuario.findUnique({ where: { email } });
        if (existente) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const nuevoUsuario = await prisma.usuario.create({
            data: { negocioId, nombre, email, password: hashedPassword, rol: rol || 'STAFF' },
            select: { id: true, nombre: true, email: true, rol: true, creadoEn: true }
        });

        res.status(201).json(nuevoUsuario);
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
};

/**
 * PUT /api/users/:id
 * Actualizar usuario (solo ADMIN, dentro del mismo negocio)
 */
export const updateUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { id } = req.params;
        const { nombre, email, password, rol } = req.body;

        // Verificar que el usuario pertenece al negocio
        const usuario = await prisma.usuario.findFirst({ where: { id: parseInt(id), negocioId } });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const updateData: { nombre?: string; email?: string; password?: string; rol?: 'ADMIN' | 'STAFF' } = {};
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        if (password) updateData.password = await bcrypt.hash(password, 10);
        if (rol) {
            if (!['ADMIN', 'STAFF'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
            updateData.rol = rol;
        }

        const usuarioActualizado = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: updateData,
            select: { id: true, nombre: true, email: true, rol: true, creadoEn: true }
        });

        res.json(usuarioActualizado);
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
};

/**
 * DELETE /api/users/:id
 * Eliminar usuario (solo ADMIN, dentro del mismo negocio)
 */
export const deleteUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { id } = req.params;

        if (req.usuario?.id === parseInt(id)) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
        }

        // Verificar que el usuario pertenece al negocio
        const usuario = await prisma.usuario.findFirst({ where: { id: parseInt(id), negocioId } });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        await prisma.usuario.delete({ where: { id: parseInt(id) } });

        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
};
