
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
            
            // Reserve space for header (44 bytes) with dummy data
            const dummyHeader = new Uint8Array(44);
            await this.writable?.write(dummyHeader);
        } catch (e) {
            console.error("OPFS Init failed:", e);
            throw e;
        }
    }

    async appendChunk(audioData: Uint8Array) {
        if (!this.writable) return;
        // Write raw PCM bytes directly to stream
        await this.writable.write(audioData);
    }

    async finalize(): Promise<Blob> {
        if (!this.writable || !this.fileHandle) throw new Error("Not initialized");

        // 1. Close the stream to ensure all data chunks are flushed to disk.
        await this.writable.close();

        // 2. Get the actual file size from the file system to be 100% accurate.
        const file = await this.fileHandle.getFile();
        const totalFileSize = file.size;
        const dataSize = totalFileSize - 44; // Subtract header space

        if (dataSize < 0) throw new Error("File too small / invalid");

        // 3. Re-open writable stream to update the header.
        // We must use keepExistingData: true to not wipe the audio we just wrote.
        // @ts-ignore
        this.writable = await this.fileHandle.createWritable({ keepExistingData: true });

        // 4. Create Correct Header
        const header = new ArrayBuffer(44);
        const view = new DataView(header);

        const setUint16 = (pos: number, data: number) => { view.setUint16(pos, data, true); };
        const setUint32 = (pos: number, data: number) => { view.setUint32(pos, data, true); };

        setUint32(0, 0x46464952); // "RIFF"
        setUint32(4, totalFileSize - 8); // File size - 8
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
        setUint32(40, dataSize); // Actual data size

        // 5. Write Header at position 0
        await this.writable.seek(0);
        await this.writable.write(header);
        
        // 6. Close final
        await this.writable.close();

        // 7. Return the final, corrected Blob
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
