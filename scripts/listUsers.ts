import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const users = await prisma.usuario.findMany();
    console.log('--- Current Users ---');
    console.table(users);
    console.log('---------------------');
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
