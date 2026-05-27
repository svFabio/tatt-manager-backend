import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_super_seguro_123';

/**
 * Middleware que verifica el JWT y extrae la identidad del usuario.
 * Solo valida autenticación (quién eres), NO autorización de estudio.
 */
export const verificarToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as {
            id: number;
            email: string;
            negocioId?: number;
            rol?: string;
        };
        req.usuario = { id: decoded.id, email: decoded.email };

        // Retrocompatibilidad: si el token contextual incluye estudio
        if (decoded.negocioId && decoded.rol) {
            req.estudioActivo = {
                negocioId: decoded.negocioId,
                rol: decoded.rol,
                miembroId: 0, // se resuelve en studioContext
            };
            req.negocioId = decoded.negocioId;
        }

        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};