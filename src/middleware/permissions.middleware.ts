import { Request, Response, NextFunction } from 'express';

/**
 * Middleware que verifica que el rol del usuario en el estudio activo es ADMIN.
 * Debe ejecutarse DESPUÉS de verificarToken y tenantMiddleware.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const rol = req.estudioActivo?.rol;
    if (rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
};

/**
 * Factory: crea un middleware que verifica que el usuario tenga uno de los roles indicados.
 */
export const requireRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const rol = req.estudioActivo?.rol;
        if (!rol || !roles.includes(rol)) {
            return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.` });
        }
        next();
    };
};