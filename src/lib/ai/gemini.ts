import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_SYSTEM_PROMPT, type AIResponse } from './tools';

// Initialize the API
// Make sure to add VITE_GEMINI_API_KEY to your .env file
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export async function generateAIResponse(
    userPrompt: string,
    context: {
        now: Date,
        labels: any[],
        config: any
    }
): Promise<AIResponse> {

    // 1. Check for API Key
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
        return {
            user_message: "Error: No se encontró la API Key de Gemini. Por favor configura VITE_GEMINI_API_KEY en tu archivo .env.",
            tool_call: null
        };
    }

    try {
        // 2. Prepare Model
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest",
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        // 3. Construct Context-Aware Prompt
        const contextString = `
        CURRENT CONTEXT:
        - Current Date/Time: ${context.now.toLocaleString()}
        - Day Index (0=Mon, 6=Sun): ${context.now.getDay() === 0 ? 6 : context.now.getDay() - 1}
        - Available Labels: ${context.labels.map(l => `${l.name} (Color: ${l.color})`).join(', ')}
        - Configuration: ${JSON.stringify(context.config)}
        `;

        const fullPrompt = `
        ${AI_SYSTEM_PROMPT}

        ${contextString}

        USER REQUEST: "${userPrompt}"
        `;

        // 4. Generate Content
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const text = response.text();

        console.log("[Gemini Raw]:", text);

        // 5. Parse JSON
        const aiResponse = JSON.parse(text) as AIResponse;

        // Safety check on structure
        if (!aiResponse.user_message) {
            aiResponse.user_message = "Procesado, pero la respuesta no tenía mensaje.";
        }

        return aiResponse;

    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            user_message: "Lo siento, hubo un error conectando con la inteligencia artificial. Verifica tu conexión o intenta de nuevo.",
            tool_call: null
        };
    }
}
