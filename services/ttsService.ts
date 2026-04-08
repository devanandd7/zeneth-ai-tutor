const DB_NAME = 'ZenithTTSDB';
const STORE_NAME = 'audioBlobs';
const DB_VERSION = 2; // bumped to force re-creation of store

// ─── Kokoro TTS API URL ───────────────────────────────────────────────────────
const KOKORO_API = 'https://devanandutkarsh7--kokoro-tts-api-fastapi-app.modal.run/tts';

// ─── IndexedDB Layer ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ? request.result.blob : null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ id, blob });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // silently ignore cache failures
  }
}

// ─── Text Cleaner: Strip LaTeX, Markdown & Code before TTS ──────────────────

export function cleanTextForTTS(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, '. (mathematical formula) ')
    .replace(/\\\[[\s\S]*?\\\]/g, '. (mathematical formula) ')
    .replace(/\\\([\s\S]*?\\\)/g, ' (formula) ')
    .replace(/\$[^$\n]+\$/g, ' (formula) ')
    .replace(/\\rightarrow|\\xrightarrow\{[^}]*\}\{[^}]*\}|\\xrightarrow\[[^\]]*\]\{[^}]*\}|\\xrightarrow/g, ' produces ')
    .replace(/\\to\b/g, ' to ')
    .replace(/\\cdot/g, ' times ')
    .replace(/\\times/g, ' times ')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2')
    .replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\alpha/g, 'alpha').replace(/\\beta/g, 'beta').replace(/\\gamma/g, 'gamma')
    .replace(/\\Delta/g, 'delta').replace(/\\theta/g, 'theta').replace(/\\pi/g, 'pi')
    .replace(/\\infty/g, 'infinity')
    .replace(/_\{([^}]*)\}/g, ' $1')
    .replace(/\^\{([^}]*)\}/g, ' to the power of $1')
    .replace(/_(\w)/g, ' $1')
    .replace(/\^(\w)/g, ' to the power $1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\ce\{([^}]*)\}/g, '$1')
    .replace(/\\\w+/g, '')
    .replace(/[{}]/g, '')
    .replace(/```[\s\S]*?```/g, '(code example)')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*(.*)\*\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-*•]\s/g, ', ')
    .replace(/\|[^|]+\|/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .trim();
}

// ─── Kokoro TTS API Call ──────────────────────────────────────────────────────
// Returns a WAV Blob. Timesout gracefully after 90s.

async function fetchKokoroTTS(text: string): Promise<Blob> {
  console.log(`[Kokoro TTS] Requesting audio for ${text.length} chars...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.warn('[Kokoro TTS] Request timed out after 90s');
    controller.abort();
  }, 90000);

  try {
    const response = await fetch(KOKORO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: 'en-us',
        speed: 1.0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Kokoro TTS HTTP ${response.status}: ${body}`);
    }

    const blob = await response.blob();
    console.log(`[Kokoro TTS] ✅ Received blob: ${blob.size} bytes, type: ${blob.type}`);

    if (blob.size < 100) throw new Error('Kokoro returned empty audio');
    return blob;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── WAV Blob → Object URL ────────────────────────────────────────────────────
// We use ObjectURL (not data: URL) because:
//   1. Remotion <Audio> needs a stable URL it can seek;
//   2. WAV data: URLs have Infinity duration in Chrome < 116;
//   3. ObjectURLs are faster (no base64 encode/decode).

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

// ─── Duration Prober ──────────────────────────────────────────────────────────
// Correctly probes even WAV files that report Infinity duration.

export async function getBlobDuration(url: string): Promise<number> {
  if (!url) return 20;

  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';

    const failsafe = setTimeout(() => {
      console.warn('[TTS] getBlobDuration timeout — defaulting to 20s');
      resolve(20);
    }, 8000);

    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        clearTimeout(failsafe);
        console.log(`[TTS] Duration probed: ${audio.duration.toFixed(2)}s`);
        resolve(audio.duration);
        return;
      }
      // WAV Infinity workaround: seek to a huge timestamp to force browser to compute duration
      audio.currentTime = 1e9;
    };

    audio.ontimeupdate = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        clearTimeout(failsafe);
        console.log(`[TTS] Duration probed via seek: ${audio.duration.toFixed(2)}s`);
        resolve(audio.duration);
        audio.ontimeupdate = null;
        audio.src = '';
      }
    };

    audio.onerror = (e) => {
      clearTimeout(failsafe);
      console.error('[TTS] Audio error during duration probe:', e);
      resolve(20);
    };

    audio.src = url;
    audio.load();
  });
}

// ─── Main TTS Pipeline ───────────────────────────────────────────────────────
// Returns an ObjectURL string (blob:...) — works in both App & Remotion.

export async function fetchNarrativeAudio(narrative: string, cacheId: string): Promise<string> {
  // 1. Try IndexedDB cache first
  const cached = await getCachedBlob(cacheId);
  if (cached) {
    console.log(`[TTS] Cache HIT for ${cacheId}`);
    return blobToObjectUrl(cached);
  }

  const cleanNarrative = cleanTextForTTS(narrative);
  if (!cleanNarrative.trim()) {
    console.warn('[TTS] Empty narrative after cleaning, skipping TTS');
    return '';
  }

  console.log(`[TTS] Cache MISS for ${cacheId}. Calling Kokoro...`);

  try {
    const wavBlob = await fetchKokoroTTS(cleanNarrative);

    // Cache the raw Blob in IndexedDB for future page loads
    await setCachedBlob(cacheId, wavBlob);

    // Return ObjectURL — revocable, seekable, works with Remotion
    const objectUrl = blobToObjectUrl(wavBlob);
    console.log(`[TTS] ✅ ObjectURL created: ${objectUrl}`);
    return objectUrl;
  } catch (err) {
    console.error('[TTS] ❌ Kokoro TTS FAILED:', err);
    console.warn('[TTS] Falling back to Web Speech API for live playback');
    return '';
  }
}
