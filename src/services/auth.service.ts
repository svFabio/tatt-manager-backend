import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { JWT_EXPIRES_IN } from '../config';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET!;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const mobileTokenStore = new Map<string, { data: any; expiry: number }>();

export class AuthService {
    static async handleGoogleLogin(googleToken: string, rawUserInfo: any) {
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

        let negocio = await prisma.negocio.findUnique({ where: { googleId } });
        const esNuevo = !negocio;
        if (!negocio) {
            negocio = await prisma.negocio.create({
                data: {
                    googleId,
                    email,
                    nombre,
                    usuarios: { create: { nombre, email, googleId, rol: 'ADMIN' } },
                },
            });
        }
        const usuario = await prisma.usuario.findFirst({ where: { negocioId: negocio.id, googleId } });
        if (!usuario) throw { status: 500, message: 'Error recuperando el usuario del negocio' };

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio: { id: negocio.id, nombre: negocio.nombre, plan: negocio.plan },
            esNuevo,
        };
    }

    static async getMe(userId: number, negocioId: number) {
        const usuario = await prisma.usuario.findUnique({
            where: { id: userId },
            select: { id: true, nombre: true, email: true, rol: true },
        });
        const negocio = await prisma.negocio.findUnique({
            where: { id: negocioId },
            select: { id: true, nombre: true, plan: true },
        });
        if (!usuario || !negocio) throw { status: 404, message: 'Usuario o negocio no encontrado' };
        return { ...usuario, negocio };
    }

    static async registrarConEmail(email: string, password: string) {
        const existente = await prisma.usuario.findUnique({ where: { email } });
        if (existente) throw { status: 409, message: 'Ya existe una cuenta con ese email' };

        const hashedPassword = await bcrypt.hash(password, 10);
        const negocio = await prisma.negocio.create({
            data: {
                googleId: `email-${email}`, 
                email,
                nombre: 'Mi Negocio',
                usuarios: {
                    create: { nombre: email.split('@')[0], email, password: hashedPassword, rol: 'ADMIN' },
                },
            },
        });
        const usuario = await prisma.usuario.findFirst({ where: { negocioId: negocio.id, email } });
        if (!usuario) throw { status: 500, message: 'Error creando el usuario' };

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio: { id: negocio.id, nombre: negocio.nombre, plan: negocio.plan },
            esNuevo: true,
        };
    }

    static async loginConEmail(email: string, password: string) {
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || !usuario.password) throw { status: 401, message: 'Credenciales incorrectas' };

        const passwordValido = await bcrypt.compare(password, usuario.password);
        if (!passwordValido) throw { status: 401, message: 'Credenciales incorrectas' };

        const negocio = await prisma.negocio.findUnique({
            where: { id: usuario.negocioId },
            select: { id: true, nombre: true, plan: true },
        });
        if (!negocio) throw { status: 404, message: 'Negocio no encontrado' };

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol, negocioId: negocio.id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        return {
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
            negocio,
            esNuevo: false,
        };
    }

    static async handleGoogleMobileCallback(code: string, state: any) {
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
        
        const tokens = await tokenRes.json() as any;
        if (!tokens.access_token) throw { status: 401, message: 'No se pudo obtener el token de Google' };

        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json() as any;
        const { sub: googleId, email, name } = userInfo;

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
        if (!usuario) throw { status: 404, message: 'Usuario no encontrado' };

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

        if (state) {
            mobileTokenStore.set(state as string, {
                data: sessionData,
                expiry: Date.now() + 5 * 60 * 1000, 
            });
        }

        return { usuario, negocio };
    }
}
