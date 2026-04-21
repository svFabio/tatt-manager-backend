import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
export const validate = (schema: z.ZodType) =>
    (req: Request, res: Response, next: NextFunction) => {
        try {
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    data: null,
                    error: 'Datos inválidos',
                    detalles: error.issues.map((e) => ({
                        campo: e.path.join('.').replace('body.', '').replace('query.', '').replace('params.', ''),
                        mensaje: e.message,
                    })),
                });
            }
            return res.status(500).json({ data: null, error: 'Error interno de validación' });
        }
    };
