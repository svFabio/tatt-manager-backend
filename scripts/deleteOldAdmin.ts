import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const emailToDelete = 'admin@citas.com';
    try {
        const deletedUser = await prisma.usuario.delete({
            where: { email: emailToDelete },
        });
        console.log(`Usuario eliminado correctamente: ${deletedUser.email} (ID: ${deletedUser.id})`);
    } catch (error) {
        //
        if (error.code === 'P2025') {
            console.log(`El usuario ${emailToDelete} no existe (ya fue borrado).`);
        } else {
            console.error('Error al eliminar usuario:', error);
        }
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
