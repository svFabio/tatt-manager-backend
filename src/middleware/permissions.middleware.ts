import { Request, Response, NextFunction } from 'express';

/**
 * Middleware simple de rol — requiere que req.usuario ya esté poblado
 * por verificarToken. Se usa DESPUÉS de verificarToken y tenantMiddleware.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.usuario?.rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
};
