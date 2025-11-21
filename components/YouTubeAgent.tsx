
import React, { useState, useEffect, useRef } from 'react';
import { getYouTubeSEO, generateVisionImage, getYouTubeThumbnailPrompt, getTextToSpeech } from '../services/geminiService';
import { YouTubeSEO, MarketingHistoryItem } from '../types';
import JSZip from 'jszip';
import { decode, decodeAudioData, audioBufferToWav, mergeAudioBuffers } from '../utils/audioUtils';

interface YouTubeAgentProps {
    theme: string;
    focus: string;
}

const YouTubeAgent: React.FC<YouTubeAgentProps> = ({ theme, focus }) => {
    const [isSeoLoading, setIsSeoLoading] = useState(false);
    const [isThumbLoading, setIsThumbLoading] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    
    const [data, setData] = useState<YouTubeSEO | null>(null);
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    
    const [isOpen, setIsOpen] = useState(false);
    const [language, setLanguage] = useState<'pt' | 'en'>('pt');
    
    // History State
    const [history, setHistory] = useState<MarketingHistoryItem[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Load history on mount
    useEffect(() => {
        const savedHistory = localStorage.getItem('marketing_history');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) { console.error("Failed to load history", e); }
        }
    }, []);

    // Duck audio when open
    useEffect(() => {
        const event = new CustomEvent('cosmic-voice-change', { detail: { isPlaying: isOpen } });
        window.dispatchEvent(event);
        return () => {
             const reset = new CustomEvent('cosmic-voice-change', { detail: { isPlaying: false } });
             window.dispatchEvent(reset);
        }
    }, [isOpen]);

    const saveToHistory = (seoData: YouTubeSEO, thumbPrompt: string | null) => {
        const newItem: MarketingHistoryItem = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            theme: theme,
            focus: focus,
            language: language,
            data: seoData,
            thumbnailPrompt: thumbPrompt
        };
        const newHistory = [newItem, ...history].slice(0, 20); // Keep last 20
        setHistory(newHistory);
        localStorage.setItem('marketing_history', JSON.stringify(newHistory));
    };

    const handleGenerateSEO = async () => {
        setIsSeoLoading(true);
        setIsOpen(true);
        setData(null);
        setThumbnailUrl(null);
        setAudioBlob(null);
        
        try {
            // 1. Generate Text SEO
            const seoData = await getYouTubeSEO(theme, focus, language);
            if (seoData) {
                setData(seoData);
                saveToHistory(seoData, null);
            }
        } catch (e) {
            console.error("Marketing Agent Error:", e);
        } finally {
            setIsSeoLoading(false);
        }
    };

    const handleGenerateThumbnail = async () => {
        if (!data || !data.titles || data.titles.length === 0) return;
        
        setIsThumbLoading(true);
        try {
            const bestTitle = data.titles[0];
            const imagePrompt = await getYouTubeThumbnailPrompt(bestTitle, theme, language);
            
            if (imagePrompt) {
                const image = await generateVisionImage(imagePrompt);
                setThumbnailUrl(image);
                // Update history with thumb prompt
                if (history.length > 0 && history[0].data.description === data.description) {
                    const updatedHistory = [...history];
                    updatedHistory[0].thumbnailPrompt = imagePrompt;
                    setHistory(updatedHistory);
                    localStorage.setItem('marketing_history', JSON.stringify(updatedHistory));
                }
            }
        } catch (e) {
            console.error("Thumbnail Generation Error:", e);
        } finally {
            setIsThumbLoading(false);
        }
    };

    const handleGenerateFullAudio = async () => {
        if (!data || !data.script) return;
        setIsAudioLoading(true);
        setAudioProgress(0);

        try {
            // Simple chunking by paragraphs/newlines to avoid timeouts
            const chunks = data.script.split('\n').filter(line => line.trim().length > 0);
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const decodedBuffers: AudioBuffer[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                // Skip headers like [GANCHO] if preferred, but reading them is okay for draft
                const base64 = await getTextToSpeech(chunk);
                if (base64) {
                    const buffer = await decodeAudioData(decode(base64), audioContext, 24000, 1);
                    decodedBuffers.push(buffer);
                }
                setAudioProgress(Math.round(((i + 1) / chunks.length) * 100));
            }

            if (decodedBuffers.length > 0) {
                const mergedBuffer = mergeAudioBuffers(decodedBuffers, audioContext);
                const wavBlob = audioBufferToWav(mergedBuffer);
                setAudioBlob(wavBlob);
            }

        } catch (e) {
            console.error("Audio Generation Error", e);
        } finally {
            setIsAudioLoading(false);
            setAudioProgress(0);
        }
    };

    const handleDownloadZip = async () => {
        if (!data) return;
        const zip = new JSZip();
        
        // Text Content
        const textContent = `
TITLES:
${data.titles.join('\n')}

DESCRIPTION:
${data.description}

TAGS:
${data.tags}

HASHTAGS:
${data.hashtags}

--- SCRIPT ---
${data.script}
        `;
        zip.file("roteiro_seo.txt", textContent.trim());

        // Thumbnail
        if (thumbnailUrl) {
            // Convert data URL to blob for zip
            const response = await fetch(thumbnailUrl);
            const blob = await response.blob();
            zip.file("thumbnail.jpg", blob);
        }

        // Audio
        if (audioBlob) {
            zip.file("narracao.wav", audioBlob);
        }

        // Generate
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `Projeto_Marketing_${theme.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const loadFromHistory = (item: MarketingHistoryItem) => {
        setData(item.data);
        setThumbnailUrl(null); // Images are not saved in history to save space
        setAudioBlob(null);
        setLanguage(item.language);
        setIsOpen(true);
        setIsHistoryOpen(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!isOpen) {
        return (
            <div className="w-full flex flex-col items-center mt-8 mb-12">
                {/* Language Selector (Pre-invocation) */}
                <div className="flex items-center gap-4 mb-4 bg-black/40 p-1 rounded-full border border-red-900/30">
                    <button 
                        onClick={() => setLanguage('pt')}
                        className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${language === 'pt' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        🇧🇷 Português
                    </button>
                    <button 
                        onClick={() => setLanguage('en')}
                        className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${language === 'en' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        🇺🇸 English
                    </button>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={handleGenerateSEO}
                        className="group relative px-8 py-3 bg-gradient-to-r from-red-900 to-red-700 text-white rounded-xl font-bold shadow-lg border border-red-500/30 hover:scale-105 transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-transparent opacity-0 group-hover:opacity-20 transition-opacity"></div>
                        <span className="relative z-10 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                            </svg>
                            Invocar Guardião do Marketing
                        </span>
                    </button>
                    
                    {history.length > 0 && (
                        <button 
                            onClick={() => { setIsHistoryOpen(true); setIsOpen(true); }}
                            className="px-4 py-3 bg-black/40 border border-red-900/30 rounded-xl hover:bg-red-900/20 text-red-300 transition-colors"
                            title="Arquivos Akáshicos"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto mt-8 mb-12 bg-[#1a1110] border border-red-900/50 rounded-2xl overflow-hidden shadow-2xl animate-fadeIn relative z-50 flex">
             
             {/* History Sidebar */}
             <div className={`fixed inset-y-0 left-0 w-64 bg-[#0f0505] border-r border-red-900/30 transform transition-transform duration-300 z-50 ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} overflow-y-auto`}>
                <div className="p-4 border-b border-red-900/30 flex justify-between items-center">
                    <h4 className="text-red-200 font-serif font-bold">Arquivos</h4>
                    <button onClick={() => setIsHistoryOpen(false)} className="text-red-400 hover:text-white">✕</button>
                </div>
                <div className="p-2 space-y-2">
                    {history.map(item => (
                        <div key={item.id} onClick={() => loadFromHistory(item)} className="p-3 rounded bg-red-900/10 hover:bg-red-900/30 cursor-pointer border border-transparent hover:border-red-500/20 transition-colors">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] text-red-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                                <span className="text-[10px] text-gray-500 uppercase">{item.language}</span>
                            </div>
                            <p className="text-xs text-gray-200 font-medium line-clamp-2">{item.theme}</p>
                        </div>
                    ))}
                </div>
             </div>

             {/* Main Content */}
             <div className="flex-1 flex flex-col w-full min-w-0">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-900 to-black p-4 flex justify-between items-center border-b border-red-800/30">
                    <div className="flex items-center gap-4">
                        {history.length > 0 && (
                            <button onClick={() => setIsHistoryOpen(!isHistoryOpen)} className="text-red-300 hover:text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                            </button>
                        )}
                        <h3 className="text-red-100 font-serif font-bold tracking-widest uppercase flex items-center gap-2 text-sm sm:text-base">
                            <span className="text-2xl">🎥</span> Guardião do Marketing {language === 'en' && '(US)'}
                        </h3>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-red-300 hover:text-white">✕</button>
                </div>

                <div className="p-4 md:p-8">
                    {isSeoLoading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 border-4 border-red-900 border-t-red-500 rounded-full animate-spin mb-4"></div>
                            <p className="text-red-200 animate-pulse">Decodificando algoritmos místicos...</p>
                        </div>
                    ) : data ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            
                            {/* Left Column: Titles, Thumbnail, SEO (4 cols) */}
                            <div className="lg:col-span-4 space-y-6">
                                
                                {/* THUMBNAIL SECTION */}
                                <div className="bg-black/50 rounded-lg p-4 border border-red-900/30 flex flex-col items-center text-center">
                                    <p className="text-xs text-red-300 mb-4 uppercase tracking-wider w-full text-left">Capa do Vídeo</p>
                                    
                                    {thumbnailUrl ? (
                                        <div className="relative group w-full">
                                            <img src={thumbnailUrl} alt="Thumbnail" className="w-full rounded shadow-lg" />
                                            <div className="absolute top-2 right-2 flex gap-2">
                                                <button 
                                                    onClick={handleGenerateThumbnail}
                                                    className="bg-black/70 text-white p-2 rounded-full hover:bg-red-600 transition-colors shadow-lg border border-white/20"
                                                    title="Regenerar"
                                                >
                                                    ↻
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-40 bg-red-900/10 flex flex-col items-center justify-center text-red-500/30 gap-4 rounded border border-dashed border-red-900/30 p-4">
                                            <button 
                                                onClick={handleGenerateThumbnail}
                                                disabled={isThumbLoading}
                                                className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isThumbLoading ? 'Materializando...' : 'Gerar Thumbnail'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                {/* TITLES */}
                                <div className="bg-black/30 p-4 rounded-lg border border-red-900/20">
                                    <p className="text-xs text-red-300 mb-2 uppercase tracking-wider">Títulos Magnéticos</p>
                                    <ul className="space-y-2">
                                        {data.titles.map((t, i) => (
                                            <li key={i} className="text-sm text-gray-300 bg-black/40 p-2 rounded border-l-2 border-red-600 flex justify-between group cursor-pointer hover:bg-black/60" onClick={() => copyToClipboard(t)}>
                                                <span className="line-clamp-2">{t}</span>
                                                <svg className="w-4 h-4 text-gray-500 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* DESCRIPTION & TAGS */}
                                <div className="bg-black/30 p-4 rounded-lg border border-red-900/20">
                                    <p className="text-xs text-red-300 mb-2 uppercase tracking-wider">Descrição & Tags</p>
                                    <textarea 
                                        readOnly 
                                        value={data.description}
                                        className="w-full h-24 bg-black/30 text-gray-400 text-xs p-2 rounded border border-red-900/10 focus:outline-none resize-none mb-2"
                                    />
                                    <div className="text-xs text-gray-500 font-mono line-clamp-2">{data.tags}</div>
                                </div>
                            </div>

                            {/* Right Column: Script & Download (8 cols) */}
                            <div className="lg:col-span-8 flex flex-col h-full">
                                
                                {/* Action Bar */}
                                <div className="flex flex-wrap items-center justify-between mb-4 gap-4 bg-black/20 p-3 rounded-xl border border-white/5">
                                    <div className="flex gap-3">
                                        {/* Audio Gen Button */}
                                        {!audioBlob ? (
                                            <button 
                                                onClick={handleGenerateFullAudio}
                                                disabled={isAudioLoading}
                                                className="flex items-center gap-2 px-4 py-2 bg-purple-900/50 text-purple-200 rounded-lg hover:bg-purple-800/50 transition-colors text-sm disabled:opacity-50"
                                            >
                                                {isAudioLoading ? (
                                                    <span>Gerando Áudio {audioProgress}%</span>
                                                ) : (
                                                    <>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                                        Gerar Narração
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <audio controls src={URL.createObjectURL(audioBlob)} className="h-9 w-64" />
                                        )}
                                    </div>

                                    {/* Master Download */}
                                    <button 
                                        onClick={handleDownloadZip}
                                        className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-700 to-emerald-600 text-white rounded-lg font-bold shadow-lg hover:scale-105 transition-transform text-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Baixar Pacote ZIP
                                    </button>
                                </div>

                                {/* Script Editor */}
                                <div className="flex-grow relative border border-red-500/20 rounded-xl overflow-hidden bg-[#0f0808] shadow-inner">
                                    <div className="absolute top-2 right-2 z-10">
                                        <button onClick={() => copyToClipboard(data.script)} className="bg-black/50 text-gray-400 hover:text-white px-3 py-1 rounded text-xs">Copiar</button>
                                    </div>
                                    <textarea 
                                        readOnly 
                                        value={data.script}
                                        className="w-full h-full bg-transparent text-gray-200 text-sm p-6 focus:outline-none resize-none custom-scrollbar font-mono leading-relaxed"
                                        placeholder="O roteiro gerado aparecerá aqui..."
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-red-400 text-center">Falha ao invocar o guardião.</p>
                    )}
                </div>
             </div>
        </div>
    );
};

export default YouTubeAgent;
