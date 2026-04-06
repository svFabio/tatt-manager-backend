import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_super_seguro_123';

// Extender el tipo Request de Express para incluir usuario con negocioId
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            usuario?: {
                id: number;
                email: string;
                rol: string;
                negocioId: number;
            };
            negocioId?: number; // Inyectado por tenantMiddleware
        }
    }
}

export const verificarToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as {
            id: number;
            email: string;
            rol: string;
            negocioId: number;
        };
        req.usuario = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};
