import { AiTags } from '../types';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`;

const PROMPT = `Analyze this travel photo. Return ONLY valid JSON with exactly this shape:
{"landmarks":[],"restaurants":[],"tags":[]}
- landmarks: recognizable landmarks, monuments, or notable places visible (empty array if none)
- restaurants: restaurant or cafe names visible on signage (empty array if none)
- tags: descriptive tags like "architecture","street food","nature","beach","museum","market" etc.
No markdown, no explanation — raw JSON only.`;

export async function analyzePhoto(base64Image: string): Promise<AiTags> {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (!response.ok) return emptyTags();

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return { ...emptyTags(), ...JSON.parse(cleaned) };
  } catch {
    return emptyTags();
  }
}

function emptyTags(): AiTags {
  return { landmarks: [], restaurants: [], tags: [] };
}
