/**
 * imageService.ts
 * Provides AI-generated reference images with robust fallback chain.
 * Uses Pollinations.ai (no CORS issues with img tags) + Wikipedia Thumbnail API.
 */

// ─── Pollinations.ai Image URL builder ───────────────────────────────────────
// These URLs work as <img src=""> because Pollinations allows hotlinking.
// We do NOT fetch() them (avoids CORS). Instead we return the URL directly.
export function buildPollinationsUrl(prompt: string, seed?: string): string {
  const encodedPrompt = encodeURIComponent(
    `${prompt} educational diagram clear background realistic high quality`
  );
  const seedVal = seed ? parseInt(seed.replace(/[^0-9]/g, '').slice(0, 6) || '42') : 42;
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=576&seed=${seedVal}&nologo=true&model=flux`;
}

// ─── Wikipedia Article Thumbnail URL ─────────────────────────────────────────
export async function fetchWikipediaImage(topic: string): Promise<string | null> {
  try {
    const searchTerm = encodeURIComponent(topic.replace(/[^\w\s]/g, '').trim());
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${searchTerm}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

// ─── Main: get best image URL for a topic ────────────────────────────────────
// Returns a URL string that can be set directly on an <img> src.
// Strategy: Wikipedia first (real photos) → Pollinations fallback (AI generated).
export async function getImageForTopic(
  topic: string,
  nodeId?: string
): Promise<string> {
  // 1. Try Wikipedia for real photos
  const wikiImg = await fetchWikipediaImage(topic);
  if (wikiImg) return wikiImg;

  // 2. Fall back to Pollinations AI (always works as img src)
  return buildPollinationsUrl(topic, nodeId);
}
