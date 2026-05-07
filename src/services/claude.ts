import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export async function analyzeMood(
  mood: string,
  genre: string,
  artist?: string,
): Promise<string> {
  const prompt = `
    Eres un experto en música. El usuario describe su estado de ánimo así: "${mood}".
    Género preferido: "${genre}".
    ${artist ? `Artista o banda de referencia: "${artist}".` : ""}
    
    Genera una query de búsqueda optimizada para Spotify de máximo 5 palabras
    que capture perfectamente ese mood y género.
    
    Responde SOLO con la query, sin explicaciones ni comillas.
  `;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      },
    );

    const content = response.data.content[0];
    if (content.type === "text") {
      return content.text.trim();
    }
    throw new Error("Respuesta inesperada de Claude");
  } catch (error) {
    throw new Error(`Error llamando a Claude: ${error}`);
  }
}
