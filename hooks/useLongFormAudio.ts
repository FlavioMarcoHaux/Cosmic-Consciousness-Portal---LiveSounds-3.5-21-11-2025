
import { useState, useCallback, useRef } from 'react';
import { OPFSWavBuilder, decode, chunkText } from '../utils/audioUtils';
import { getTextToSpeech } from '../services/geminiService';

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
            const chunks = chunkText(text);
            if (chunks.length === 0) {
                throw new Error("Texto vazio.");
            }

            const filename = `${filenamePrefix}_${Date.now()}.wav`;
            const wavBuilder = new OPFSWavBuilder(filename);
            await wavBuilder.init();

            for (let i = 0; i < chunks.length; i++) {
                if (abortControllerRef.current.signal.aborted) {
                    throw new Error("Aborted");
                }

                const chunk = chunks[i];
                // Simple retry logic
                let base64Audio = null;
                let retries = 3;
                while(retries > 0 && !base64Audio) {
                    try {
                        base64Audio = await getTextToSpeech(chunk);
                    } catch(e) {
                        console.warn(`Retrying audio generation for chunk ${i+1}/${chunks.length}...`, e);
                        retries--;
                        await new Promise(r => setTimeout(r, 1500)); // Wait before retry
                    }
                }

                if (!base64Audio) throw new Error(`Falha ao gerar áudio para a parte ${i + 1}`);

                const audioData = decode(base64Audio);
                await wavBuilder.appendChunk(audioData);

                setProgress(Math.round(((i + 1) / chunks.length) * 100));
            }

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
