import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

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

export const createUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { nombre, email, password, rol } = req.body;
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }
        if (rol && !['ADMIN', 'ARTISTA'].includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido. Debe ser ADMIN o ARTISTA' });
        }
        const existente = await prisma.usuario.findUnique({ where: { email } });
        if (existente) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const nuevoUsuario = await prisma.usuario.create({
            data: { negocioId, nombre, email, password: hashedPassword, rol: rol || 'ARTISTA' },
            select: { id: true, nombre: true, email: true, rol: true, creadoEn: true }
        });
        res.status(201).json(nuevoUsuario);
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { id } = req.params;
        const { nombre, email, password, rol } = req.body;
        const usuario = await prisma.usuario.findFirst({ where: { id: parseInt(id), negocioId } });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        const updateData: { nombre?: string; email?: string; password?: string; rol?: 'ADMIN' | 'ARTISTA' } = {};
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        if (password) updateData.password = await bcrypt.hash(password, 10);
        if (rol) {
            if (!['ADMIN', 'ARTISTA'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
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

export const deleteUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { id } = req.params;
        if (req.usuario?.id === parseInt(id)) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
        }
        const usuario = await prisma.usuario.findFirst({ where: { id: parseInt(id), negocioId } });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        await prisma.usuario.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
};