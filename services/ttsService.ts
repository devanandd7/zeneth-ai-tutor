const DB_NAME = 'ZenithTTSDB';
const STORE_NAME = 'audioBlobs';
const DB_VERSION = 2;

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
    // silently ignore
  }
}

// ─── Text Cleaner ─────────────────────────────────────────────────────────────
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

// ─── Split text into sentence-sized chunks ────────────────────────────────────
// Goal: each chunk is ~1-2 sentences so Kokoro returns in 2-4 seconds.
function splitIntoChunks(text: string, maxChars = 220): string[] {
  // Split on sentence boundaries
  const sentences = text
    .replace(/([।.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 3);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length <= maxChars) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      // If single sentence is too long, split at comma/space
      if (sentence.length > maxChars) {
        const parts = sentence.match(/.{1,220}(\s|,|।|$)/g) || [sentence];
        chunks.push(...parts.map(p => p.trim()).filter(Boolean));
        current = '';
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ─── Single Kokoro API call ───────────────────────────────────────────────────
async function fetchKokoroChunk(text: string, lang: 'hi' | 'en'): Promise<Blob> {
  const language = lang === 'hi' ? 'hi' : 'en-us';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s per chunk

  try {
    const response = await fetch(KOKORO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, speed: 1.0 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Kokoro HTTP ${response.status}: ${body}`);
    }

    const blob = await response.blob();
    if (blob.size < 100) throw new Error('Kokoro returned empty audio');
    return blob;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Merge WAV blobs using AudioContext (lossless PCM concat) ─────────────────
async function mergeWavBlobs(blobs: Blob[]): Promise<Blob> {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffers = await Promise.all(blobs.map(b => b.arrayBuffer()));
    const audioBuffers = await Promise.all(arrayBuffers.map(ab => audioCtx.decodeAudioData(ab)));

    const totalLength = audioBuffers.reduce((sum, b) => sum + b.length, 0);
    const sampleRate = audioBuffers[0].sampleRate;
    const numberOfChannels = audioBuffers[0].numberOfChannels;

    const merged = audioCtx.createBuffer(numberOfChannels, totalLength, sampleRate);
    let offset = 0;
    for (const buf of audioBuffers) {
      for (let ch = 0; ch < numberOfChannels; ch++) {
        merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }

    // Encode to WAV
    const wavBlob = audioBufferToWav(merged);
    audioCtx.close();
    return wavBlob;
  } catch (err) {
    console.warn('[TTS] AudioContext merge failed, concatenating blobs directly:', err);
    // fallback: just concat raw blobs (works for WAV if headers are compatible)
    return new Blob(blobs, { type: 'audio/wav' });
  }
}

// ─── AudioBuffer → WAV Blob encoder ─────────────────────────────────────────
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2; // 16-bit
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

// ─── Duration Prober ──────────────────────────────────────────────────────────
export async function getBlobDuration(url: string): Promise<number> {
  if (!url) return 20;

  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';

    const failsafe = setTimeout(() => {
      resolve(20);
    }, 8000);

    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        clearTimeout(failsafe);
        resolve(audio.duration);
        return;
      }
      audio.currentTime = 1e9;
    };

    audio.ontimeupdate = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        clearTimeout(failsafe);
        resolve(audio.duration);
        audio.ontimeupdate = null;
        audio.src = '';
      }
    };

    audio.onerror = () => { clearTimeout(failsafe); resolve(20); };
    audio.src = url;
    audio.load();
  });
}

// ─── MAIN: Chunked TTS with Fast First Audio ──────────────────────────────────
// Strategy:
//   1. Check cache → if hit, return immediately (instant replay)
//   2. Split text into sentence chunks (~220 chars each)
//   3. Fetch ALL chunks in PARALLEL (Promise.all) → Kokoro handles each in ~2-4s
//   4. Merge all blobs into one WAV → single ObjectURL
//   5. Cache the merged blob for future sessions
//
// Result: First audio ready in ~3-5s instead of 60s!
// The parallel fetch means even 10 chunks complete in ~5s (not 10×5=50s).

export async function fetchNarrativeAudio(
  narrative: string,
  cacheId: string,
  lang: 'hi' | 'en' = 'en'
): Promise<string> {
  // 1. Cache hit → instant
  const cached = await getCachedBlob(cacheId);
  if (cached) {
    console.log(`[TTS] ⚡ Cache HIT for ${cacheId}`);
    return blobToObjectUrl(cached);
  }

  const cleanText = cleanTextForTTS(narrative);
  if (!cleanText.trim()) return '';

  console.log(`[TTS] Cache MISS — chunked parallel fetch (lang=${lang})...`);

  try {
    const chunks = splitIntoChunks(cleanText, 220);
    console.log(`[TTS] Split into ${chunks.length} chunks. Fetching in parallel...`);

    // ⚡ PARALLEL fetch — all chunks at once
    const blobResults = await Promise.allSettled(
      chunks.map((chunk, i) => {
        console.log(`[TTS] Chunk ${i + 1}/${chunks.length}: "${chunk.slice(0, 40)}..."`);
        return fetchKokoroChunk(chunk, lang);
      })
    );

    const successBlobs: Blob[] = [];
    for (const result of blobResults) {
      if (result.status === 'fulfilled') {
        successBlobs.push(result.value);
      } else {
        console.warn('[TTS] A chunk failed:', result.reason);
      }
    }

    if (successBlobs.length === 0) {
      throw new Error('All TTS chunks failed');
    }

    console.log(`[TTS] ${successBlobs.length}/${chunks.length} chunks succeeded. Merging...`);

    // Merge all blobs into one seamless audio
    const mergedBlob = successBlobs.length === 1
      ? successBlobs[0]
      : await mergeWavBlobs(successBlobs);

    // Cache for next time
    await setCachedBlob(cacheId, mergedBlob);

    const objectUrl = blobToObjectUrl(mergedBlob);
    console.log(`[TTS] ✅ Done. ObjectURL: ${objectUrl}`);
    return objectUrl;

  } catch (err) {
    console.error('[TTS] ❌ Chunked TTS FAILED:', err);
    return '';
  }
}

// ─── STREAMING: Plays first chunk immediately, queues rest ───────────────────
// Use this for instant playback feel. Calls onFirstChunkReady as soon as
// the first sentence audio is ready (typically 2-4 seconds).
// Remaining chunks play back-to-back automatically.

export async function streamNarrativeAudio(
  narrative: string,
  cacheId: string,
  lang: 'hi' | 'en' = 'en',
  onFirstChunkReady: (url: string) => void,
  onFullAudioReady: (url: string, duration: number) => void,
  signal?: AbortSignal
): Promise<void> {
  // Cache hit → play full audio immediately
  const cached = await getCachedBlob(cacheId);
  if (cached) {
    const url = blobToObjectUrl(cached);
    const duration = await getBlobDuration(url);
    onFirstChunkReady(url);
    onFullAudioReady(url, duration);
    return;
  }

  const cleanText = cleanTextForTTS(narrative);
  if (!cleanText.trim()) return;

  const chunks = splitIntoChunks(cleanText, 160); // smaller chunks = faster first audio
  console.log(`[TTS:stream] ${chunks.length} chunks, lang=${lang}`);

  if (signal?.aborted) return;

  try {
    // Fetch all in parallel (fastest overall approach)
    const blobPromises = chunks.map(chunk => fetchKokoroChunk(chunk, lang).catch(() => null));

    // First chunk fires onFirstChunkReady as soon as it resolves
    let firstFired = false;
    blobPromises[0]?.then(blob => {
      if (!blob || signal?.aborted) return;
      if (!firstFired) {
        firstFired = true;
        const firstUrl = blobToObjectUrl(blob);
        console.log('[TTS:stream] ⚡ First chunk ready — playing instantly');
        onFirstChunkReady(firstUrl);
      }
    });

    // Wait for all, then merge and cache
    const results = await Promise.allSettled(blobPromises);
    if (signal?.aborted) return;

    const blobs = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((b): b is Blob => b !== null && b.size > 100);

    if (blobs.length === 0) return;

    const merged = blobs.length === 1 ? blobs[0] : await mergeWavBlobs(blobs);
    await setCachedBlob(cacheId, merged);

    const finalUrl = blobToObjectUrl(merged);
    const duration = await getBlobDuration(finalUrl);
    onFullAudioReady(finalUrl, duration);

  } catch (err) {
    console.warn('[TTS:stream] Error:', err);
  }
}
