import "express";

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        email: string;
        rol: string;
        negocioId: number;
      };
      negocioId?: number;
    }
  }
}
