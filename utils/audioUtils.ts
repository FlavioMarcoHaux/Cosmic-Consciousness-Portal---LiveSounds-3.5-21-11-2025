
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

// Helper to chunk text smartly for TTS
export const chunkText = (text: string, maxLength = 600): string[] => {
    if (!text || typeof text !== 'string') return [""];

    const sentences = text.match(/[^.!?\n]+[.!?\n]+(\s|$)|[^.!?\n]+$/g);
    
    if (!sentences) return [text];

    const chunks: string[] = [];
    let currentChunk = '';

    for (const s of sentences) {
        const sentence = s; 

        if ((currentChunk + sentence).length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }

            if (sentence.length > maxLength) {
                const subChunks = sentence.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [sentence];
                subChunks.forEach((sub, index) => {
                    if (index === subChunks.length - 1) {
                        currentChunk = sub;
                    } else {
                        chunks.push(sub.trim());
                    }
                });
            } else {
                currentChunk = sentence;
            }
        } else {
            currentChunk += sentence;
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
};

// --- OPFS "Blade Runner" Implementation for Large Audio Files ---

export class OPFSWavBuilder {
    private fileHandle: FileSystemFileHandle | null = null;
    private writable: FileSystemWritableFileStream | null = null;
    private totalBytesWritten = 0;
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
            // @ts-ignore - createWritable exists in modern browsers but types might lag
            this.writable = await this.fileHandle.createWritable();
            
            // Reserve space for header (44 bytes)
            // We write dummy data first, will overwrite later.
            const dummyHeader = new Uint8Array(44);
            await this.writable?.write(dummyHeader);
            this.totalBytesWritten = 0; // Start counting DATA bytes
        } catch (e) {
            console.error("OPFS Init failed, fallback needed:", e);
            throw e;
        }
    }

    async appendChunk(audioData: Uint8Array) {
        if (!this.writable) return;
        
        // Gemini sends raw 16-bit PCM (Little Endian) inside the base64.
        // We just need to write these bytes directly.
        // If using decode() from this file, it returns Uint8Array which is exactly what we need.
        await this.writable.write(audioData);
        this.totalBytesWritten += audioData.byteLength;
    }

    async finalize(): Promise<Blob> {
        if (!this.writable || !this.fileHandle) throw new Error("Not initialized");

        // 1. Create Header
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        const length = this.totalBytesWritten + 44;

        const setUint16 = (pos: number, data: number) => { view.setUint16(pos, data, true); };
        const setUint32 = (pos: number, data: number) => { view.setUint32(pos, data, true); };

        setUint32(0, 0x46464952); // "RIFF"
        setUint32(4, length - 8); // file length - 8
        setUint32(8, 0x45564157); // "WAVE"

        setUint32(12, 0x20746d66); // "fmt "
        setUint32(16, 16); // length = 16
        setUint16(20, 1); // PCM
        setUint16(22, this.numChannels);
        setUint32(24, this.sampleRate);
        setUint32(28, this.sampleRate * 2 * this.numChannels); // avg bytes/sec
        setUint16(32, this.numChannels * 2); // block align
        setUint16(34, 16); // 16-bit

        setUint32(36, 0x61746164); // "data"
        setUint32(40, this.totalBytesWritten);

        // 2. Overwrite Header at position 0
        // Close stream first? No, we can seek if using SyncAccessHandle, but for createWritable we usually write sequentially.
        // Standard FileSystemWritableFileStream supports seek.
        await this.writable.seek(0);
        await this.writable.write(header);
        
        // 3. Close
        await this.writable.close();

        // 4. Return Blob
        const file = await this.fileHandle.getFile();
        return file;
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
