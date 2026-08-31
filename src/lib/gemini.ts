import { AiTags } from '../types/index';

const MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

const PROMPT = `Analyze this travel photo. Identify any famous landmarks, monuments, cathedrals, museums, scenery, or notable attractions.
Return ONLY valid JSON with exactly this structure:
{
  "landmarks": ["Exact Landmark Name e.g. Notre-Dame de Paris"],
  "restaurants": ["Restaurant Name if visible on signage"],
  "tags": ["cathedral", "gothic architecture", "monument", "historic site", "Paris", "France"]
}
If no landmark is visible, landmarks must be an empty array [].
Raw JSON only without any markdown formatting.`;

export async function analyzePhoto(base64Image: string): Promise<AiTags> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini] No EXPO_PUBLIC_GEMINI_API_KEY found');
    return emptyTags();
  }

  // Strip any data URI prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        console.log(`[Gemini] Model ${model} returned HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          landmarks: Array.isArray(parsed.landmarks) ? parsed.landmarks.filter((l: any) => typeof l === 'string' && l.trim().length > 0) : [],
          restaurants: Array.isArray(parsed.restaurants) ? parsed.restaurants.filter((r: any) => typeof r === 'string' && r.trim().length > 0) : [],
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === 'string' && t.trim().length > 0) : [],
        };
      }
    } catch (err) {
      console.log(`[Gemini] Error with model ${model}:`, err);
    }
  }

  return emptyTags();
}

function emptyTags(): AiTags {
  return { landmarks: [], restaurants: [], tags: [] };
}

