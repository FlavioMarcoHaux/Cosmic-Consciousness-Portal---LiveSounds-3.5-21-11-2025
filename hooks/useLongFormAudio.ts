
import { useState, useCallback, useRef } from 'react';
import { OPFSWavBuilder, decode, chunkText, cleanTextForTTS, parseScriptToBlocks, createSilencePCM, AudioBlock } from '../utils/audioUtils';
import { getTextToSpeech } from '../services/geminiService';

// Define a unified operation type for the processing queue
type AudioOperation = 
    | { type: 'pause'; duration: number }
    | { type: 'text'; content: string };

export const useLongFormAudio = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const generateAudio = useCallback(async (text: string, filenamePrefix: string = 'session') => {
        setIsGenerating(true);
        setProgress(0);
        setAudioBlob(null);
        setError(null);
        
        abortControllerRef.current = new AbortController();

        try {
            // STEP 1: PARSE SCRIPT INTO BLOCKS
            const blocks = parseScriptToBlocks(text);
            
            if (blocks.length === 0) {
                throw new Error("Texto vazio.");
            }

            // STEP 2: FLATTEN THE QUEUE
            // We break down text blocks into smaller TTS chunks *before* processing.
            // This allows us to calculate the total number of API calls/operations required
            // and update the progress bar granularly, avoiding the "stuck at 0%" issue.
            const operationsQueue: AudioOperation[] = [];

            for (const block of blocks) {
                if (block.type === 'pause') {
                    operationsQueue.push({ type: 'pause', duration: block.duration });
                } else if (block.type === 'text') {
                    const cleanedText = cleanTextForTTS(block.content);
                    // Split massive text into smaller chunks for the API
                    const textChunks = chunkText(cleanedText);
                    textChunks.forEach(chunk => {
                        if (chunk.trim().length > 0) {
                            operationsQueue.push({ type: 'text', content: chunk });
                        }
                    });
                }
            }

            const totalOperations = operationsQueue.length;
            if (totalOperations === 0) throw new Error("Nenhum conteúdo processável encontrado.");

            // STEP 3: INITIALIZE FILE BUILDER
            const filename = `${filenamePrefix}_${Date.now()}.wav`;
            const wavBuilder = new OPFSWavBuilder(filename);
            await wavBuilder.init();

            // STEP 4: PROCESS QUEUE LINEARLY
            for (let i = 0; i < totalOperations; i++) {
                if (abortControllerRef.current.signal.aborted) {
                    throw new Error("Aborted");
                }

                const op = operationsQueue[i];

                if (op.type === 'pause') {
                    // Generate Silence
                    const silenceBytes = createSilencePCM(op.duration, 24000);
                    await wavBuilder.appendChunk(silenceBytes);
                } else if (op.type === 'text') {
                    // Generate TTS
                    let base64Audio = null;
                    let retries = 3;
                    
                    while(retries > 0 && !base64Audio) {
                        try {
                            if (abortControllerRef.current.signal.aborted) throw new Error("Aborted");
                            base64Audio = await getTextToSpeech(op.content);
                        } catch(e) {
                            console.warn(`Retrying TTS generation... (${retries} left)`, e);
                            retries--;
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }

                    if (!base64Audio) throw new Error(`Falha ao gerar áudio para o trecho: "${op.content.substring(0, 20)}..."`);

                    const audioData = decode(base64Audio);
                    await wavBuilder.appendChunk(audioData);
                }

                // Update Progress Granularly
                setProgress(Math.round(((i + 1) / totalOperations) * 100));
            }

            // STEP 5: FINALIZE
            const blob = await wavBuilder.finalize();
            setAudioBlob(blob);

        } catch (e: any) {
            if (e.message !== 'Aborted') {
                console.error("Long form audio generation failed", e);
                setError("Falha na materialização do áudio. Verifique sua conexão.");
            }
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    }, []);

    const cancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setIsGenerating(false);
    }, []);

    const reset = useCallback(() => {
        setAudioBlob(null);
        setProgress(0);
        setError(null);
        setIsGenerating(false);
    }, []);

    return { generateAudio, isGenerating, progress, audioBlob, error, cancel, reset };
};
