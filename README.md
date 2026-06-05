# Tatt Studio - Backend

Servicio backend para la gestión de estudios de tatuaje. Controla las citas, la integración con WhatsApp, la inteligencia artificial (Gemini) y la pasarela de autenticación y correos.

## Requisitos Previos
* Node.js (v18 o superior)
* PostgreSQL (corriendo localmente o en la nube como NeonDB)

## Guía de Instalación Rápida

Sigue estos pasos detallados para levantar el servidor localmente:

### 1. Instalar dependencias
Abre la terminal en la carpeta `tatt-manager-backend` y ejecuta:
```bash
npm install
```

### 2. Configurar Variables de Entorno
Crea un archivo llamado `.env` en la raíz de la carpeta `tatt-manager-backend`. Es **obligatorio** que cuente con todas estas variables para que el sistema no falle. Copia y pega esta plantilla:

```env
# Base de Datos (PostgreSQL)
DATABASE_URL="postgresql://usuario:password@host:5432/dbname?sslmode=require"
DIRECT_URL="postgresql://usuario:password@host:5432/dbname?sslmode=require" # Necesario si usas Pooler como NeonDB

# Configuración del Servidor
PORT=3000
BACKEND_URL="http://192.168.1.X:3000" # Tu IP local para callbacks

# Seguridad
JWT_SECRET="super_secret_key"

# Cloudinary (Para subir imágenes/comprobantes)
CLOUDINARY_CLOUD_NAME="tu_cloud_name"
CLOUDINARY_API_KEY="tu_api_key"
CLOUDINARY_API_SECRET="tu_api_secret"

# Inteligencia Artificial
GEMINI_API_KEY="tu_api_key_de_gemini"

# Google OAuth (Autenticación)
GOOGLE_CLIENT_ID="tu_client_id_web"
GOOGLE_CLIENT_SECRET="tu_client_secret"
GOOGLE_ANDROID_CLIENT_ID="tu_client_id_android"

# Configuración SMTP (Para envío de correos)
SMTP_EMAIL="tu_correo@gmail.com"
SMTP_PASSWORD="tu_password_de_aplicacion"
```

### 3. Sincronizar Base de Datos (Prisma)
Una vez configurado el `.env`, prepara tu base de datos:
```bash
# Generar el cliente de Prisma
npx prisma generate

# Empujar el esquema a la base de datos
npx prisma db push
```

*(Opcional) Si necesitas datos de prueba, puedes ejecutar el script de seed:*
```bash
npx ts-node seed_test_data.ts
```

### 4. Levantar el Servidor
Inicia el entorno de desarrollo:
```bash
npm run dev
```

El backend estará disponible en el puerto definido (por defecto `http://localhost:3000`).
