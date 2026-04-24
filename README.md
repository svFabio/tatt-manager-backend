# Backend - Tatt Manager 🦇

Servicio backend de alto rendimiento para la gestión integral de estudios de tatuaje. Orquesta citas, automatiza confirmaciones mediante WhatsApp y ofrece inteligencia artificial nativa para atender clientes sin intervención humana.

## System Architecture

<img width="1219" height="651" alt="image" src="https://github.com/user-attachments/assets/19d75cbf-06c9-496e-9813-15dea1e0fcdf" />

### Communication & Auth Flow
<img width="1114" height="817" alt="image" src="https://github.com/user-attachments/assets/0e72e5eb-e711-4205-af5a-c136f003f5ab" />
<img width="882" height="849" alt="image" src="https://github.com/user-attachments/assets/252cf2b0-ad90-4553-9bf7-4644f1abd473" />

## Instilación Local (Quick Start)

1. **Clonar e instalar dependencias:**
   ```bash
   git clone <repository-url>
   cd tatt-manager-backend
   npm install
   ```

2. **Configurar Entorno (`.env`):**
   ```env
   DATABASE_URL="postgresql://user:password@hostname:5432/tatt_manager_db"
   PORT=3000
   JWT_SECRET="super_secret_jwt_key_here"
   
   # Cloudinary (Imágenes y Comprobantes)
   CLOUDINARY_CLOUD_NAME="your_cloud_name"
   CLOUDINARY_API_KEY="your_api_key"
   CLOUDINARY_API_SECRET="your_api_secret"
   
   # Google Gemini (Inteligencia Artificial)
   GEMINI_API_KEY="your_gemini_api_key"
   
   # Google OAuth (Autenticación Móvil)
   GOOGLE_CLIENT_ID="your_google_client_id"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   ```

3. **Base de Datos & Prisma:**
   Asegúrate de aplicar el modelo relacional actual:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Arrancar en Modo Desarrollo:**
   ```bash
   npm run dev
   ```

## Estructura Core

- **`src/controllers/`**: Maneja el enrutamiento HTTP (Citas, Auth, Statistics, WhatsApp).
- **`src/services/`**: Lógica de negocio dura.
  - `whatsappClient.ts`: Motor de Baileys para control de sesión de WhatsApp.
  - `citas.service.ts`: Abstracción relacional del agendamiento y disponibilidad.
- **`src/middleware/`**: Seguridad. Envolturas de JWT (`auth.middleware.ts`) para proteger los endpoints.
- **`prisma/schema.prisma`**: Corazón transaccional. (Clientes, Citas, Usuarios, Pagos, Solicitudes).

## Seguridad
- Todas las rutas clave requieren token JWT válido.
- Bloqueo por Rate Limiting (500 req/15min).
- Prevención básica con capa de Helmet y CORS.

---
*Si modificas la base de datos, no olvides correr `npx prisma generate` antes de ejecutar compilaciones.*
