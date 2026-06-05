import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { JWT_EXPIRES_IN } from '../config';

const JWT_SECRET = process.env.JWT_SECRET!;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ─── Tipos ────────────────────────────────────────────────────────── */

export interface SessionData {
    token: string;
    userId: number;
    userName: string;
    userEmail: string;
    userRol: string;
    negocioId: number;
    negocioNombre: string;
    negocioPlan: string;
}

export const mobileTokenStore = new Map<string, { data: SessionData; expiry: number }>();

/* ─── Helper: generar token básico (solo identidad, SIN estudio) ──── */

function generarTokenBasico(usuario: { id: number; email: string }) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/* ─── Helper: generar token contextual (identidad + estudio + rol) ── */

function generarTokenContextual(
    usuario: { id: number; email: string },
    negocioId: number,
    rol: string
) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email, negocioId, rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/* ─── Servicio de Autenticación ──────────────────────────────────── */

export class AuthService {

    /* ── Registro con email (solo crea usuario, SIN estudio) ────── */
    static async registrarConEmail(email: string, password: string, nombre?: string) {
        const existente = await prisma.usuario.findUnique({ where: { email } });
        if (existente) throw { status: 409, message: 'Ya existe una cuenta con ese email' };

        const hashedPassword = await bcrypt.hash(password, 10);
        const usuario = await prisma.usuario.create({
            data: {
                nombre: nombre || email.split('@')[0],
                email,
                password: hashedPassword,
                authProvider: 'email',
            },
        });

        const token = generarTokenBasico(usuario);
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, fotoUrl: usuario.fotoUrl },
            esNuevo: true,
        };
    }

    /* ── Login con email ───────────────────────────────────────── */
    static async loginConEmail(email: string, password: string) {
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || !usuario.password) throw { status: 401, message: 'Credenciales incorrectas' };

        const passwordValido = await bcrypt.compare(password, usuario.password);
        if (!passwordValido) throw { status: 401, message: 'Credenciales incorrectas' };

        const token = generarTokenBasico(usuario);
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, fotoUrl: usuario.fotoUrl },
            esNuevo: false,
        };
    }

    /* ── Login con Google (via access_token) ────────────────────── */
    static async handleGoogleLogin(googleToken: string, rawUserInfo: Record<string, unknown> | null) {
        let googleId: string;
        let email: string;
        let nombre: string;

        if (rawUserInfo?.sub) {
            const verifyRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (!verifyRes.ok) throw { status: 401, message: 'Token de Google inválido' };
            const verified = await verifyRes.json();
            googleId = verified.sub;
            email = verified.email;
            nombre = verified.name || email.split('@')[0];
        } else {
            const ticket = await googleClient.verifyIdToken({
                idToken: googleToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            if (!payload || !payload.sub || !payload.email) throw { status: 401, message: 'Token de Google inválido' };
            googleId = payload.sub;
            email = payload.email;
            nombre = payload.name || email.split('@')[0];
        }

        // Buscar o crear usuario
        let usuario = await prisma.usuario.findUnique({ where: { googleId } });
        const esNuevo = !usuario;
        if (!usuario) {
            // También verificar por email
            usuario = await prisma.usuario.findUnique({ where: { email } });
            if (usuario) {
                // Vincular googleId al usuario existente
                usuario = await prisma.usuario.update({
                    where: { id: usuario.id },
                    data: { googleId, authProvider: 'google' },
                });
            } else {
                usuario = await prisma.usuario.create({
                    data: { nombre, email, googleId, authProvider: 'google' },
                });
            }
        }

        const token = generarTokenBasico(usuario);
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, fotoUrl: usuario.fotoUrl },
            esNuevo,
        };
    }

    /* ── /me endpoint ──────────────────────────────────────────── */
    static async getMe(userId: number) {
        const usuario = await prisma.usuario.findUnique({
            where: { id: userId },
            select: { id: true, nombre: true, email: true, authProvider: true, fotoUrl: true },
        });
        if (!usuario) throw { status: 404, message: 'Usuario no encontrado' };
        return usuario;
    }

    /* ── Login con Google Nativo (via idToken) ─────────────────── */
    static async handleNativeGoogleLogin(idToken: string) {
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        
        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken,
                audience: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(Boolean) as string[], 
            });
        } catch {
            throw { status: 401, message: 'Token de Google inválido' };
        }
        const payload = ticket.getPayload();
        if (!payload || !payload.email) throw { status: 401, message: 'No se pudo obtener el email de Google' };

        const email = payload.email;
        const nombre = payload.name || email.split('@')[0];
        const googleId = payload.sub;

        let usuario = await prisma.usuario.findUnique({ where: { email } });
        let esNuevo = false;

        if (usuario) {
            if (!usuario.googleId) {
                usuario = await prisma.usuario.update({
                    where: { email },
                    data: { googleId, authProvider: 'google' },
                });
            }
        } else {
            esNuevo = true;
            usuario = await prisma.usuario.create({
                data: { nombre, email, googleId, authProvider: 'google' },
            });
        }

        const token = generarTokenBasico(usuario);
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, fotoUrl: usuario.fotoUrl },
            esNuevo,
        };
    }

    /* ── Listar estudios del usuario ───────────────────────────── */
    static async getEstudiosUsuario(userId: number) {
        const membresías = await prisma.miembroEstudio.findMany({
            where: { usuarioId: userId },
            include: {
                negocio: {
                    select: { id: true, nombre: true, plan: true },
                },
            },
            orderBy: { unidoEn: 'desc' },
        });

        return membresías.map((m) => ({
            negocioId: m.negocio.id,
            nombre: m.negocio.nombre,
            plan: m.negocio.plan,
            rol: m.rol,
            unidoEn: m.unidoEn,
        }));
    }

    /* ── Seleccionar estudio (generar token contextual) ─────────── */
    static async seleccionarEstudio(userId: number, negocioId: number) {
        const miembro = await prisma.miembroEstudio.findUnique({
            where: { usuarioId_negocioId: { usuarioId: userId, negocioId } },
            include: {
                negocio: { select: { id: true, nombre: true, plan: true } },
                usuario: { select: { id: true, nombre: true, email: true } },
            },
        });
        if (!miembro) throw { status: 403, message: 'No perteneces a este estudio' };

        const token = generarTokenContextual(miembro.usuario, negocioId, miembro.rol);
        return {
            token,
            usuario: { id: miembro.usuario.id, nombre: miembro.usuario.nombre, email: miembro.usuario.email },
            negocio: miembro.negocio,
            rol: miembro.rol,
        };
    }

    /* ── Crear estudio (usuario se vuelve ADMIN) ───────────────── */
    static async crearEstudio(userId: number, nombreEstudio: string) {
        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const seg = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
        const codigoInvitacion = `TATT-${seg()}-${seg()}-${seg()}-${seg()}`;

        const negocio = await prisma.negocio.create({
            data: {
                nombre: nombreEstudio,
                codigoInvitacion,
                miembros: {
                    create: { usuarioId: userId, rol: 'ADMIN' },
                },
            },
        });

        return {
            negocioId: negocio.id,
            nombre: negocio.nombre,
            plan: negocio.plan,
            rol: 'ADMIN' as const,
            codigoInvitacion,
        };
    }

    /* ── Unirse a estudio por código ───────────────────────────── */
    static async unirseAEstudio(userId: number, codigo: string) {
        const negocio = await prisma.negocio.findUnique({
            where: { codigoInvitacion: codigo },
        });
        if (!negocio) throw { status: 404, message: 'Código de invitación inválido' };

        // Verificar si ya es miembro
        const existente = await prisma.miembroEstudio.findUnique({
            where: { usuarioId_negocioId: { usuarioId: userId, negocioId: negocio.id } },
        });
        if (existente) throw { status: 409, message: 'Ya eres miembro de este estudio' };

        await prisma.miembroEstudio.create({
            data: { usuarioId: userId, negocioId: negocio.id, rol: 'ARTISTA' },
        });

        return {
            negocioId: negocio.id,
            nombre: negocio.nombre,
            plan: negocio.plan,
            rol: 'ARTISTA' as const,
        };
    }

    /* ── Google Mobile OAuth (flujo redirect) ─────────────────── */
    static async handleGoogleMobileCallback(code: string, state: string) {
        const backendUrl = process.env.BACKEND_URL;
        if (!backendUrl) throw { status: 500, message: 'Variable de entorno BACKEND_URL no configurada.' };

        const redirectUri = `${backendUrl}/api/auth/mobile-callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const tokens = await tokenRes.json() as { access_token?: string };
        if (!tokens.access_token) throw { status: 401, message: 'No se pudo obtener el token de Google' };

        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json() as { sub: string; email: string; name?: string };
        const { sub: googleId, email, name } = userInfo;

        // Buscar o crear usuario
        let usuario = await prisma.usuario.findUnique({ where: { googleId } });
        if (!usuario) {
            usuario = await prisma.usuario.findUnique({ where: { email } });
            if (usuario) {
                usuario = await prisma.usuario.update({
                    where: { id: usuario.id },
                    data: { googleId, authProvider: 'google' },
                });
            } else {
                usuario = await prisma.usuario.create({
                    data: { nombre: name || email.split('@')[0], email, googleId, authProvider: 'google' },
                });
            }
        }

        const jwtToken = generarTokenBasico(usuario);

        const sessionData: SessionData = {
            token: jwtToken,
            userId: usuario.id,
            userName: usuario.nombre,
            userEmail: usuario.email,
            userRol: '', // sin rol global
            negocioId: 0, // sin negocio preseleccionado
            negocioNombre: '',
            negocioPlan: '',
        };

        if (state) {
            mobileTokenStore.set(state as string, {
                data: sessionData,
                expiry: Date.now() + 5 * 60 * 1000,
            });
        }

        return { usuario };
    }
}
