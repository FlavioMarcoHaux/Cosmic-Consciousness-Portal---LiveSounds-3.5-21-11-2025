
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getTextToSpeech } from '../services/geminiService';
import { decode, decodeAudioData, audioBufferToWav, chunkText, cleanTextForTTS } from '../utils/audioUtils';
import { PlaylistItem } from '../types';

interface AudioPlayerProps {
    playlist: PlaylistItem[];
    audioBlob?: Blob | null; // New prop for pre-generated long audio
}

type PlaybackState = 'idle' | 'playing' | 'paused';
type LoadingState = { [index: number]: boolean };
type BufferingProgress = { [index: number]: number };

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ playlist, audioBlob }) => {
    const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
    // Legacy (Short Form) State
    const [loadingState, setLoadingState] = useState<LoadingState>({});
    const [bufferingProgress, setBufferingProgress] = useState<BufferingProgress>({});
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
    
    const [error, setError] = useState<string | null>(null);
    
    // Playback Time State
    const [trackDuration, setTrackDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const currentTimeRef = useRef(0);
    const [savedTime, setSavedTime] = useState(0);

    // Context & Nodes
    const audioContextRef = useRef<AudioContext | null>(null);
    
    // Mode A: Buffer Based (Short)
    const audioBuffersRef = useRef<{ [index: number]: AudioBuffer }>({});
    const activeFetchesRef = useRef<{ [index: number]: Promise<AudioBuffer | null> }>({});
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef<number>(0); 
    
    // Mode B: Element Based (Long/Blob)
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

    const rafRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);
    const playRequestRef = useRef(0);

    // Broadcast Voice Activity for Ducking
    useEffect(() => {
        const isSpeaking = playbackState === 'playing';
        const event = new CustomEvent('cosmic-voice-change', { detail: { isPlaying: isSpeaking } });
        window.dispatchEvent(event);

        return () => {
             if (isSpeaking) {
                 const resetEvent = new CustomEvent('cosmic-voice-change', { detail: { isPlaying: false } });
                 window.dispatchEvent(resetEvent);
             }
        };
    }, [playbackState]);

    // Cleanup
    const stopPlayback = useCallback((newState: PlaybackState = 'idle') => {
        playRequestRef.current += 1; 
        
        // Cleanup Buffer Source
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.onended = null;
                currentSourceRef.current.stop();
            } catch (e) { /* ignore */ }
            currentSourceRef.current = null;
        }
        
        // Cleanup Audio Element
        if (audioElRef.current) {
            if (newState === 'idle') {
                audioElRef.current.pause();
                audioElRef.current.currentTime = 0;
                // Important: For blob mode, idle resets time.
                setSavedTime(0);
                setCurrentTime(0);
            } else if (newState === 'paused') {
                audioElRef.current.pause();
                // Important: Save time for resume
                setSavedTime(audioElRef.current.currentTime);
                setCurrentTime(audioElRef.current.currentTime);
            }
        }
        
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (newState === 'idle' && !audioBlob) {
             setSavedTime(0);
             setCurrentTime(0);
             currentTimeRef.current = 0;
             setTrackDuration(0);
        }

        setPlaybackState(newState);
        if (newState === 'idle') {
            setCurrentTrackIndex(null);
        }
    }, [audioBlob]); 
    
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            stopPlayback();
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, [stopPlayback]);

    // Reset on playlist/blob change
    useEffect(() => {
        // Only stop if the content *actually* changed significantly
        stopPlayback();
        audioBuffersRef.current = {};
        activeFetchesRef.current = {};
        setLoadingState({});
        setBufferingProgress({});
        setError(null);
    }, [playlist, audioBlob, stopPlayback]);

    // --- BLOB MODE INIT ---
    useEffect(() => {
        if (audioBlob && audioElRef.current) {
            const url = URL.createObjectURL(audioBlob);
            audioElRef.current.src = url;
            audioElRef.current.load(); // Force load
            
            // Ensure AudioContext exists for visualization/routing if needed
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }

            // Setup MediaElementSource if not exists
            if (!mediaSourceNodeRef.current && audioContextRef.current) {
                try {
                    mediaSourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioElRef.current);
                    mediaSourceNodeRef.current.connect(audioContextRef.current.destination);
                } catch(e) {
                    console.warn("MediaElementSource creation failed (likely already connected):", e);
                }
            }
            
            // Listen for metadata to set duration
            audioElRef.current.onloadedmetadata = () => {
                if (audioElRef.current) setTrackDuration(audioElRef.current.duration);
            };

            return () => {
                URL.revokeObjectURL(url);
            };
        }
    }, [audioBlob]);

    // Animation Loop
    const updateProgress = () => {
        if (playbackState === 'playing') {
            if (audioBlob && audioElRef.current) {
                // Blob Mode Time
                const t = audioElRef.current.currentTime;
                setCurrentTime(t);
                currentTimeRef.current = t;
                // Update duration in case it wasn't ready
                if (!trackDuration && audioElRef.current.duration) setTrackDuration(audioElRef.current.duration);
            } else if (audioContextRef.current) {
                // Buffer Mode Time
                const now = audioContextRef.current.currentTime;
                const elapsed = now - startTimeRef.current;
                currentTimeRef.current = elapsed;
                if (elapsed <= trackDuration) {
                    setCurrentTime(elapsed);
                } else {
                    setCurrentTime(trackDuration);
                }
            }
            rafRef.current = requestAnimationFrame(updateProgress);
        }
    };

    useEffect(() => {
        if (playbackState === 'playing') {
            rafRef.current = requestAnimationFrame(updateProgress);
        } else if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [playbackState, trackDuration, audioBlob]);


    // --- BUFFER MODE HELPERS ---
    const prepareAudioBuffer = useCallback(async (index: number): Promise<AudioBuffer | null> => {
        if (audioBuffersRef.current[index]) return audioBuffersRef.current[index];
        if (activeFetchesRef.current[index]) return activeFetchesRef.current[index];

        const textToProcess = playlist[index]?.text;
        if (!textToProcess) return null;

        const fetchPromise = (async () => {
            if (!isMountedRef.current) return null;
            setLoadingState(prev => ({ ...prev, [index]: true }));
            setBufferingProgress(prev => ({ ...prev, [index]: 0 }));
            setError(null);
            
            try {
                // CLEAN TEXT HERE for Playlist Mode
                const cleanedText = cleanTextForTTS(textToProcess);
                const textChunks = chunkText(cleanedText);
                
                if (textChunks.length === 0) throw new Error("Texto vazio.");

                const audioDataChunks: Uint8Array[] = [];
                for (let i = 0; i < textChunks.length; i++) {
                    if (!isMountedRef.current) return null;
                    const base64Audio = await getTextToSpeech(textChunks[i]);
                    if (!base64Audio) throw new Error(`Falha no bloco ${i + 1}.`);
                    audioDataChunks.push(decode(base64Audio));
                    if (isMountedRef.current) setBufferingProgress(prev => ({ ...prev, [index]: (i + 1) / textChunks.length }));
                }

                if (!isMountedRef.current) return null;

                const totalLength = audioDataChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const stitchedAudioData = new Uint8Array(totalLength);
                let offset = 0;
                audioDataChunks.forEach(chunk => {
                    stitchedAudioData.set(chunk, offset);
                    offset += chunk.length;
                });
                
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                if (audioContextRef.current.state === 'suspended') {
                    await audioContextRef.current.resume();
                }

                const buffer = await decodeAudioData(stitchedAudioData, audioContextRef.current, 24000, 1);
                if (isMountedRef.current) audioBuffersRef.current[index] = buffer;
                return buffer;

            } catch (e) {
                console.error(`Fetch error track ${index}:`, e);
                if (isMountedRef.current) {
                    setError(`Erro ao carregar áudio.`);
                    delete activeFetchesRef.current[index];
                }
                return null;
            } finally {
                if (isMountedRef.current) setLoadingState(prev => ({ ...prev, [index]: false }));
            }
        })();

        activeFetchesRef.current[index] = fetchPromise;
        return fetchPromise;
    }, [playlist]);

    const playTrack = useCallback(async (index: number, isContinuousPlay: boolean, startOffset: number = 0) => {
        // BLOB MODE
        if (audioBlob) {
            if (!audioElRef.current) return;
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
            
            setPlaybackState('playing');
            setCurrentTrackIndex(0); // Blob is always track 0 conceptually
            
            // Always respect the offset if provided, otherwise rely on element's current time if resuming
            if (typeof startOffset === 'number') {
                audioElRef.current.currentTime = startOffset;
            }
            
            audioElRef.current.play().catch(e => console.error("Play failed", e));
            
            // Setup handlers
            audioElRef.current.onended = () => stopPlayback('idle');
            
            return;
        }

        // BUFFER MODE
        const currentRequestId = playRequestRef.current;
        if (index >= playlist.length) {
            if (isMountedRef.current) stopPlayback();
            return;
        }
        
        if (currentSourceRef.current) {
             try { currentSourceRef.current.stop(); } catch(e) {}
             currentSourceRef.current = null;
        }
        
        if (!isMountedRef.current) return;
        
        setPlaybackState('playing');
        setCurrentTrackIndex(index);

        const buffer = await prepareAudioBuffer(index);

        if (playRequestRef.current !== currentRequestId || !isMountedRef.current) return;

        if (buffer) {
            setTrackDuration(buffer.duration);
            const offset = Math.min(Math.max(0, startOffset), buffer.duration);
            setCurrentTime(offset);
            currentTimeRef.current = offset;
            
            if (audioContextRef.current) {
                startTimeRef.current = audioContextRef.current.currentTime - offset;
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                
                source.onended = () => {
                    if (isMountedRef.current && playRequestRef.current === currentRequestId) {
                        const now = audioContextRef.current?.currentTime || 0;
                        const elapsed = now - startTimeRef.current;
                        if (elapsed >= buffer.duration - 0.5) {
                            currentSourceRef.current = null;
                            if (isContinuousPlay) playTrack(index + 1, true, 0);
                            else stopPlayback();
                        }
                    }
                };
                source.start(0, offset);
                currentSourceRef.current = source;
                if (isContinuousPlay && (index + 1) < playlist.length) prepareAudioBuffer(index + 1);
            }
        } else {
             if (isContinuousPlay) playTrack(index + 1, true, 0);
             else stopPlayback();
        }

    }, [playlist.length, prepareAudioBuffer, stopPlayback, audioBlob]);

    const handleMasterPlay = () => {
        playRequestRef.current += 1;
        if (playbackState === 'playing') {
            stopPlayback('paused');
        } else if (playbackState === 'paused') {
            // Resume logic
            if (audioBlob && audioElRef.current) {
                // For blob, just call play, element handles time
                playTrack(0, true, audioElRef.current.currentTime); 
            } else {
                // For buffer, use savedTime
                playTrack(currentTrackIndex !== null ? currentTrackIndex : 0, true, savedTime);
            }
        } else {
            // Start from scratch
            playTrack(0, true, 0);
        }
    };

    const handleTrackClick = (index: number) => {
        // In Blob mode, track click on the single item essentially acts as Master Play/Pause
        if (audioBlob) {
            handleMasterPlay();
            return;
        }

        playRequestRef.current += 1;
        if (currentTrackIndex === index && playbackState === 'playing') {
            stopPlayback('paused');
        } else if (currentTrackIndex === index && playbackState === 'paused') {
             playTrack(index, false, savedTime);
        } else {
            playTrack(index, false, 0);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
        currentTimeRef.current = newTime;
        setSavedTime(newTime); 

        if (audioBlob && audioElRef.current) {
            audioElRef.current.currentTime = newTime;
            return;
        }

        if (playbackState === 'playing' && currentTrackIndex !== null) {
            playRequestRef.current += 1; 
            if (currentSourceRef.current) {
                try { currentSourceRef.current.stop(); } catch(e) {}
            }
            playTrack(currentTrackIndex, true, newTime);
        }
    };
    
    const handleDownload = async (index: number) => {
        if (audioBlob) {
             const url = URL.createObjectURL(audioBlob);
             const a = document.createElement('a');
             a.style.display = 'none';
             a.href = url;
             a.download = `session_${Date.now()}.wav`;
             document.body.appendChild(a);
             a.click();
             window.URL.revokeObjectURL(url);
             document.body.removeChild(a);
             return;
        }

        const buffer = await prepareAudioBuffer(index);
        if (!buffer) return;
        try {
            const wavBlob = audioBufferToWav(buffer);
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${playlist[index].title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.wav`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error("Download failed:", e);
            setError("Erro no download.");
        }
    };
    
    const getTrackIcon = (index: number) => {
        // For blob mode, we treat index 0 as the main track
        const isTarget = audioBlob ? true : currentTrackIndex === index;
        
        if (loadingState[index] && !audioBlob) {
             return <svg className="h-6 w-6 text-purple-300 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;
        }
        if (playbackState === 'playing' && isTarget) return <svg className="h-6 w-6 text-cyan-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
        if (playbackState === 'paused' && isTarget) return <svg className="h-6 w-6 text-amber-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>;
        return <svg className="h-6 w-6 text-purple-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>;
    }

    if (!playlist || !Array.isArray(playlist) || playlist.length === 0) return null;

    return (
        <div className="w-full space-y-4">
            {/* Hidden Audio Element for Blob Mode */}
            <audio ref={audioElRef} className="hidden" preload="auto" />

            <button
                onClick={handleMasterPlay}
                disabled={playlist.length === 0} 
                className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-indigo-600/80 text-indigo-100 text-lg rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-60 shadow-lg shadow-indigo-900/40 backdrop-blur-md border border-indigo-400/30"
            >
                {playbackState === 'playing' ? (
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                )}
                <span className="font-bold tracking-wide">
                    {playbackState === 'playing' ? 'Pausar Sessão' : playbackState === 'paused' ? 'Continuar Sessão' : 'Iniciar Sessão'}
                </span>
            </button>
            
            <div className="space-y-3 pt-2">
                {playlist.map((item, index) => {
                    // In Blob mode, only the first track UI is "active" conceptually for controls, 
                    // or we treat the whole playlist as one block.
                    // For simplicity, if audioBlob exists, we assume the playlist describes the blob content.
                    const isActive = audioBlob ? true : currentTrackIndex === index;
                    
                    // If blob mode, only show controls for the first item (which represents the full session)
                    // or simply duplicate controls. Let's show controls on the first item only for Blob mode.
                    const showControls = isActive && (!audioBlob || index === 0);

                    return (
                        <div key={index} 
                            className={`p-4 rounded-xl transition-all duration-300 border shadow-md
                            ${isActive 
                                ? 'bg-purple-900/30 border-purple-400/50 shadow-purple-900/20' 
                                : 'bg-black/20 border-white/5 hover:bg-white/5 cursor-pointer'}`}
                            onClick={() => !isActive && handleTrackClick(index)}
                        >
                            <div className="flex items-start">
                                <button 
                                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors mr-3"
                                    onClick={(e) => { e.stopPropagation(); handleTrackClick(index); }}
                                >
                                    {getTrackIcon(index)}
                                </button>

                                <div className="flex-grow overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <h4 className={`font-semibold truncate ${isActive ? 'text-cyan-200' : 'text-purple-200'}`}>{item.title}</h4>
                                        {/* Download is handled differently for blob vs individual buffers */}
                                        {(!audioBlob || index === 0) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDownload(index); }}
                                                disabled={!audioBlob && loadingState[index]}
                                                className="text-purple-300/40 hover:text-purple-200 disabled:opacity-0 transition-colors ml-2"
                                                title="Baixar"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    {showControls && (
                                        <div className="mt-3 animate-fadeIn">
                                            {/* Progress Bar */}
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs text-cyan-300/70 font-mono min-w-[35px]">{formatTime(currentTime)}</span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max={trackDuration || 100}
                                                    value={currentTime}
                                                    onChange={handleSeek}
                                                    disabled={!audioBlob && loadingState[index]}
                                                    className="flex-grow h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 focus:outline-none"
                                                />
                                                <span className="text-xs text-purple-300/50 font-mono min-w-[35px]">{formatTime(trackDuration)}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="relative mt-1">
                                        <p className={`text-sm text-indigo-200/80 font-serif whitespace-pre-wrap transition-opacity duration-300 ${loadingState[index] ? 'opacity-40' : 'opacity-100'} ${!isActive ? 'line-clamp-2' : ''}`}>
                                            {item.text}
                                        </p>
                                        
                                        {/* Buffering Overlay - Only for Buffer Mode */}
                                        {!audioBlob && loadingState[index] && (
                                            <div className="absolute inset-0 flex flex-col justify-center items-center backdrop-blur-[2px] rounded-md">
                                                <div className="w-3/4 bg-purple-900/50 rounded-full h-1.5 overflow-hidden">
                                                    <div 
                                                        className="bg-cyan-400 h-full rounded-full transition-all duration-300" 
                                                        style={{ width: `${(bufferingProgress[index] || 0) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <p className="text-[10px] text-cyan-200/80 mt-1 uppercase tracking-widest">
                                                    Sintonizando... {Math.round((bufferingProgress[index] || 0) * 100)}%
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {error && <p className="text-sm text-red-400 mt-2 text-center bg-red-900/20 py-2 rounded-lg animate-fadeIn">{error}</p>}
        </div>
    );
};

export default AudioPlayer;
