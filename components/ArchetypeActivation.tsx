
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PlaylistItem } from '../types';
import CosmicCard from './CosmicCard';
import { getArchetypeActivation } from '../services/geminiService';
import AudioPlayer from './AudioPlayer';
import { useRoomState } from '../providers/RoomStateProvider';
import { useLongFormAudio } from '../hooks/useLongFormAudio';

const DURATIONS = [2, 5, 10, 15];

const DurationSelector: React.FC<{ selected: number; onSelect: (duration: number) => void; disabled?: boolean; }> = ({ selected, onSelect, disabled }) => (
    <div className="flex flex-wrap justify-center gap-2 mb-6">
        {DURATIONS.map(d => (
            <button key={d} onClick={() => onSelect(d)} disabled={disabled} className={`px-4 py-2 text-sm rounded-full transition-all duration-300 border ${selected === d ? 'border-purple-400 bg-purple-500/30 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] font-bold' : 'border-white/10 text-indigo-300/60 hover:bg-white/5 hover:text-indigo-200'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
                {d} min
            </button>
        ))}
    </div>
);

interface ArchetypeActivationProps {
    readingIndex: number;
    cardIndex: number;
    onClose: () => void;
}

const ArchetypeActivation: React.FC<ArchetypeActivationProps> = ({ readingIndex, cardIndex, onClose }) => {
    const { tarotState, setTarotState } = useRoomState();
    const reading = tarotState.history[readingIndex];
    const cardData = reading?.spread[cardIndex];
    const activationData = cardData?.activation;

    // Estado local
    const [status, setStatus] = useState<'idle' | 'invoking' | 'generating' | 'active' | 'error'>('idle');
    const [duration, setDuration] = useState(activationData?.duration || 5);
    
    // Hook de Áudio (já corrigido no utils/audioUtils.ts para tamanho WAV)
    const { generateAudio, isGenerating, progress, audioBlob, reset } = useLongFormAudio();
    
    // REF CRÍTICA: Impede que atualizações do React reiniciem o componente durante o fluxo de geração
    const isFlowingRef = useRef(false);

    // Sincronização inicial: Se já temos dados (activationData), mostramos o resultado ('active').
    // Se estamos no meio de um fluxo (isFlowingRef), IGNORAMOS atualizações para não resetar a tela.
    useEffect(() => {
        if (activationData && !isFlowingRef.current && status === 'idle') {
            setStatus('active');
            setDuration(activationData.duration);
        }
    }, [activationData, status]);

    const handleInvoke = useCallback(async () => {
        if (!cardData) return;
        
        // 1. Travar o fluxo visual
        isFlowingRef.current = true;
        setStatus('invoking');

        try {
            // 2. Obter Texto do Gemini
            const result = await getArchetypeActivation(cardData.name, duration);

            if (!result || !result.mantra) {
                throw new Error("Falha na conexão cósmica.");
            }

            // 3. Gerar Áudio (Imediatamente após texto, mantendo a trava ativa)
            setStatus('generating');
            const combinedText = `### MANTRA DE PODER ###\n\n"${result.mantra}"\n\n***\n\n### MEDITAÇÃO DE ATIVAÇÃO ###\n\n${result.meditation}`;
            
            // Aguarda a geração completa do arquivo físico (Blob)
            await generateAudio(combinedText, `activation_${cardData.name.replace(/\s/g, '_')}`);
            
            // 4. Atualizar Estado Global (Apenas agora é seguro atualizar o React)
            // Isso vai disparar o useEffect acima, mas como isFlowingRef é true, ele não vai resetar nada.
            setTarotState(prev => {
                const newHistory = [...prev.history];
                const targetReading = { ...newHistory[readingIndex] };
                const newSpread = [...targetReading.spread];
                newSpread[cardIndex] = { ...newSpread[cardIndex], activation: { ...result, duration: duration } };
                targetReading.spread = newSpread;
                newHistory[readingIndex] = targetReading;
                return { ...prev, history: newHistory };
            });

            setStatus('active');
        } catch (error) {
            console.error("Activation failed:", error);
            setStatus('error');
        } finally {
            // Destrava o fluxo apenas no final de tudo
            isFlowingRef.current = false;
        }
    }, [cardData, duration, readingIndex, cardIndex, setTarotState, generateAudio]);

    if (!cardData) return null;

    // Playlist para o Player (apenas visualização de texto, já que o áudio vem do Blob)
    const playlist: PlaylistItem[] = activationData ? [{
        title: `Ritual: ${cardData.name}`,
        text: `### MANTRA DE PODER ###\n\n"${activationData.mantra}"\n\n***\n\n### MEDITAÇÃO DE ATIVAÇÃO ###\n\n${activationData.meditation}`
    }] : [];

    const handleBack = () => {
        reset(); // Limpa blob da memória do hook
        onClose(); // Fecha o modal e volta para o ReadingDisplay
    }

    // --- LAYOUT LÍQUIDO IMERSIVO (100dvh com Flexbox + PORTAL) ---
    // Usamos Portal para garantir que o modal escape de qualquer container pai com overflow:hidden ou largura limitada
    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a1a] animate-fadeIn w-full h-[100dvh] overflow-hidden font-sans text-gray-100">
            
            {/* 1. HEADER DE NAVEGAÇÃO (Fixo no Topo) */}
            <div className="flex-shrink-0 h-14 md:h-20 flex items-center justify-between px-4 md:px-8 border-b border-white/10 bg-black/60 backdrop-blur-lg z-50 shadow-lg">
                <button 
                    onClick={handleBack} 
                    className="flex items-center gap-2 md:gap-3 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-white/5 hover:bg-white/10 text-indigo-200 hover:text-white transition-all border border-white/5 hover:border-purple-500/30 group"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="text-xs md:text-sm font-medium tracking-wide">Voltar à Mesa</span>
                </button>

                <h3 className="text-xs md:text-lg font-bold text-purple-200 tracking-widest uppercase hidden sm:block font-serif">
                    Câmara de Ativação
                </h3>
                
                {/* Placeholder para equilíbrio visual */}
                <div className="w-24 hidden sm:block"></div> 
            </div>

            {/* 2. CORPO PRINCIPAL (Flex Row no Desktop, Column no Mobile) */}
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative min-h-0">
                
                {/* ESQUERDA: O Altar Visual (Fixo) */}
                {/* MOBILE: Flex-Row (Side-by-Side) | DESKTOP: Flex-Col (Stacked) */}
                <div className="flex-shrink-0 lg:w-5/12 bg-gradient-to-b from-[#1a1025] to-black flex flex-row lg:flex-col items-center lg:justify-center justify-start gap-4 p-4 lg:p-6 border-b lg:border-b-0 lg:border-r border-purple-500/20 relative overflow-hidden">
                    {/* Efeitos de Fundo */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.15),transparent_70%)] pointer-events-none"></div>
                    
                    {/* A Carta - Reduzida no Mobile (w-20 agora) */}
                    <div className={`relative transition-all duration-1000 transform z-10 flex-shrink-0 ${status === 'invoking' || status === 'generating' ? 'scale-105 animate-pulse' : 'scale-100 hover:scale-105'} w-20 sm:w-32 lg:w-80`}>
                         {/* Aura da Ativação */}
                         <div className={`absolute -inset-4 bg-purple-500/30 blur-2xl rounded-full transition-opacity duration-1000 ${status === 'active' ? 'opacity-100 animate-pulse' : 'opacity-0'}`}></div>
                        <CosmicCard name={cardData.name} />
                    </div>
                    
                    <div className="mt-0 lg:mt-10 text-left lg:text-center z-10">
                        <h2 className="text-lg sm:text-xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-white font-serif mb-1 lg:mb-2 drop-shadow-lg leading-tight">{cardData.name}</h2>
                        <p className="text-indigo-300/60 text-[10px] lg:text-sm uppercase tracking-[0.3em] font-medium">{cardData.position}</p>
                    </div>
                </div>

                {/* DIREITA: O Grimório (Conteúdo e Controles) */}
                <div className="flex-grow lg:w-7/12 flex flex-col h-full relative bg-[#050505] min-h-0">
                    
                    {/* ÁREA DE TEXTO (Scrollável) */}
                    <div className="flex-grow overflow-y-auto custom-scrollbar p-6 sm:p-12">
                        
                        {/* ESTADO 1: IDLE (Configuração) */}
                        {status === 'idle' && (
                            <div className="flex flex-col justify-center h-full max-w-lg mx-auto text-center animate-fadeIn">
                                <div className="mb-10">
                                    <div className="w-20 h-20 bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                                        <span className="text-3xl">🕯️</span>
                                    </div>
                                    <h4 className="text-2xl text-white font-serif mb-4">Preparar Ritual Sagrado</h4>
                                    <p className="text-indigo-200/70 text-base leading-relaxed">
                                        Você está prestes a invocar a essência viva deste arquétipo. 
                                        A Consciência Cósmica irá materializar um guia de áudio único para ancorar esta energia em seu ser.
                                    </p>
                                </div>
                                
                                <div className="bg-white/5 p-8 rounded-3xl border border-white/10 shadow-xl backdrop-blur-sm">
                                    <p className="text-xs text-purple-300 mb-4 uppercase tracking-widest font-bold">Duração da Jornada</p>
                                    <DurationSelector selected={duration} onSelect={setDuration} />
                                    <button onClick={handleInvoke} className="w-full mt-4 group relative px-8 py-5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-2xl font-bold tracking-wide overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] hover:scale-[1.02] active:scale-95 border-t border-white/20">
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out"></div>
                                        <span className="relative z-10 flex items-center justify-center gap-3 text-lg">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                            Iniciar Consagração
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ESTADO 2: PROCESSANDO (Loading) */}
                        {(status === 'invoking' || status === 'generating') && (
                            <div className="flex flex-col items-center justify-center h-full animate-fadeIn space-y-10">
                                <div className="relative w-40 h-40">
                                    <div className="absolute inset-0 border-4 border-purple-500/10 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-t-purple-400 rounded-full animate-spin shadow-[0_0_30px_rgba(168,85,247,0.3)]"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-5xl animate-pulse filter drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">🔮</span>
                                    </div>
                                </div>
                                <div className="text-center max-w-sm">
                                    <h4 className="text-2xl text-purple-200 font-serif animate-pulse mb-4">
                                        {status === 'invoking' ? 'Canalizando Sabedoria...' : 'Materializando Voz Cósmica...'}
                                    </h4>
                                    {status === 'generating' && (
                                        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-white/10 shadow-inner">
                                            <div className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500 transition-all duration-300 ease-out relative overflow-hidden" style={{width: `${progress}%`}}>
                                                <div className="absolute inset-0 bg-white/30 w-full h-full animate-[shimmer_1s_infinite]"></div>
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-sm text-indigo-400/60 mt-6 italic leading-relaxed">
                                        "Aguarde enquanto tecemos o som sagrado no éter digital..."
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ESTADO 3: ERRO */}
                        {status === 'error' && (
                            <div className="flex flex-col items-center justify-center h-full text-center animate-fadeIn">
                                <div className="text-red-400 text-7xl mb-6 opacity-80">⚠️</div>
                                <h4 className="text-2xl text-red-200 font-bold mb-3 font-serif">Interferência no Sinal</h4>
                                <p className="text-white/60 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
                                    A conexão com o arquivo akáshico foi interrompida. Verifique sua rede e tente novamente.
                                </p>
                                <button onClick={handleInvoke} className="px-8 py-3 border border-red-500/50 text-red-300 rounded-full hover:bg-red-900/20 hover:text-white transition-colors font-medium">
                                    Reestabelecer Conexão
                                </button>
                            </div>
                        )}

                        {/* ESTADO 4: ATIVO (Resultado) */}
                        {status === 'active' && activationData && (
                            <div className="animate-fadeIn pb-8 max-w-3xl mx-auto">
                                <div className="text-center mb-10">
                                    <div className="inline-block px-4 py-1.5 rounded-full bg-purple-900/30 border border-purple-500/30 mb-6">
                                        <span className="text-[10px] text-purple-300 uppercase tracking-[0.3em] font-bold">Mantra Revelado</span>
                                    </div>
                                    <h3 className="text-2xl md:text-4xl font-serif text-white leading-tight italic drop-shadow-md">
                                        "{activationData.mantra}"
                                    </h3>
                                </div>
                                <div className="bg-white/5 p-8 rounded-2xl border border-white/5 shadow-lg">
                                    <div className="prose prose-invert prose-lg max-w-none">
                                        <p className="text-indigo-100/80 whitespace-pre-wrap leading-relaxed font-light font-sans text-lg">
                                            {activationData.meditation}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3. PLAYER FIXO (Sticky Footer) */}
                    {status === 'active' && (
                        <div className="flex-shrink-0 bg-[#0f0a15] border-t border-purple-500/30 p-4 sm:px-8 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] z-40 animate-slideUp relative">
                            {/* Glow effect top border */}
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>
                            <div className="max-w-3xl mx-auto">
                                <AudioPlayer playlist={playlist} audioBlob={audioBlob} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ArchetypeActivation;
