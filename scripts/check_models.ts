
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkApi() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ No API Key found');
        return;
    }

    console.log(`🔑 Testing API Key: ${apiKey.substring(0, 10)}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        console.log('📡 Contacting Google API (ListModels)...');
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error('❌ API Error:', data);
            console.log('\n👉 DIAGNOSIS:');
            if (data.error?.code === 400 && data.error?.message?.includes('API key not valid')) {
                console.log('The API Key is INVALID. Please generate a new one.');
            } else if (data.error?.message?.includes('Generative Language API has not been used in project')) {
                console.log('The API is NOT ENABLED in your Cloud Project.');
                console.log('Enable it here: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com');
            } else {
                console.log('Unknown error. Check Google Cloud Console.');
            }
        } else {
            console.log('✅ API Connection SUCCESS!');
            console.log('📋 Available Models:');
            if (data.models) {
                data.models.forEach((m: any) => {
                    // Filter to show only relevant generation models
                    if (m.name.includes('gemini')) {
                        console.log(`   - ${m.name}`);
                    }
                });
            } else {
                console.log('   (No models returned)');
            }
        }
    } catch (err) {
        console.error('❌ Network/Fetch Error:', err);
    }
}

checkApi();
