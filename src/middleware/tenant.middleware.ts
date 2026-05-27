import { Request, Response, NextFunction } from 'express';

/**
 * Middleware que verifica que el usuario tiene un estudio activo seleccionado.
 * Debe ejecutarse DESPUÉS de verificarToken.
 * Extrae negocioId del contexto de estudio activo.
 */
export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const negocioId = req.estudioActivo?.negocioId || req.negocioId;
    if (!negocioId) {
        return res.status(401).json({ error: 'No se pudo identificar el negocio. Selecciona un estudio.' });
    }
    req.negocioId = negocioId;
    next();
};