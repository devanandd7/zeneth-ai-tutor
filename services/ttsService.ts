const DB_NAME = 'ZenithTTSDB';
const STORE_NAME = 'audioBlobs';
const DB_VERSION = 1;

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
/**
 * Cleans narrative text before sending to TTS.
 * LaTeX math like \xrightarrow, _{2}, $$...$$ is stripped/converted to readable form.
 */
export function cleanTextForTTS(text: string): string {
  return text
    // Remove display math blocks: $$ ... $$ or \[ ... \]
    .replace(/\$\$[\s\S]*?\$\$/g, '. (mathematical formula) ')
    .replace(/\\\[[\s\S]*?\\\]/g, '. (mathematical formula) ')
    // Remove inline math: $...$ or \( ... \)
    .replace(/\\\([\s\S]*?\\\)/g, ' (formula) ')
    .replace(/\$[^$\n]+\$/g, ' (formula) ')
    // Convert common chemical/math symbols to words
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
    // Clean subscripts/superscripts: _2 → subscript 2, ^2 → squared
    .replace(/_\{([^}]*)\}/g, ' $1')
    .replace(/\^\{([^}]*)\}/g, ' to the power of $1')
    .replace(/_(\w)/g, ' $1')
    .replace(/\^(\w)/g, ' to the power $1')
    // Remove remaining LaTeX commands like \text{ }, \ce{ }, etc.
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\ce\{([^}]*)\}/g, '$1')
    .replace(/\\\w+/g, '') // Remove all other backslash commands
    .replace(/[{}]/g, '') // Remove braces
    // Strip markdown formatting
    .replace(/```[\s\S]*?```/g, '(code example)')
    .replace(/`[^`]+`/g, '')
    .replace(/#+\s+/g, '') // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')   // italic
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[-*•]\s/g, ', ') // list bullets → commas
    .replace(/\|[^|]+\|/g, '') // table cells
    // Clean up extra whitespace and punctuation
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .trim();
}

// ─── Strategy 1: StreamElements API (Amazon Polly) ────────────────────────────
// StreamElements natively allows CORS and requires no API key for standard voices.
// We use 'Joanna' for a high-quality US Female voice as requested.

async function fetchStreamElementsTTS(text: string): Promise<Blob> {
  const cleanText = encodeURIComponent(text.trim());
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=Joanna&text=${cleanText}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`StreamElements TTS failed: ${response.status}`);
    }
    
    const blob = await response.blob();
    if (blob.size < 100) throw new Error('Empty response');
    return blob;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Strategy 2: Browser Web Speech API → MediaRecorder capture ───────────────

async function captureSpeechAsBlob(text: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('No speechSynthesis'));
      return;
    }

    const audioCtx = new AudioContext();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Find best voice
    let voices = window.speechSynthesis.getVoices();
    const premiumVoice = 
      voices.find(v => v.name.includes('Aria') || v.name.includes('Jenny') || v.name.includes('Zira') || (v.name.includes('Female') && v.lang.startsWith('en'))) ||
      voices.find(v => v.name.includes('Google US English') || v.name.includes('Google UK English Female')) ||
      voices.find(v => (v.name.includes('Natural') || v.name.includes('Online')) && v.lang.startsWith('en')) ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0];
    if (premiumVoice) utterance.voice = premiumVoice;
    
    utterance.rate = 1;
    
    let startTime = 0;
    utterance.onstart = () => { startTime = Date.now(); };
    utterance.onend = () => {
      const durationMs = Date.now() - startTime;
      audioCtx.close();
      const silenceBlob = createSilenceWav(durationMs / 1000);
      resolve(silenceBlob);
    };
    utterance.onerror = () => {
      audioCtx.close();
      reject(new Error('Speech synthesis failed'));
    };

    window.speechSynthesis.speak(utterance);
    
    setTimeout(() => {
      window.speechSynthesis.cancel();
      audioCtx.close();
      reject(new Error('Speech timeout'));
    }, 30000);
  });
}

// Generates a valid WAV file with silence of given duration
function createSilenceWav(durationSec: number): Blob {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  
  return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Main TTS Pipeline ───────────────────────────────────────────────────────

export async function fetchNarrativeAudio(narrative: string, cacheId: string): Promise<string> {
  const cached = await getCachedBlob(cacheId);
  if (cached) return blobToDataUrl(cached);

  const cleanNarrative = cleanTextForTTS(narrative);

  const sentences = cleanNarrative.match(/[^.!?]+[.!?]+|\s*$/g) || [cleanNarrative];
  const chunks: string[] = [];
  let currentChunk = '';
  
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    if (currentChunk.length + trimmed.length < 350) {
      currentChunk += ' ' + trimmed;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = trimmed;
    }
  });
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  if (chunks.length === 0) return '';

  const audioBlobs: Blob[] = [];
  let gotAudio = false;

  for (const chunk of chunks) {
    if (!chunk) continue;
    try {
      const blob = await fetchStreamElementsTTS(chunk);
      audioBlobs.push(blob);
      gotAudio = true;
    } catch (e) {
      console.warn('StreamElements TTS failed for chunk:', e);
    }
  }

  if (!gotAudio || audioBlobs.length === 0) {
    console.warn('TTS API unavailable. Falling back to live Web Speech API during playback.');
    return '';
  }

  // Combine MP3 blobs
  const finalBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
  
  // Cache to IndexedDB
  await setCachedBlob(cacheId, finalBlob);

  // Return as data URL (works with both HTML Audio + Remotion)
  return blobToDataUrl(finalBlob);
}

// ─── Blob → Data URL converter (critical for Remotion compatibility) ──────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Duration Prober ──────────────────────────────────────────────────────────

export async function getBlobDuration(dataUrl: string): Promise<number> {
  if (!dataUrl) return 20;
  
  return new Promise((resolve) => {
    const audio = new Audio(dataUrl);
    
    const timeout = setTimeout(() => resolve(20), 5000); // 5s safety
    
    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        // Workaround for merged MP3 blobs
        audio.currentTime = 1e10;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          clearTimeout(timeout);
          const dur = isNaN(audio.duration) || audio.duration === Infinity ? 20 : audio.duration;
          resolve(dur);
          audio.currentTime = 0;
        };
      } else {
        clearTimeout(timeout);
        resolve(audio.duration);
      }
    };
    
    audio.onerror = () => {
      clearTimeout(timeout);
      resolve(20);
    };
  });
}
