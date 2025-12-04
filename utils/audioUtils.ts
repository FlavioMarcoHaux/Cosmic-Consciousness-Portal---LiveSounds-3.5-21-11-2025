
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function mergeAudioBuffers(buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const numberOfChannels = buffers[0].numberOfChannels;
    const result = ctx.createBuffer(numberOfChannels, totalLength, buffers[0].sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = result.getChannelData(channel);
        let offset = 0;
        for (const buffer of buffers) {
            channelData.set(buffer.getChannelData(channel), offset);
            offset += buffer.length;
        }
    }
    return result;
}


export function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([bufferArray], { type: "audio/wav" });
}

// Helper to clean text for TTS (Remove metadata like [GANCHO], (Voz suave), ### Title)
export const cleanTextForTTS = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\[PAUSA:\s*\d+\]/gi, '') // Remove pause tags
        .replace(/\[.*?\]/g, '') // Remove other Metadata
        .replace(/\(.*?\)/g, '') // Remove (Instructions)
        .replace(/#{1,6}\s?/g, '') // Remove Markdown Headers (###)
        .replace(/\*\*/g, '') // Remove Bold
        .replace(/\*/g, '')    // Remove Italics
        .replace(/^\s*-\s/gm, '') // Remove list bullets
        .replace(/\s{2,}/g, ' ') // Collapse spaces
        .trim();
};

// --- SILENCE BLOCK GENERATOR ---
export const createSilencePCM = (seconds: number, sampleRate: number = 24000): Uint8Array => {
    const numSamples = Math.floor(seconds * sampleRate);
    const numBytes = numSamples * 2; // 16-bit = 2 bytes per sample
    return new Uint8Array(numBytes); // Initialized to 0 by default (Silence)
};

// --- SCRIPT PARSER (BLOCKS) ---
export type AudioBlock = { type: 'text', content: string } | { type: 'pause', duration: number };

export const parseScriptToBlocks = (fullText: string): AudioBlock[] => {
    const blocks: AudioBlock[] = [];
    const parts = fullText.split(/\[PAUSA:\s*(\d+)\]/i);
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 0) {
            // Text
            if (part.trim().length > 0) {
                blocks.push({ type: 'text', content: part });
            }
        } else {
            // Pause Duration
            const duration = parseInt(part, 10);
            if (!isNaN(duration) && duration > 0) {
                blocks.push({ type: 'pause', duration: duration });
            }
        }
    }
    return blocks;
};

// --- OPTIMIZED SEMANTIC CHUNKER ---
// Splits text into small, coherent blocks for fast TTS generation without context loss.
export const chunkText = (text: string, maxLength = 450): string[] => {
    if (!text || typeof text !== 'string') return [""];

    const finalChunks: string[] = [];
    
    // 1. First split by Double Newlines (Paragraphs/Sections)
    // This preserves the structure of "Chapters" in the meditation.
    const paragraphs = text.split(/\n\s*\n/);

    for (const paragraph of paragraphs) {
        const cleanPara = paragraph.trim();
        if (!cleanPara) continue;

        if (cleanPara.length <= maxLength) {
            finalChunks.push(cleanPara);
        } else {
            // 2. If Paragraph is too long, split by Sentence Terminators
            // Look for . ! ? followed by space or end of string
            const sentences = cleanPara.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
            
            if (!sentences) {
                // Fallback if regex fails (rare)
                finalChunks.push(cleanPara); 
                continue;
            }

            let currentChunk = '';

            for (const sentence of sentences) {
                // 3. Accumulate sentences until limit
                if ((currentChunk + sentence).length > maxLength) {
                    if (currentChunk.trim()) {
                        finalChunks.push(currentChunk.trim());
                        currentChunk = '';
                    }
                    
                    // 4. Handle Extremely Long Sentences (Emergency Split by comma/colon)
                    if (sentence.length > maxLength) {
                        const subChunks = sentence.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [sentence];
                        subChunks.forEach((sub) => finalChunks.push(sub.trim()));
                    } else {
                        currentChunk = sentence;
                    }
                } else {
                    currentChunk += sentence;
                }
            }
            
            if (currentChunk.trim()) {
                finalChunks.push(currentChunk.trim());
            }
        }
    }
    
    return finalChunks;
};

// --- OPFS IMPLEMENTATION ---
export class OPFSWavBuilder {
    private fileHandle: FileSystemFileHandle | null = null;
    private writable: FileSystemWritableFileStream | null = null;
    private sampleRate = 24000;
    private numChannels = 1;
    private fileName: string;

    constructor(fileName: string = "recording.wav") {
        this.fileName = fileName;
    }

    async init() {
        try {
            const root = await navigator.storage.getDirectory();
            this.fileHandle = await root.getFileHandle(this.fileName, { create: true });
            // @ts-ignore 
            this.writable = await this.fileHandle.createWritable();
            const dummyHeader = new Uint8Array(44);
            await this.writable?.write(dummyHeader);
        } catch (e) {
            console.error("OPFS Init failed:", e);
            throw e;
        }
    }

    async appendChunk(audioData: Uint8Array) {
        if (!this.writable) return;
        await this.writable.write(audioData);
    }

    async finalize(): Promise<Blob> {
        if (!this.writable || !this.fileHandle) throw new Error("Not initialized");

        await this.writable.close();

        const file = await this.fileHandle.getFile();
        const totalFileSize = file.size;
        const dataSize = totalFileSize - 44;

        if (dataSize < 0) throw new Error("File too small");

        // @ts-ignore
        this.writable = await this.fileHandle.createWritable({ keepExistingData: true });

        const header = new ArrayBuffer(44);
        const view = new DataView(header);

        const setUint16 = (pos: number, data: number) => { view.setUint16(pos, data, true); };
        const setUint32 = (pos: number, data: number) => { view.setUint32(pos, data, true); };

        setUint32(0, 0x46464952); // RIFF
        setUint32(4, totalFileSize - 8); 
        setUint32(8, 0x45564157); // WAVE
        setUint32(12, 0x20746d66); // fmt
        setUint32(16, 16); 
        setUint16(20, 1); 
        setUint16(22, this.numChannels);
        setUint32(24, this.sampleRate);
        setUint32(28, this.sampleRate * 2 * this.numChannels);
        setUint16(32, this.numChannels * 2); 
        setUint16(34, 16); 
        setUint32(36, 0x61746164); // data
        setUint32(40, dataSize); 

        await this.writable.seek(0);
        await this.writable.write(header);
        await this.writable.close();

        return await this.fileHandle.getFile();
    }
    
    async cleanup() {
        try {
             const root = await navigator.storage.getDirectory();
             await root.removeEntry(this.fileName);
        } catch(e) {
            console.warn("Cleanup failed", e);
        }
    }
}
