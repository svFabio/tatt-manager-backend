import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@citas.com';

    try {
        const usuario = await prisma.usuario.update({
            where: { email },
            data: { rol: 'ADMIN' }
        });
        console.log(`✅ Usuario ${email} actualizado a ADMIN:`, usuario);
    } catch (error) {
        console.error(`Error actualizando usuario ${email}:`, error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
