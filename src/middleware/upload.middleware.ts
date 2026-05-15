import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';

const multerHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  },
}).single('foto');

// Wrapper que convierte errores de multer al formato { ok, error }
export const uploadFoto = (req: Request, res: Response, next: NextFunction) => {
  multerHandler(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, error: 'La imagen no puede superar 5 MB' });
    }

    const mensaje = err instanceof Error ? err.message : 'Error al procesar la imagen';
    return res.status(400).json({ ok: false, error: mensaje });
  });
};
