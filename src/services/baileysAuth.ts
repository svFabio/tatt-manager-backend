import { AuthenticationCreds, SignalDataTypeMap, initAuthCreds, BufferJSON, AuthenticationState } from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const usePrismaAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    // Definir ID común para esta sesión
    const credsId = `session-${sessionId}-creds`;

    // Función auxiliar para leer/escribir datos JSON
    const readSessionData = async (id: string) => {
        try {
            const session = await prisma.baileysSession.findUnique({ where: { id } });
            if (session?.creds) {
                return JSON.parse(session.creds, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    const readSessionKeys = async (id: string, type: string) => {
        try {
            const session = await prisma.baileysSession.findUnique({ where: { id: `${id}-${type}` } });
            if (session?.keys) {
                return JSON.parse(session.keys, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    const writeSessionData = async (id: string, creds: AuthenticationCreds | null, keys: SignalDataTypeMap | null) => {
        await prisma.baileysSession.upsert({
            where: { id },
            update: {
                creds: creds ? JSON.stringify(creds, BufferJSON.replacer) : undefined,
                keys: keys ? JSON.stringify(keys, BufferJSON.replacer) : undefined
            },
            create: {
                id,
                creds: creds ? JSON.stringify(creds, BufferJSON.replacer) : "",
                keys: keys ? JSON.stringify(keys, BufferJSON.replacer) : ""
            }
        });
    };

    // Cargar credenciales o iniciar nuevas
    const existingCreds = await readSessionData(credsId);
    const creds: AuthenticationCreds = existingCreds || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys SignalDataTypeMap generics are not safely expressible as a union here
                    const data: Record<string, any> = {};
                    await Promise.all(ids.map(async (id) => {
                        const keyId = `session-${sessionId}-${type}-${id}`;
                        let value = await readSessionKeys(keyId, 'key'); // Reutilizamos lógica simple
                        // En realidad, Baileys pasa ids, nosotros guardamos cada key como una fila si queremos granularidad, 
                        // O un gran JSON map. Para simplicidad y prevenir bloqueos de DB, usemos un modelo Key-Value simple.
                        // Pero el usuario pidió algo simple.
                        // Vamos a guardar las keys en filas individuales para evitar JSONs gigantes.

                        // NOTA: Implementación simplificada
                        // Mejor estrategia: row id = `session-${sessionId}-${type}-${id}`
                        const row = await prisma.baileysSession.findUnique({ where: { id: keyId } });
                        if (row?.keys) {
                            value = JSON.parse(row.keys, BufferJSON.reviver);
                        }
                        if (value) {
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const keyId = `session-${sessionId}-${type}-${id}`;
                            const task = value ?
                                writeSessionData(keyId, null, value) :
                                prisma.baileysSession.deleteMany({ where: { id: keyId } });
                            tasks.push(task as Promise<void>);
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeSessionData(credsId, creds, null);
        }
    };
};

export const clearAuthState = async (sessionId: string) => {
    // Eliminar creds exactas
    await prisma.baileysSession.deleteMany({
        where: {
            id: {
                startsWith: `session-${sessionId}`
            }
        }
    });
};
