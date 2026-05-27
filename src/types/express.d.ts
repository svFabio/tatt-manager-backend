import "express";

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado (datos básicos del JWT) */
      usuario?: {
        id: number;
        email: string;
      };
      /** Datos del estudio activo (inyectados por studioContext middleware) */
      estudioActivo?: {
        negocioId: number;
        rol: string;
        miembroId: number;
      };
      /** Shortcut para negocioId (retrocompatibilidad) */
      negocioId?: number;
    }
  }
}
