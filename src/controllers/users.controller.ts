import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

export const getAllUsers = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const miembros = await prisma.miembroEstudio.findMany({
            where: { negocioId },
            include: {
                usuario: { select: { id: true, nombre: true, email: true, creadoEn: true } }
            },
            orderBy: { unidoEn: 'desc' }
        });
        
        const usuariosFormateados = miembros.map(m => ({
            id: m.usuario.id,
            nombre: m.usuario.nombre,
            email: m.usuario.email,
            rol: m.rol,
            creadoEn: m.usuario.creadoEn,
            unidoEn: m.unidoEn
        }));
        
        res.json(usuariosFormateados);
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
        
        let usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario) {
            const hashedPassword = await bcrypt.hash(password, 10);
            usuario = await prisma.usuario.create({
                data: { nombre, email, password: hashedPassword }
            });
        }
        
        const miembroExistente = await prisma.miembroEstudio.findUnique({
            where: { usuarioId_negocioId: { usuarioId: usuario.id, negocioId } }
        });
        
        if (miembroExistente) {
             return res.status(409).json({ error: 'El usuario ya es miembro de este estudio' });
        }

        const nuevoMiembro = await prisma.miembroEstudio.create({
            data: { usuarioId: usuario.id, negocioId, rol: rol || 'ARTISTA' },
            include: { usuario: { select: { id: true, nombre: true, email: true, creadoEn: true } } }
        });
        
        res.status(201).json({
            id: nuevoMiembro.usuario.id,
            nombre: nuevoMiembro.usuario.nombre,
            email: nuevoMiembro.usuario.email,
            rol: nuevoMiembro.rol,
            creadoEn: nuevoMiembro.usuario.creadoEn
        });
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
        const userId = parseInt(id);
        
        const miembro = await prisma.miembroEstudio.findUnique({ 
            where: { usuarioId_negocioId: { usuarioId: userId, negocioId } },
            include: { usuario: true }
        });
        
        if (!miembro) return res.status(404).json({ error: 'Usuario no encontrado en este estudio' });
        
        const updateData: { nombre?: string; email?: string; password?: string } = {};
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        if (password) updateData.password = await bcrypt.hash(password, 10);
        
        if (Object.keys(updateData).length > 0) {
            await prisma.usuario.update({
                where: { id: userId },
                data: updateData
            });
        }
        
        if (rol) {
            if (!['ADMIN', 'ARTISTA'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
            await prisma.miembroEstudio.update({
                where: { id: miembro.id },
                data: { rol }
            });
        }
        
        const miembroActualizado = await prisma.miembroEstudio.findUnique({
            where: { id: miembro.id },
            include: { usuario: { select: { id: true, nombre: true, email: true, creadoEn: true } } }
        });
        
        res.json({
            id: miembroActualizado!.usuario.id,
            nombre: miembroActualizado!.usuario.nombre,
            email: miembroActualizado!.usuario.email,
            rol: miembroActualizado!.rol,
            creadoEn: miembroActualizado!.usuario.creadoEn
        });
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const { id } = req.params;
        const userId = parseInt(id);
        
        if (req.usuario?.id === userId) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario del estudio' });
        }
        
        const miembro = await prisma.miembroEstudio.findUnique({ 
            where: { usuarioId_negocioId: { usuarioId: userId, negocioId } } 
        });
        
        if (!miembro) return res.status(404).json({ error: 'Usuario no encontrado en este estudio' });
        
        await prisma.miembroEstudio.delete({ where: { id: miembro.id } });
        res.json({ message: 'Usuario removido del estudio correctamente' });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
};