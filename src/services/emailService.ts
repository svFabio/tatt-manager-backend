import nodemailer from 'nodemailer';

/* ─── Transporter SMTP (Gmail) ────────────────────────────────────── */

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
    },
});

/* ─── Verificar conexión al iniciar ──────────────────────────────── */

transporter.verify()
    .then(() => console.log('📧 Servicio de email listo'))
    .catch((err) => console.error('❌ Error en servicio de email:', err.message));

/* ─── Enviar código de recuperación ──────────────────────────────── */

export async function enviarCodigoRecuperacion(email: string, codigo: string): Promise<void> {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#000000; font-family:'Segoe UI',Roboto,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000; padding:40px 20px;">
            <tr>
                <td align="center">
                    <table width="400" cellpadding="0" cellspacing="0" style="background-color:#121212; border-radius:24px; border:1px solid rgba(255,255,255,0.04); overflow:hidden;">
                        <!-- Header con gradiente -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #4338CA 0%, #312E81 100%); padding:32px 24px; text-align:center;">
                                <h1 style="margin:0; color:#FFFFFF; font-size:28px; font-weight:900; letter-spacing:-1px;">
                                    TATT <span style="color:#6366F1;">STUDIO</span>
                                </h1>
                            </td>
                        </tr>
                        <!-- Contenido -->
                        <tr>
                            <td style="padding:40px 32px;">
                                <h2 style="margin:0 0 8px; color:#FFFFFF; font-size:22px; font-weight:700;">
                                    Código de recuperación
                                </h2>
                                <p style="margin:0 0 32px; color:#6B7280; font-size:14px; line-height:1.6;">
                                    Ingresa el siguiente código en la app para recuperar el acceso a tu cuenta.
                                </p>
                                <!-- Código -->
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center" style="padding:24px 0;">
                                            <div style="background-color:#1C1C1E; border:1px solid rgba(67,56,202,0.3); border-radius:16px; padding:20px 40px; display:inline-block;">
                                                <span style="font-size:36px; font-weight:900; letter-spacing:12px; color:#6366F1; font-family:'Courier New',monospace;">
                                                    ${codigo}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                                <!-- Aviso de expiración -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                                    <tr>
                                        <td style="background-color:rgba(67,56,202,0.08); border:1px solid rgba(67,56,202,0.15); border-radius:12px; padding:16px;">
                                            <p style="margin:0; color:#9CA3AF; font-size:13px; text-align:center;">
                                                ⏰ Este código expira en <strong style="color:#6366F1;">10 minutos</strong>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:32px 0 0; color:#4B5563; font-size:12px; text-align:center; line-height:1.5;">
                                    Si no solicitaste este código, puedes ignorar este correo de forma segura.
                                </p>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="padding:20px 32px; border-top:1px solid rgba(255,255,255,0.04); text-align:center;">
                                <p style="margin:0; color:#3A3A3C; font-size:11px;">
                                    © ${new Date().getFullYear()} Tatt Studio · Todos los derechos reservados
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>`;

    await transporter.sendMail({
        from: `"Tatt Studio" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: '🔐 Código de recuperación — Tatt Studio',
        html: htmlContent,
    });
}

/* ─── Enviar código de registro ──────────────────────────────────── */

export async function enviarCodigoRegistroEmail(email: string, codigo: string): Promise<void> {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#000000; font-family:'Segoe UI',Roboto,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000; padding:40px 20px;">
            <tr>
                <td align="center">
                    <table width="400" cellpadding="0" cellspacing="0" style="background-color:#121212; border-radius:24px; border:1px solid rgba(255,255,255,0.04); overflow:hidden;">
                        <!-- Header con gradiente -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #4338CA 0%, #312E81 100%); padding:32px 24px; text-align:center;">
                                <h1 style="margin:0; color:#FFFFFF; font-size:28px; font-weight:900; letter-spacing:-1px;">
                                    TATT <span style="color:#6366F1;">STUDIO</span>
                                </h1>
                            </td>
                        </tr>
                        <!-- Contenido -->
                        <tr>
                            <td style="padding:40px 32px;">
                                <h2 style="margin:0 0 8px; color:#FFFFFF; font-size:22px; font-weight:700;">
                                    Verifica tu correo
                                </h2>
                                <p style="margin:0 0 32px; color:#6B7280; font-size:14px; line-height:1.6;">
                                    Ingresa el siguiente código en la aplicación para verificar tu correo electrónico y completar tu registro.
                                </p>
                                <!-- Código -->
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center" style="padding:24px 0;">
                                            <div style="background-color:#1C1C1E; border:1px solid rgba(67,56,202,0.3); border-radius:16px; padding:20px 40px; display:inline-block;">
                                                <span style="font-size:36px; font-weight:900; letter-spacing:12px; color:#6366F1; font-family:'Courier New',monospace;">
                                                    ${codigo}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                                <!-- Aviso de expiración -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                                    <tr>
                                        <td style="background-color:rgba(67,56,202,0.08); border:1px solid rgba(67,56,202,0.15); border-radius:12px; padding:16px;">
                                            <p style="margin:0; color:#9CA3AF; font-size:13px; text-align:center;">
                                                ⏰ Este código expira en <strong style="color:#6366F1;">10 minutos</strong>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>`;

    await transporter.sendMail({
        from: `"Tatt Studio" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: '✨ Código de verificación — Tatt Studio',
        html: htmlContent,
    });
}
