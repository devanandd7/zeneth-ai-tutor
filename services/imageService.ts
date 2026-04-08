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

// ─── Image Preloader ─────────────────────────────────────────────────────────
function preloadImage(url: string) {
  if (typeof window !== 'undefined') {
    const img = new Image();
    img.src = url;
  }
}

// ─── Main: get best image URL for a topic ────────────────────────────────────
// Returns a URL string that can be set directly on an <img> src.
// Strategy: Generate Pollinations AI URL directly and preload it to avoid latency.
export async function getImageForTopic(
  topic: string,
  nodeId?: string
): Promise<string> {
  const url = buildPollinationsUrl(topic, nodeId);
  preloadImage(url); // Trigger browser cache immediately
  return url;
}
