
import React, { useState, useEffect, useRef } from 'react';
import AudioPlayer from './AudioPlayer';
import { PlaylistItem } from '../types';
import VisualGenerator from './VisualGenerator';
import ConcludeSessionButton from './ConcludeSessionButton';
import YouTubeAgent from './YouTubeAgent';
import { useLongFormAudio } from '../hooks/useLongFormAudio';

interface PracticePlayerProps {
    title: string;
    description: string;
    fetchGuidance: (duration: number) => Promise<PlaylistItem[]>;
    duration: number; 
    onBack: () => void;
    children?: React.ReactNode;
}

const PracticePlayer: React.FC<PracticePlayerProps> = ({ title, description, fetchGuidance, duration, onBack, children }) => {
    const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
    const [isFetchingText, setIsFetchingText] = useState(true);
    const printableRef = useRef<HTMLDivElement>(null);
    
    const { generateAudio, isGenerating, progress, audioBlob, reset } = useLongFormAudio();

    useEffect(() => {
        let isMounted = true;
        const getGuidance = async () => {
            setIsFetchingText(true);
            setPlaylist([]);
            const items = await fetchGuidance(duration);
            
            if (isMounted) {
                if (items.length > 0) {
                    const combinedText = items.map(item => `### ${item.title.toUpperCase()} ###\n\n${item.text}`).join('\n\n***\n\n');
                    setPlaylist([{ title: title, text: combinedText }]);
                    setIsFetchingText(false);
                    // Generate Audio
                    await generateAudio(combinedText, `practice_${title.replace(/\s/g, '_')}`);
                } else {
                    setPlaylist([]);
                    setIsFetchingText(false);
                }
            }
        };
        getGuidance();
        return () => { isMounted = false; reset(); };
    }, [fetchGuidance, duration, title, generateAudio, reset]);

    const handlePrint = () => {
        if (printableRef.current) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:serif;background:#fff;color:#000;padding:40px;}h1{text-align:center;color:#7f1d1d;}h3{color:#991b1b;margin-top:20px;}p{line-height:1.6;}</style></head><body><h1>${title}</h1><p><em>${description}</em></p><hr/>${printableRef.current.innerHTML}</body></html>`);
                printWindow.document.close();
                printWindow.print();
            }
        }
    }

    const isLoading = isFetchingText || isGenerating;

    return (
        <div className="w-full flex flex-col max-w-3xl relative">
            {isLoading ? (
                <div className="text-center m-auto py-20 flex flex-col items-center">
                    <div className="w-24 h-24 mx-auto border-4 border-red-500/20 border-t-amber-400 rounded-full animate-spin mb-6"></div>
                    <p className="text-xl text-amber-200 font-serif animate-pulse">
                        {isFetchingText ? "Invocando o Fogo Sagrado..." : "Materializando Frequência..."}
                    </p>
                    {isGenerating && (
                         <div className="w-64 mt-4 h-2 bg-red-900/50 rounded-full overflow-hidden border border-red-700/30">
                             <div className="h-full bg-amber-400 transition-all duration-300" style={{width: `${progress}%`}}></div>
                         </div>
                    )}
                    <p className="text-sm text-red-400/50 mt-2 tracking-widest uppercase">Preparando {title}</p>
                </div>
            ) : (
                <div className="w-full bg-gradient-to-b from-red-950/80 to-black/90 backdrop-blur-md p-6 sm:p-8 rounded-lg border border-red-500/20 shadow-2xl animate-fadeIn">
                    <div className="flex items-center justify-center mb-6 opacity-50">
                        <div className="h-px bg-gradient-to-r from-transparent via-red-500 to-transparent w-full"></div>
                        <span className="mx-4 text-red-500 text-xl">❖</span>
                        <div className="h-px bg-gradient-to-r from-transparent via-red-500 to-transparent w-full"></div>
                    </div>

                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-300 to-amber-200">{title}</h2>
                        <p className="text-sm text-red-200/60 mt-1">{description}</p>
                    </div>

                    {children && <div className="flex justify-center mb-8">{children}</div>}
                    
                    <div ref={printableRef} className="hidden print:block">
                        {playlist && playlist.map((item, idx) => (
                            <div key={idx}><h3>{item.title}</h3><p>{item.text.replace(/###/g, '').replace(/\*\*\*/g, '')}</p></div>
                        ))}
                    </div>

                    <AudioPlayer playlist={playlist} audioBlob={audioBlob} />

                    <VisualGenerator promptContext={`Arte espiritual mística tântrica representando: ${title}. Energia do fogo, união, êxtase sagrado, kundalini. Cores: Vermelho, Dourado, Laranja.`} buttonText="Revelar Visão Tântrica" />

                    <div className="flex flex-col gap-4 mt-8">
                        <button onClick={handlePrint} className="text-red-300/70 hover:text-white text-sm flex items-center justify-center gap-2 border border-red-500/30 rounded-full py-2 transition-colors hover:bg-red-500/10">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Salvar Prática
                        </button>
                        <ConcludeSessionButton onConclude={onBack} text="Encerrar Prática" />
                    </div>
                    
                    <YouTubeAgent theme={`Tantra: ${title}`} focus="Despertar da Energia Vital" />
                </div>
            )}
        </div>
    );
};

export default PracticePlayer;
