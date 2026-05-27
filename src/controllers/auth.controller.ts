import { Request, Response } from 'express';
import { AuthService, mobileTokenStore } from '../services/auth.service';

/* ── Registro con email ───────────────────────────────────────────── */
export const registrarConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password, nombre } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

        const data = await AuthService.registrarConEmail(email, password, nombre);
        res.status(201).json(data);
    } catch (error: any) {
        console.error('[Auth] Error en registrarConEmail:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al registrar la cuenta' });
    }
};

/* ── Login con email ──────────────────────────────────────────────── */
export const loginConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

        const data = await AuthService.loginConEmail(email, password);
        res.json(data);
    } catch (error: any) {
        console.error('[Auth] Error en loginConEmail:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al iniciar sesión' });
    }
};

/* ── Login con Google ─────────────────────────────────────────────── */
export const loginConGoogle = async (req: Request, res: Response) => {
    try {
        const { googleToken, userInfo } = req.body;
        if (!googleToken) {
            return res.status(400).json({ error: 'Token de Google requerido' });
        }
        const authData = await AuthService.handleGoogleLogin(googleToken, userInfo);
        res.json(authData);
    } catch (error: any) {
        console.error('[Auth] Error en loginConGoogle:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al iniciar sesión con Google' });
    }
};

/* ── /me ──────────────────────────────────────────────────────────── */
export const me = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        if (!userId) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        const meData = await AuthService.getMe(userId);
        res.json(meData);
    } catch (error: any) {
        res.status(error.status || 500).json({ error: error.message || 'Error al obtener usuario' });
    }
};

/* ── Listar estudios del usuario ──────────────────────────────────── */
export const misEstudios = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const estudios = await AuthService.getEstudiosUsuario(userId);
        res.json(estudios);
    } catch (error: any) {
        console.error('[Auth] Error en misEstudios:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al obtener estudios' });
    }
};

/* ── Seleccionar estudio ──────────────────────────────────────────── */
export const seleccionarEstudio = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        const negocioId = parseInt(req.params.negocioId);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (isNaN(negocioId)) return res.status(400).json({ error: 'ID de estudio inválido' });

        const data = await AuthService.seleccionarEstudio(userId, negocioId);
        res.json(data);
    } catch (error: any) {
        console.error('[Auth] Error en seleccionarEstudio:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al seleccionar estudio' });
    }
};

/* ── Crear estudio ────────────────────────────────────────────────── */
export const crearEstudio = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        const { nombre } = req.body;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!nombre) return res.status(400).json({ error: 'El nombre del estudio es requerido' });

        const estudio = await AuthService.crearEstudio(userId, nombre);
        res.status(201).json(estudio);
    } catch (error: any) {
        console.error('[Auth] Error en crearEstudio:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al crear estudio' });
    }
};

/* ── Unirse a estudio ─────────────────────────────────────────────── */
export const unirseAEstudio = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        const { codigo } = req.body;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!codigo) return res.status(400).json({ error: 'El código de invitación es requerido' });

        const estudio = await AuthService.unirseAEstudio(userId, codigo);
        res.json(estudio);
    } catch (error: any) {
        console.error('[Auth] Error en unirseAEstudio:', error);
        res.status(error.status || 500).json({ error: error.message || 'Error al unirse al estudio' });
    }
};

/* ── Google Mobile OAuth ──────────────────────────────────────────── */
export const googleMobileStart = (req: Request, res: Response) => {
    const { session } = req.query;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const backendUrl = process.env.BACKEND_URL;

    if (!backendUrl) {
        return res.status(500).json({ error: 'Variable de entorno BACKEND_URL no está configurada (Requerido para OAuth)' });
    }

    const redirectUri = `${backendUrl}/api/auth/mobile-callback`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId!);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('prompt', 'select_account');
    if (session) googleAuthUrl.searchParams.set('state', session as string);
    res.redirect(googleAuthUrl.toString());
};

export const googleMobileCallback = async (req: Request, res: Response) => {
    const { code, error, state } = req.query;
    const htmlError = (msg: string) => res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f1f5f9">
        <h2 style="color:#ef4444">Error: ${msg}</h2>
        <p>Cierra esta ventana y vuelve a intentarlo.</p>
        </body></html>`);

    if (error || !code) return htmlError('Login cancelado');
    try {
        const { usuario } = await AuthService.handleGoogleMobileCallback(code as string, state as string);
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#1e293b;color:white">
            <div style="max-width:400px;margin:0 auto">
            <div style="width:64px;height:64px;background:#6366f1;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;font-weight:800">TM</div>
            <h2 style="color:#22c55e;margin-bottom:8px">Login exitoso</h2>
            <p style="color:#94a3b8">Hola, ${usuario.nombre}. Puedes cerrar esta ventana y regresar a la app.</p>
            </div></body></html>`);
    } catch (err: any) {
        console.error('[Auth] Error en googleMobileCallback:', err);
        return htmlError(err.message || 'Error del servidor');
    }
};

export const mobileTokenPoll = (req: Request, res: Response) => {
    const { session } = req.query;
    if (!session) return res.status(400).json({ error: 'session requerido' });
    const entry = mobileTokenStore.get(session as string);
    if (!entry) return res.json({ status: 'pending' });
    if (Date.now() > entry.expiry) {
        mobileTokenStore.delete(session as string);
        return res.json({ status: 'expired' });
    }
    mobileTokenStore.delete(session as string);
    return res.json({ status: 'ready', ...entry.data });
};
