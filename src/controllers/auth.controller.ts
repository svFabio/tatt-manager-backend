import { Request, Response } from 'express';
import { AuthService, mobileTokenStore } from '../services/auth.service';
import { VerificationService } from '../services/verificationService';

const asError = (e: unknown): { status?: number; message?: string } =>
    e instanceof Error ? e : (e as { status?: number; message?: string });

/* ── Registro con email (Requiere código de verificación) ── */
export const registrarConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password, nombre, codigo } = req.body;
        if (!email || !password || !nombre || !codigo) {
            return res.status(400).json({ error: 'Todos los campos son requeridos, incluyendo el código' });
        }
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

        // Verificamos y consumimos el código antes de registrar
        VerificationService.consumirCodigo(email, codigo);

        const data = await AuthService.registrarConEmail(email, password, nombre);
        res.status(201).json(data);
    } catch (error: unknown) {
        console.error('[Auth] Error en registrarConEmail:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al registrar la cuenta' });
    }
};

/* ── Enviar código de verificación (Registro) ── */
export const enviarCodigoRegistro = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'El email es requerido' });

        await VerificationService.enviarCodigo(email);
        res.json({ message: 'Código enviado exitosamente' });
    } catch (error: unknown) {
        console.error('[Auth] Error en enviarCodigoRegistro:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al enviar código' });
    }
};

/* ── Verificar código temporal (Registro) ── */
export const verificarCodigoRegistro = async (req: Request, res: Response) => {
    try {
        const { email, codigo } = req.body;
        if (!email || !codigo) return res.status(400).json({ error: 'Email y código son requeridos' });

        const valido = await VerificationService.verificarCodigo(email, codigo);
        res.json({ message: 'Código verificado exitosamente', valido });
    } catch (error: unknown) {
        console.error('[Auth] Error en verificarCodigoRegistro:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al verificar código' });
    }
};

/* ── Login con email ──────────────────────────────────────────────── */
export const loginConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

        const data = await AuthService.loginConEmail(email, password);
        res.json(data);
    } catch (error: unknown) {
        console.error('[Auth] Error en loginConEmail:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al iniciar sesión' });
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
    } catch (error: unknown) {
        console.error('[Auth] Error en loginConGoogle:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al iniciar sesión con Google' });
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
    } catch (error: unknown) {
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al obtener usuario' });
    }
};

/* ── Listar estudios del usuario ──────────────────────────────────── */
export const misEstudios = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const estudios = await AuthService.getEstudiosUsuario(userId);
        res.json(estudios);
    } catch (error: unknown) {
        console.error('[Auth] Error en misEstudios:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al obtener estudios' });
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
    } catch (error: unknown) {
        console.error('[Auth] Error en seleccionarEstudio:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al seleccionar estudio' });
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
    } catch (error: unknown) {
        console.error('[Auth] Error en crearEstudio:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al crear estudio' });
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
    } catch (error: unknown) {
        console.error('[Auth] Error en unirseAEstudio:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al unirse al estudio' });
    }
};

/* ── Google Mobile OAuth (Native via idToken) ─────────────────── */
export const googleNativeLogin = async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'idToken es requerido' });

        const result = await AuthService.handleNativeGoogleLogin(idToken);
        res.json(result);
    } catch (error: unknown) {
        console.error('[Auth] Error en googleNativeLogin:', error);
        const e = asError(error);
        res.status(e.status || 500).json({ error: e.message || 'Error al autenticar con Google' });
    }
};

/* ── Google Mobile OAuth (Redirect Web Browser) ─────────────────── */
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

    const baseStyles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Inter', -apple-system, sans-serif;
                background: #0A0A0A;
                color: #FFFFFF;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
            }
            .card {
                background: #1E1E1E;
                border: 1px solid rgba(255,255,255,0.04);
                border-radius: 24px;
                padding: 48px 32px;
                max-width: 380px;
                width: 100%;
                text-align: center;
            }
            .icon-box {
                width: 72px; height: 72px;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
                font-size: 32px;
            }
            .icon-success { background: rgba(34, 197, 94, 0.15); }
            .icon-error { background: rgba(239, 68, 68, 0.15); }
            h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
            .text-success { color: #22C55E; }
            .text-error { color: #EF4444; }
            p { color: #6B7280; font-size: 14px; line-height: 1.5; margin-top: 8px; }
            .hint {
                margin-top: 24px;
                padding: 12px 16px;
                background: rgba(67, 56, 202, 0.08);
                border: 1px solid rgba(67, 56, 202, 0.15);
                border-radius: 12px;
                color: #9CA3AF;
                font-size: 13px;
            }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            .card { animation: fadeIn 0.4s ease-out; }
        </style>`;

    const htmlError = (msg: string) => res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1">${baseStyles}</head>
        <body>
            <div class="card">
                <div class="icon-box icon-error">✕</div>
                <h2 class="text-error">Error</h2>
                <p>${msg}</p>
                <div class="hint">Cierra esta ventana y vuelve a intentarlo desde la app.</div>
            </div>
        </body></html>`);

    if (error || !code) return htmlError('Login cancelado');
    try {
        const { usuario } = await AuthService.handleGoogleMobileCallback(code as string, state as string);
        return res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1">${baseStyles}</head>
            <body>
                <div class="card">
                    <div class="icon-box icon-success">✓</div>
                    <h2 class="text-success">¡Login exitoso!</h2>
                    <p>Hola, <strong style="color:#fff">${usuario.nombre}</strong>. Tu sesión está lista.</p>
                    <div class="hint">Ya puedes cerrar esta ventana y regresar a la app.</div>
                </div>
            </body></html>`);
    } catch (err: unknown) {
        const e = asError(err);
        console.error('[Auth] Error en googleMobileCallback:', err);
        return htmlError(e.message || 'Error del servidor');
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
    
    // Devolver en el mismo formato que el login estándar para que el frontend no falle
    return res.json({ 
        status: 'ready', 
        token: entry.data.token,
        usuario: {
            id: entry.data.userId,
            nombre: entry.data.userName,
            email: entry.data.userEmail
        }
    });
};
