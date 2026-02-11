import { AI_SYSTEM_PROMPT, type AIResponse } from './tools';

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

export async function generateAIResponse(
    userPrompt: string,
    context: {
        now: Date,
        labels: any[],
        config: any
    }
): Promise<AIResponse> {

    // 1. Check for API Key
    if (!GROQ_API_KEY) {
        return {
            user_message: "Error: No se encontró la API Key de Groq. Configura VITE_GROQ_API_KEY en tu .env",
            tool_calls: []
        };
    }

    // 2. Construct Context-Aware Prompt
    const contextString = `
    CURRENT CONTEXT:
    - Current Date/Time: ${context.now.toLocaleString()}
    - Day Index (0=Mon, 6=Sun): ${context.now.getDay() === 0 ? 6 : context.now.getDay() - 1}
    - Available Labels: ${context.labels.map(l => `${l.name} (Color: ${l.color})`).join(', ')}
    - Configuration: ${JSON.stringify(context.config)}
    `;

    const messages = [
        {
            role: "system",
            content: `${AI_SYSTEM_PROMPT}\n\n${contextString}\n\nIMPORTANT: Return ONLY JSON. No Markdown.`
        },
        {
            role: "user",
            content: userPrompt
        }
    ];

    try {
        // 3. Call Groq API (using native fetch for zero-dependency)
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3-70b-8192", // High intelligence, insane speed
                messages: messages,
                temperature: 0.1, // Low temp for precise tool use
                response_format: { type: "json_object" } // Force JSON mode
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Groq API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        console.log("[Groq Raw]:", content);

        // 4. Parse JSON
        const aiResponse = JSON.parse(content) as AIResponse;

        // Safety check
        if (!aiResponse.user_message) {
            aiResponse.user_message = "Procesado (Groq), pero sin mensaje de usuario.";
        }

        return aiResponse;

    } catch (error: any) {
        console.error("Groq API Error:", error);
        return {
            user_message: `Error conectando con Groq: ${error.message || 'Desconocido'}`,
            tool_calls: []
        };
    }
}
