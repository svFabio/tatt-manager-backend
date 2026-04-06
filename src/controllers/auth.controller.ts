import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { JWT_EXPIRES_IN } from '../config';


const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET!;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/auth/google
 * Acepta dos formatos:
 *   1. { googleToken: id_token }                    — GoogleLogin component
 *   2. { googleToken: access_token, userInfo:{...} } — useGoogleLogin hook
 */
export const loginConGoogle = async (req: Request, res: Response) => {
    try {
        const { googleToken, userInfo: rawUserInfo } = req.body;

        if (!googleToken) {
            return res.status(400).json({ error: 'Token de Google requerido' });
        }

        let googleId: string;
        let email: string;
        let nombre: string;

        if (rawUserInfo?.sub) {
            // Flujo access_token: verificamos con el userinfo endpoint de Google
            const verifyRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (!verifyRes.ok) {
                return res.status(401).json({ error: 'Token de Google inválido' });
            }
            const verified = await verifyRes.json();
            googleId = verified.sub;
            email = verified.email;
            nombre = verified.name || email.split('@')[0];
        } else {
            // Flujo ID token: verificar con google-auth-library
            const ticket = await googleClient.verifyIdToken({
                idToken: googleToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            if (!payload || !payload.sub || !payload.email) {
                return res.status(401).json({ error: 'Token de Google inválido' });
            }
            googleId = payload.sub;
            email = payload.email;
            nombre = payload.name || email.split('@')[0];
        }

        // Buscar o crear el Negocio
        let negocio = await prisma.negocio.findUnique({ where: { googleId } });
        const esNuevo = !negocio;

        if (!negocio) {
            console.log(`[Auth] Nuevo negocio registrándose: ${email}`);
            negocio = await prisma.negocio.create({
                data: {
                    googleId,
                    email,
                    nombre,
                    usuarios: {
                        create: { nombre, email, googleId, rol: 'ADMIN' },
                    },
                },
            });
            console.log(`[Auth] ✅ Negocio creado con id: ${negocio.id}`);
        }

        const usuario = await prisma.usuario.findFirst({
            where: { negocioId: negocio.id, googleId },
        });

        if (!usuario) {
            return res.status(500).json({ error: 'Error recuperando el usuario del negocio' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio: { id: negocio.id, nombre: negocio.nombre, plan: negocio.plan },
            esNuevo,
        });
    } catch (error) {
        console.error('[Auth] Error en loginConGoogle:', error);
        res.status(500).json({ error: 'Error al iniciar sesión con Google' });
    }
};

/**
 * GET /api/auth/me
 * Devuelve los datos del usuario y negocio autenticado.
 */
export const me = async (req: Request, res: Response) => {
    try {
        const userId = req.usuario?.id;
        const negocioId = req.usuario?.negocioId;

        if (!userId || !negocioId) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const usuario = await prisma.usuario.findUnique({
            where: { id: userId },
            select: { id: true, nombre: true, email: true, rol: true },
        });

        const negocio = await prisma.negocio.findUnique({
            where: { id: negocioId },
            select: { id: true, nombre: true, plan: true },
        });

        if (!usuario || !negocio) {
            return res.status(404).json({ error: 'Usuario o negocio no encontrado' });
        }

        res.json({ ...usuario, negocio });
    } catch {
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
};

/**
 * POST /api/auth/register
 * Registro con email y contraseña. Crea Negocio + Usuario ADMIN.
 * El nombre del negocio se configura luego en Onboarding.
 */
export const registrarConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // Verificar que el email no exista
        const existente = await prisma.usuario.findUnique({ where: { email } });
        if (existente) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear negocio con nombre genérico + usuario ADMIN
        const negocio = await prisma.negocio.create({
            data: {
                googleId: `email-${email}`, // placeholder para campos requeridos
                email,
                nombre: 'Mi Negocio',
                usuarios: {
                    create: {
                        nombre: email.split('@')[0],
                        email,
                        password: hashedPassword,
                        rol: 'ADMIN',
                    },
                },
            },
        });

        const usuario = await prisma.usuario.findFirst({
            where: { negocioId: negocio.id, email },
        });

        if (!usuario) {
            return res.status(500).json({ error: 'Error creando el usuario' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio: { id: negocio.id, nombre: negocio.nombre, plan: negocio.plan },
            esNuevo: true,
        });
    } catch (error) {
        console.error('[Auth] Error en registrarConEmail:', error);
        res.status(500).json({ error: 'Error al registrar la cuenta' });
    }
};

/**
 * POST /api/auth/login
 * Login con email y contraseña.
 */
export const loginConEmail = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        const usuario = await prisma.usuario.findUnique({ where: { email } });

        if (!usuario || !usuario.password) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const passwordValido = await bcrypt.compare(password, usuario.password);
        if (!passwordValido) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const negocio = await prisma.negocio.findUnique({
            where: { id: usuario.negocioId },
            select: { id: true, nombre: true, plan: true },
        });

        if (!negocio) {
            return res.status(404).json({ error: 'Negocio no encontrado' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio,
            esNuevo: false,
        });
    } catch (error) {
        console.error('[Auth] Error en loginConEmail:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
};


// Almacén temporal en memoria para tokens de sesión mobile (expiran en 5 min)
const mobileTokenStore = new Map<string, { data: any; expiry: number }>();

/**
 * GET /api/auth/google-mobile?session=UUID
 * Inicia el flujo OAuth para la app móvil.
 */
export const googleMobileStart = (req: Request, res: Response) => {
    const { session } = req.query;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const backendUrl = process.env.BACKEND_URL || 'https://spa-appoint-back.onrender.com';
    const redirectUri = `${backendUrl}/api/auth/mobile-callback`;

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId!);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('prompt', 'select_account');
    // Pasamos el sessionId como 'state' para recuperarlo en el callback
    if (session) googleAuthUrl.searchParams.set('state', session as string);

    res.redirect(googleAuthUrl.toString());
};

/**
 * GET /api/auth/mobile-callback
 * Google redirige aquí → intercambiamos code → guardamos JWT en memoria → HTML de éxito.
 */
export const googleMobileCallback = async (req: Request, res: Response) => {
    const { code, error, state } = req.query;

    const htmlError = (msg: string) => res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f1f5f9">
        <h2 style="color:#ef4444">Error: ${msg}</h2>
        <p>Cierra esta ventana y vuelve a intentarlo.</p>
        </body></html>`);

    if (error || !code) return htmlError('Login cancelado');

    try {
        const backendUrl = process.env.BACKEND_URL || 'https://spa-appoint-back.onrender.com';
        const redirectUri = `${backendUrl}/api/auth/mobile-callback`;

        // Intercambiar código por access_token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code as string,
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });
        const tokens = await tokenRes.json() as any;
        if (!tokens.access_token) return htmlError('No se pudo obtener el token de Google');

        // Obtener info del usuario
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json() as any;
        const { sub: googleId, email, name } = userInfo;

        // Buscar o crear negocio y usuario
        let negocio = await prisma.negocio.findUnique({ where: { googleId } });
        if (!negocio) {
            negocio = await prisma.negocio.create({
                data: {
                    googleId, email, nombre: name || email.split('@')[0],
                    usuarios: { create: { nombre: name || email.split('@')[0], email, googleId, rol: 'ADMIN' } },
                },
            });
        }

        const usuario = await prisma.usuario.findFirst({ where: { negocioId: negocio.id } });
        if (!usuario) return htmlError('Usuario no encontrado');

        const jwtToken = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const sessionData = {
            token: jwtToken,
            userId: usuario.id, userName: usuario.nombre,
            userEmail: usuario.email, userRol: usuario.rol,
            negocioId: negocio.id, negocioNombre: negocio.nombre,
            negocioPlan: negocio.plan,
        };

        // Guardar en memoria keyed por sessionId (state)
        if (state) {
            mobileTokenStore.set(state as string, {
                data: sessionData,
                expiry: Date.now() + 5 * 60 * 1000, // 5 minutos
            });
        }

        // HTML de éxito — el mobile está haciendo polling
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#1e293b;color:white">
            <div style="max-width:400px;margin:0 auto">
            <div style="width:64px;height:64px;background:#6366f1;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;font-weight:800">CA</div>
            <h2 style="color:#22c55e;margin-bottom:8px">Login exitoso</h2>
            <p style="color:#94a3b8">Hola, ${usuario.nombre}. Puedes cerrar esta ventana y regresar a la app.</p>
            </div></body></html>`);
    } catch (err) {
        console.error('[Auth] Error en googleMobileCallback:', err);
        return htmlError('Error del servidor');
    }
};

/**
 * GET /api/auth/mobile-token?session=UUID
 * La app mobile hace polling a este endpoint hasta obtener el token.
 */
export const mobileTokenPoll = (req: Request, res: Response) => {
    const { session } = req.query;
    if (!session) return res.status(400).json({ error: 'session requerido' });

    const entry = mobileTokenStore.get(session as string);

    if (!entry) return res.json({ status: 'pending' });
    if (Date.now() > entry.expiry) {
        mobileTokenStore.delete(session as string);
        return res.json({ status: 'expired' });
    }

    // Token encontrado — borrarlo y devolverlo
    mobileTokenStore.delete(session as string);
    return res.json({ status: 'ready', ...entry.data });
};
