
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testGeneration() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ No API Key found');
        return;
    }

    console.log(`🔑 Testing Generation with: ${apiKey.substring(0, 10)}...`);
    console.log('🤖 Model: gemini-2.0-flash');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    try {
        console.log('📡 Sending request...');
        const result = await model.generateContent('Responde solo con la palabra: FUNCIONA');
        const response = await result.response;
        const text = response.text();
        console.log('✅ SUCCESS!');
        console.log('📝 Response:', text);
    } catch (error: any) {
        console.error('❌ ERROR DETAILS:');
        console.error(error);
    }
}

testGeneration();
