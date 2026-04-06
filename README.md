# Backend - WhatsApp Spa Appointment System
Backend service for managing spa appointments via WhatsApp with AI-powered conversational interface and administrative panel.
## System Architecture

<img width="1219" height="651" alt="image" src="https://github.com/user-attachments/assets/19d75cbf-06c9-496e-9813-15dea1e0fcdf" />

## Communication Flow

<img width="1114" height="817" alt="image" src="https://github.com/user-attachments/assets/0e72e5eb-e711-4205-af5a-c136f003f5ab" />

## WhatsApp Linking Flow
<img width="916" height="702" alt="image" src="https://github.com/user-attachments/assets/d8a4dc67-1468-4c3e-add7-08796ac9cf59" />


## Authentication Flow
<img width="882" height="849" alt="image" src="https://github.com/user-attachments/assets/252cf2b0-ad90-4553-9bf7-4644f1abd473" />


## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Services](#services)
- [Deployment](#deployment)

## Features

- WhatsApp bot integration using Baileys
- AI-powered natural language processing with Google Gemini
- Appointment scheduling with availability validation
- Payment verification via transfer receipts
- JWT authentication with role-based access (ADMIN/STAFF)
- Real-time updates using Socket.IO
- PostgreSQL database with Prisma ORM
- Security with Helmet, CORS, and rate limiting
- Cloud storage for payment receipts (Cloudinary)

## Tech Stack

**Core**: Node.js, TypeScript, Express.js, Prisma, Socket.IO

**WhatsApp & AI**: @whiskeysockets/baileys, @google/generative-ai, chrono-node

**Security**: jsonwebtoken, bcryptjs, helmet, express-rate-limit, zod

**Storage**: Cloudinary, PostgreSQL

## Installation

### Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 14.x
- npm or yarn

### Setup

```bash
# Clone repository
git clone <repository-url>
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Seed initial data (create admin user)
npx tsx prisma/seed.ts
```

## Configuration

Create `.env` file in backend root:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/spa_appointments"
JWT_SECRET="your-super-secret-key"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"
GEMINI_API_KEY="your-gemini-api-key"
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"
PORT=3000
NODE_ENV="development"
```

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Initial data
│   └── migrations/            # Database migrations
├── src/
│   ├── server.ts              # Entry point
│   ├── controllers/           # Business logic
│   ├── routes/                # API routes
│   ├── services/              # Core services
│   │   ├── whatsappClient.ts  # Baileys client
│   │   ├── aiService.ts       # Gemini integration
│   │   ├── baileysAuth.ts     # WhatsApp auth
│   │   └── dateParser.ts      # Date parsing
│   ├── middleware/            # Middlewares
│   └── lib/                   # Utilities
├── Dockerfile
└── package.json
```

## API Endpoints

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "admin123"
}
```

### Appointments

```http
GET /api/citas                    # List all appointments
GET /api/citas/:id                # Get appointment by ID
PATCH /api/citas/:id              # Update appointment status
DELETE /api/citas/:id             # Delete appointment
```

All appointment endpoints require `Authorization: Bearer <token>` header.

### WhatsApp

```http
GET /api/status-whatsapp          # Connection status
POST /api/logout                  # Disconnect WhatsApp
```

### Statistics (ADMIN only)

```http
GET /api/statistics               # Get system statistics
```

### Users (ADMIN only)

```http
GET /api/users                    # List users
POST /api/users                   # Create user
PATCH /api/users/:id              # Update user
DELETE /api/users/:id             # Delete user
```

## Database Schema

### Appointment Model

```prisma
model Cita {
  id              Int      @id @default(autoincrement())
  clienteNombre   String?
  clienteTelefono String
  fecha           DateTime
  horario         String
  monto           Float    @default(50.0)
  estado          String   @default("PENDIENTE_PAGO")
  comprobanteUrl  String?
  creadoEn        DateTime @default(now())
}
```

**Appointment States:**
- `PENDIENTE_PAGO` - Waiting for payment receipt
- `VALIDACION_PENDIENTE` - Receipt received, pending validation
- `CONFIRMADO` - Appointment confirmed
- `CANCELADO` - Appointment cancelled

### User Model

```prisma
model Usuario {
  id       Int      @id @default(autoincrement())
  nombre   String
  email    String   @unique
  password String   # Hashed with bcrypt
  rol      Rol      @default(STAFF)
  creadoEn DateTime @default(now())
}

enum Rol {
  ADMIN
  STAFF
}
```

## Services

### WhatsApp Client (whatsappClient.ts)

Manages WhatsApp connection using Baileys:
- Session initialization and recovery
- QR code generation for pairing
- Message reception and processing
- Message sending to users
- Conversation state management

### AI Service (aiService.ts)

Google Gemini integration for intelligent processing:
- Intent detection (book, cancel, query)
- Data extraction (name, date, time)
- Natural response generation
- Ambiguity handling

### Date Parser (dateParser.ts)

Intelligent date parsing using chrono-node:
- Natural language interpretation ("tomorrow", "Friday", "January 30")
- Ambiguity handling (multiple date options)
- Availability validation
- Available date generation

### Baileys Auth (baileysAuth.ts)

WhatsApp authentication management:
- Credential storage in PostgreSQL
- Session recovery
- Token updates
- Session cleanup on disconnect

## Deployment

### Render (Recommended)

1. Create Web Service on Render
2. Configure environment variables in dashboard
3. Build Command: `npm install && npx prisma generate && npm run build`
4. Start Command: `npm start`

The `start` script automatically:
- Runs migrations: `npx prisma migrate deploy`
- Seeds data: `npx tsx prisma/seed.ts`
- Starts server: `node dist/src/server.js`

### Docker

```bash
# Build image
docker build -t spa-backend .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -e GEMINI_API_KEY="..." \
  spa-backend
```

### Production Environment Variables

Required variables for production:
- DATABASE_URL
- JWT_SECRET
- ADMIN_EMAIL
- ADMIN_PASSWORD
- GEMINI_API_KEY
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- PORT (usually assigned by host)

## Security

- JWT tokens with 7-day expiration
- Bcrypt password hashing (salt rounds = 10)
- Helmet for HTTP header protection
- CORS configured for specific frontend
- Rate limiting: 500 requests per IP every 15 minutes
- Trust proxy enabled for platforms like Render

## Notes

- WhatsApp bot requires QR code scan on first connection
- WhatsApp sessions persist in database
- Payment receipts automatically upload to Cloudinary
- Socket.IO emits real-time events to frontend
- System supports multiple administrative users

---

Developed for optimizing spa appointment management
