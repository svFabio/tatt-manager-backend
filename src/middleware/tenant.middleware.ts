import { Request, Response, NextFunction } from 'express';

/**
 * Inyecta req.negocioId desde el token ya verificado por verificarToken.
 * Debe usarse DESPUÉS de verificarToken.
 */
export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const negocioId = req.usuario?.negocioId;
    if (!negocioId) {
        return res.status(401).json({ error: 'No se pudo identificar el negocio.' });
    }
    req.negocioId = negocioId;
    next();
};
