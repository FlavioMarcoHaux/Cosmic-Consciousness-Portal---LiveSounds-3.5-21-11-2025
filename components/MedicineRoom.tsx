
import React, { useState, useEffect, useRef } from 'react';
import { View } from '../types';
import { useRoomState } from '../providers/RoomStateProvider';
import { useIntention } from '../hooks/useIntention';
import AudioPlayer from './AudioPlayer';
import ConcludeSessionButton from './ConcludeSessionButton';
import VisualGenerator from './VisualGenerator';
import { Medicine, PlaylistItem } from '../types';
import { getMedicineRitual } from '../services/geminiService';
import { KenePattern } from '../assets/KenePattern';
import RoomLayout from './RoomLayout';
import { medicineAudio, MedicineType } from '../services/MedicineAudioEngine';
import YouTubeAgent from './YouTubeAgent';
import { useLongFormAudio } from '../hooks/useLongFormAudio';

type MedicineCategory = 
    | 'amanhecer' 
    | 'entardecer' 
    | 'anoitecer' 
    | 'forca' 
    | 'energia' 
    | 'conexao' 
    | 'mediunidade' 
    | 'relaxantes';

interface CategorizedMedicine extends Medicine {
    category: MedicineCategory;
    audioType: MedicineType;
}

const CATEGORIES: { id: MedicineCategory; title: string; description: string; gradient: string; icon: string }[] = [
    { id: 'amanhecer', title: 'Rapés do Amanhecer', description: 'O Despertar Solar. Energia elétrica e rápida.', gradient: 'from-yellow-400 to-amber-500', icon: '🌅' },
    { id: 'entardecer', title: 'Rapés do Entardecer', description: 'O Coração Quente. Acolhimento e expansão.', gradient: 'from-orange-400 to-rose-500', icon: '🌇' },
    { id: 'anoitecer', title: 'Rapés do Anoitecer', description: 'O Mistério Lunar. Silêncio e visão onírica.', gradient: 'from-indigo-900 to-slate-900', icon: '🌌' },
    { id: 'forca', title: 'Rapés de Força', description: 'O Guerreiro da Terra. Poder tectônico e bruto.', gradient: 'from-red-800 to-orange-900', icon: '🔥' },
    { id: 'energia', title: 'Rapés de Energia', description: 'O Corpo Elétrico. Vibração, fluxo e cura.', gradient: 'from-emerald-500 to-lime-600', icon: '⚡' },
    { id: 'conexao', title: 'Rapés de Conexão', description: 'A Ponte Espiritual. Éter, vento e expansão.', gradient: 'from-violet-500 to-fuchsia-600', icon: '🙏' },
    { id: 'mediunidade', title: 'Rapés de Mediunidade', description: 'A Visão Interior. Psíquico, líquido e prateado.', gradient: 'from-purple-600 to-indigo-500', icon: '👁️' },
    { id: 'relaxantes', title: 'Rapés Relaxantes', description: 'O Retorno ao Ninho. Lento, pesado e seguro.', gradient: 'from-teal-700 to-cyan-800', icon: '🍃' },
];

const MEDICINES: CategorizedMedicine[] = [
    // 1. AMANHECER
    { id: 'murici', name: 'Murici', description: 'Limpa a energia estática acumulada no sono. Traz vibração física.', property: 'Energia Vital', category: 'amanhecer', audioType: 'warrior', animal: 'O Beija-Flor Dourado (Huitzilopochtli)', animalTrait: 'A vibração estática do coração acelerado.' },
    { id: 'menta', name: 'Menta', description: 'Abre os canais da mente e da respiração. Corta a névoa mental.', property: 'Mente Clara', category: 'amanhecer', audioType: 'visionary', animal: 'O Gavião Real (Harpia)', animalTrait: 'A visão de raio laser e o foco implacável.' },
    { id: 'sansara', name: 'Sansara', description: 'Eleva a frequência para a apreciação da beleza. Sutileza.', property: 'Beleza e Encanto', category: 'amanhecer', audioType: 'healer', animal: 'A Borboleta Morpho (Azul Elétrico)', animalTrait: 'A metamorfose psicodélica e o caos sutil.' },

    // 2. ENTARDECER
    { id: 'cacau', name: 'Cacau', description: 'Abre o chakra cardíaco. Traz doçura e gratidão.', property: 'Amor Incondicional', category: 'entardecer', audioType: 'healer', animal: 'O Cervo Branco', animalTrait: 'A gentileza radical e a vulnerabilidade.' },
    { id: 'caneleiro', name: 'Caneleiro', description: 'Atrai a vibração da abundância e aquece o espírito.', property: 'Prosperidade', category: 'entardecer', audioType: 'warrior', animal: 'A Arara Vermelha', animalTrait: 'A voz da tribo e a celebração da vida.' },

    // 3. ANOITECER
    { id: 'anis-estrelado', name: 'Anis Estrelado', description: 'Ativa a visão noturna e a percepção sutil.', property: 'Clarividência', category: 'anoitecer', audioType: 'visionary', animal: 'A Coruja Suindara', animalTrait: 'O guardião que vê o invisível em 360º.' },
    { id: 'jurema-preta', name: 'Jurema Preta', description: 'Limpeza densa e proteção contra energias intrusas.', property: 'Limpeza Densa', category: 'anoitecer', audioType: 'warrior', animal: 'A Pantera Negra', animalTrait: 'O predador do vazio e a fusão com a escuridão.' },

    // 4. FORÇA
    { id: 'veia-paje', name: 'Veia de Pajé', description: 'Força bruta e sustentação. Para momentos de grande desafio.', property: 'Força Bruta', category: 'forca', audioType: 'warrior', animal: 'O Urso Ancestral', animalTrait: 'A hibernação e a fúria da caverna interior.' },
    { id: 'paje', name: 'Rapé do Pajé', description: 'Segredo de cura profunda. Transmuta energias pesadas.', property: 'Cura Secreta', category: 'forca', audioType: 'warrior', animal: 'A Jiboia Arco-Íris (Yuxibu)', animalTrait: 'A grande digestão do ego.' },
    { id: 'india-guerreira', name: 'Índia Guerreira', description: 'Desperta a coragem e a determinação feminina.', property: 'Feminino Selvagem', category: 'forca', audioType: 'warrior', animal: 'A Suçuarana (Puma)', animalTrait: 'A caçadora solitária e o salto impossível.' },
    { id: 'samauma', name: 'Samaúma', description: 'Conexão com as raízes profundas da floresta. Base sólida.', property: 'Ancestralidade e Base', category: 'forca', audioType: 'warrior', animal: 'O Jacaré-Açu', animalTrait: 'A paciência reptiliana e a memória das águas.' },
    { id: 'encanto', name: 'Rapé Encanto', description: 'Fogo purificador. Queima o que não serve mais.', property: 'Fogo e Limpeza Radical', category: 'forca', audioType: 'warrior', animal: 'A Salamandra de Fogo', animalTrait: 'A regeneração e a vida dentro do fogo.' },

    // 5. ENERGIA
    { id: 'tsunu', name: 'Tsunu', description: 'O clássico para descarrego e realinhamento imediato.', property: 'Descarrego e Eixo', category: 'energia', audioType: 'warrior', animal: 'O Tatu Canastra', animalTrait: 'A blindagem e a busca por raízes profundas.' },
    { id: 'mulateiro', name: 'Mulateiro', description: 'Rejuvenesce a energia e foca a mente. Quebra padrões.', property: 'Foco e Juventude', category: 'energia', audioType: 'visionary', animal: 'A Águia Dourada', animalTrait: 'A renovação solar e o olhar direto ao sol.' },
    { id: 'canela-velho', name: 'Canela de Velho', description: 'Cura do corpo físico, dores e inflamações.', property: 'Cura Física', category: 'energia', audioType: 'healer', animal: 'A Tartaruga Gigante', animalTrait: 'O tempo geológico e a cura lenta.' },
    { id: 'ype-roxo', name: 'Ipê Roxo', description: 'Fortalece o sistema imunológico e a resistência.', property: 'Imunidade', category: 'energia', audioType: 'healer', animal: 'A Abelha Rainha', animalTrait: 'A alquimia do néctar e a organização celular.' },
    { id: 'copaiba', name: 'Copaíba', description: 'Limpeza das águas internas e emoções estagnadas.', property: 'Detox e Águas', category: 'energia', audioType: 'healer', animal: 'A Rã Kambo', animalTrait: 'O purificador anfíbio e a secreção de cura.' },
    { id: '7-ervas', name: 'Rapé 7 Ervas', description: 'Harmonização geral dos sistemas do corpo.', property: 'Equilíbrio Geral', category: 'energia', audioType: 'healer', animal: 'O Macaco-Prego', animalTrait: 'A inteligência adaptativa e o riso sagrado.' },

    // 6. CONEXÃO
    { id: '7-cinzas', name: '7 Cinzas', description: 'Alinha todos os chakras e corpos sutis.', property: 'Alinhamento', category: 'conexao', audioType: 'visionary', animal: 'O Lobo Guará', animalTrait: 'O caminhante dos mundos e a lealdade espiritual.' },
    { id: 'cumaru', name: 'Cumaru', description: 'Ativa a coroa e a conexão com o divino.', property: 'Chakras Superiores', category: 'conexao', audioType: 'visionary', animal: 'O Condor dos Andes', animalTrait: 'O voo supremo e o toque no céu.' },
    { id: 'parica', name: 'Paricá', description: 'Vibração intensa da natureza. Cores e sons.', property: 'Vibração da Natureza', category: 'conexao', audioType: 'warrior', animal: 'O Tucano Real', animalTrait: 'O mestre das cores e a vibração tropical.' },
    { id: 'katssaral', name: 'Katssaral', description: 'Portal para o grande mistério e o vazio fértil.', property: 'Mistério e Vazio', category: 'conexao', audioType: 'visionary', animal: 'O Corvo', animalTrait: 'O mensageiro do além e a inteligência do abismo.' },

    // 7. MEDIUNIDADE
    { id: 'mae-divina', name: 'Mãe Divina', description: 'Abre a intuição e a comunicação telepática.', property: 'Intuição', category: 'mediunidade', audioType: 'visionary', animal: 'O Golfinho Rosa (Boto)', animalTrait: 'A telepatia aquática e o erotismo lúdico.' },
    { id: 'jurema-branca', name: 'Jurema Branca', description: 'Sensibilidade e abertura do coração espiritual.', property: 'Sensibilidade', category: 'mediunidade', audioType: 'visionary', animal: 'O Cisne Negro', animalTrait: 'A graça sob pressão e a transformação.' },
    { id: 'artemisia', name: 'Artemísia', description: 'Visão lunar e conexão com o sagrado feminino.', property: 'Vidência Lunar', category: 'mediunidade', audioType: 'visionary', animal: 'O Gato Preto', animalTrait: 'O guardião do limiar e a visão de espíritos.' },

    // 8. RELAXANTES
    { id: 'mulungu', name: 'Mulungu', description: 'Induz ao sono profundo e ao relaxamento muscular.', property: 'Sono Profundo', category: 'relaxantes', audioType: 'healer', animal: 'O Bicho-Preguiça', animalTrait: 'A parada do tempo e o não-fazer (Wu Wei).' },
    { id: 'imburana', name: 'Imburana', description: 'Traz conforto, alívio e "colo de mãe".', property: 'Conforto', category: 'relaxantes', audioType: 'healer', animal: 'A Capivara', animalTrait: 'A paz absoluta e a amizade com a vida.' },
    { id: 'camomila', name: 'Camomila', description: 'Acalma a mente agitada e traz doçura.', property: 'Tranquilidade', category: 'relaxantes', audioType: 'healer', animal: 'A Mariposa da Lua', animalTrait: 'O silêncio aveludado e a atração pela luz.' },
];

const DURATIONS = [10, 15, 20, 30, 45];

const DurationSelector: React.FC<{ selected: number; onSelect: (duration: number) => void; }> = ({ selected, onSelect }) => (
    <div className="flex flex-wrap justify-center items-center gap-2 mb-6 relative z-10">
        <span className="text-sm font-medium text-amber-100/80 mr-2 font-serif tracking-wide">Tempo de Consagração:</span>
        {DURATIONS.map(d => (
            <button key={d} onClick={() => onSelect(d)}
                className={`px-4 py-1 text-xs sm:text-sm rounded-sm transition-all duration-200 border-2 transform rotate-0 hover:rotate-1
                    ${selected === d 
                        ? 'border-amber-400 bg-emerald-900/80 text-amber-300 font-bold shadow-[0_0_10px_rgba(251,191,36,0.4)]' 
                        : 'border-emerald-700/50 text-emerald-200/70 hover:bg-emerald-800/40 hover:text-white'}`}>
                {d} min
            </button>
        ))}
    </div>
);

type ViewState = 'categories' | 'list' | 'detail';

export const MedicineRoom: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => {
    const { medicineState, setMedicineState } = useRoomState();
    const { intention } = useIntention();
    
    const [viewState, setViewState] = useState<ViewState>('categories');
    const [selectedCategory, setSelectedCategory] = useState<MedicineCategory | null>(null);
    const [selectedMedicine, setSelectedMedicine] = useState<CategorizedMedicine | null>(null);
    
    const [duration, setDuration] = useState(medicineState?.duration || 15);
    const [playlist, setPlaylist] = useState<PlaylistItem[] | null>(null);
    const [isFetchingText, setIsFetchingText] = useState(false);
    
    const { generateAudio, isGenerating, progress, audioBlob, reset } = useLongFormAudio();

    // Breath State
    const [isHoldingBreath, setIsHoldingBreath] = useState(false);
    const holdStartTimeRef = useRef<number>(0);
    
    const printableRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef<{x: number, y: number} | null>(null);

    useEffect(() => {
        if (medicineState?.selectedMedicineId) {
            const found = MEDICINES.find(m => m.id === medicineState.selectedMedicineId);
            if (found) {
                setSelectedMedicine(found);
                setSelectedCategory(found.category);
                setViewState('detail');
                setDuration(medicineState.duration);
            }
        }
    }, [medicineState]);

    useEffect(() => {
        if (selectedCategory && viewState !== 'categories' && !playlist) {
            medicineAudio.setBiome(selectedCategory);
        } 
    }, [selectedCategory, viewState, playlist]);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!playlist) return; 
        const { clientX, clientY } = e;
        if (lastMousePos.current) {
            const dx = clientX - lastMousePos.current.x;
            const dy = clientY - lastMousePos.current.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            const velocity = Math.min(distance / 50, 1);
            medicineAudio.updateInteraction(velocity);
        }
        lastMousePos.current = { x: clientX, y: clientY };
    };

    const handleSelectCategory = (category: MedicineCategory) => {
        medicineAudio.triggerShaker();
        setSelectedCategory(category);
        setViewState('list');
    };

    const handleSelectMedicine = (medicine: CategorizedMedicine) => {
        medicineAudio.triggerShaker();
        setSelectedMedicine(medicine);
        setViewState('detail');
        setPlaylist(null);
        reset();
    };

    const handleSoproStart = () => {
        setIsHoldingBreath(true);
        holdStartTimeRef.current = Date.now();
        medicineAudio.startInhale();
    };

    const handleSoproEnd = () => {
        if (!isHoldingBreath) return;
        setIsHoldingBreath(false);
        medicineAudio.triggerSoproImpact();
        if (Date.now() - holdStartTimeRef.current > 1000) {
            startRitualLogic();
        } else {
            medicineAudio.triggerExhale();
        }
    };
    
    const handleSoproCancel = () => {
        if (isHoldingBreath) {
            setIsHoldingBreath(false);
            medicineAudio.triggerExhale();
        }
    }

    const startRitualLogic = async () => {
        if (!selectedMedicine) return;
        
        setMedicineState({ selectedMedicineId: selectedMedicine.id, duration });
        medicineAudio.startRitual(selectedMedicine.id); 
        medicineAudio.triggerSpiritCall(selectedMedicine.animal); // Invoke Animal Sound

        setIsFetchingText(true);
        // 1. Fetch Text with Animal
        const result = await getMedicineRitual(
            selectedMedicine.name, 
            selectedMedicine.property, 
            duration, 
            intention, 
            selectedMedicine.animal, 
            selectedMedicine.animalTrait
        );
        
        if (result && result.length > 0) {
             const combinedText = result.map(item => `### ${item.title.toUpperCase()} ###\n\n${item.text}`).join('\n\n***\n\n');
             setPlaylist([{ title: `Ritual de ${selectedMedicine.name}`, text: combinedText }]);
             
             // 2. Generate Full Audio via OPFS
             setIsFetchingText(false);
             await generateAudio(combinedText, `ritual_${selectedMedicine.id}`);
        } else {
             setPlaylist([]);
             setIsFetchingText(false);
        }
    };

    const handleConclude = () => {
        medicineAudio.stopAll();
        medicineAudio.triggerShaker();
        setMedicineState(null);
        setSelectedMedicine(null);
        setPlaylist(null);
        setViewState('list');
        reset();
    };

    const handlePrint = () => {
        if (printableRef.current) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`<html><head><title>${selectedMedicine?.name}</title><style>body{font-family:serif;padding:40px;}.kene{border:2px solid #064e3b;padding:20px;}</style></head><body><div class="kene">${printableRef.current.innerHTML}</div></body></html>`);
                printWindow.document.close();
                printWindow.print();
            }
        }
    }
    
    const handleBackClick = () => {
        medicineAudio.triggerShaker();
        if (viewState === 'detail' && !playlist) {
            setViewState('list');
            setSelectedMedicine(null);
        } else if (viewState === 'detail' && playlist) {
             handleConclude();
        } else if (viewState === 'list') {
            setViewState('categories');
            setSelectedCategory(null);
        } else {
            onNavigate('home');
        }
    };

    const getFilteredMedicines = () => selectedCategory ? MEDICINES.filter(m => m.category === selectedCategory) : [];
    const getCurrentCategoryInfo = () => CATEGORIES.find(c => c.id === selectedCategory);

    const title = viewState === 'categories' ? 'Santuário da Floresta' : selectedMedicine ? selectedMedicine.name : getCurrentCategoryInfo()?.title || 'Medicinas';
    const subtitle = viewState === 'categories' ? 'Escolha o momento ou a energia que sua alma busca.' : selectedMedicine ? selectedMedicine.property : getCurrentCategoryInfo()?.description;

    const isLoading = isFetchingText || isGenerating;

    return (
        <div className="w-full h-full" onMouseMove={handleMouseMove} ref={containerRef}>
            <RoomLayout
                title={playlist ? '' : title}
                subtitle={playlist ? '' : subtitle}
                onBack={handleBackClick}
                themeColor="emerald"
                backgroundClass="bg-[#051e11]"
            >
                <KenePattern opacity={0.15} />
                
                {viewState === 'categories' && (
                    <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 px-2">
                        {CATEGORIES.map(cat => (
                             <div key={cat.id} onClick={() => handleSelectCategory(cat.id)} onMouseEnter={() => medicineAudio.triggerLeaves()} className={`group relative overflow-hidden p-6 rounded-xl cursor-pointer transition-all duration-500 border border-white/5 hover:border-white/20 hover:-translate-y-1 bg-gradient-to-br ${cat.gradient} bg-opacity-20`}>
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-500"></div>
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <span className="text-4xl mb-3 filter drop-shadow-lg">{cat.icon}</span>
                                    <h3 className="text-xl font-bold text-white mb-2 tracking-wide">{cat.title.replace('Rapés ', '')}</h3>
                                    <p className="text-xs text-white/80 font-light">{cat.description}</p>
                                </div>
                             </div>
                        ))}
                    </div>
                )}

                {viewState === 'list' && (
                    <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 px-2 animate-fadeIn">
                        {getFilteredMedicines().map(med => (
                            <div key={med.id} onClick={() => handleSelectMedicine(med)} onMouseEnter={() => medicineAudio.triggerLeaves()} className="p-5 rounded-lg border-l-4 cursor-pointer transition-all duration-300 flex flex-col justify-between group relative overflow-hidden bg-[#0f291e]/80 border-l-emerald-700/50 border-transparent hover:bg-emerald-900/40 hover:border-l-amber-300/70">
                                <div>
                                    <h3 className="text-lg font-bold tracking-wide text-emerald-100 group-hover:text-amber-200">{med.name}</h3>
                                    <p className="text-sm text-gray-300/80 mt-2 leading-relaxed font-light">{med.description}</p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center">
                                        <span className="w-2 h-2 rounded-full bg-amber-400/70 mr-2"></span>
                                        <p className="text-xs font-medium text-emerald-300 uppercase tracking-wider">{med.property}</p>
                                    </div>
                                    <div className="flex items-center text-xs text-emerald-200/50">
                                        <span className="mr-1">🐾</span> {med.animal.split(' ')[0]}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {viewState === 'detail' && selectedMedicine && (
                    <div className="w-full flex flex-col items-center justify-center animate-fadeIn z-10 relative px-4 pb-24">
                        {!playlist && !isLoading ? (
                            <div className="w-full max-w-md bg-[#0a2015]/80 backdrop-blur-md rounded-2xl p-8 border border-emerald-500/30 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none"></div>
                                <div className="text-6xl mb-6 transform hover:scale-110 transition-transform duration-500 drop-shadow-lg">{getCurrentCategoryInfo()?.icon}</div>
                                <h3 className="text-3xl font-bold text-white mb-2">{selectedMedicine.name}</h3>
                                <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-6"></div>
                                
                                <div className="bg-emerald-900/40 p-4 rounded-lg border border-emerald-500/20 mb-6 w-full">
                                    <p className="text-xs uppercase tracking-widest text-emerald-400 mb-1">Animal de Poder Guardião</p>
                                    <p className="text-lg font-serif text-amber-200">{selectedMedicine.animal}</p>
                                    <p className="text-xs text-emerald-200/60 mt-1 italic">{selectedMedicine.animalTrait}</p>
                                </div>

                                <p className="text-emerald-100/80 mb-8 leading-relaxed">{selectedMedicine.description}</p>
                                <DurationSelector selected={duration} onSelect={setDuration} />
                                <div className="w-full mt-4 flex flex-col gap-3">
                                    <button onMouseDown={handleSoproStart} onMouseUp={handleSoproEnd} onMouseLeave={handleSoproCancel} onTouchStart={handleSoproStart} onTouchEnd={handleSoproEnd} className={`group relative w-full py-4 text-white rounded-lg font-bold shadow-lg transition-all tracking-widest uppercase text-sm border-t overflow-hidden ${isHoldingBreath ? 'bg-emerald-500 border-emerald-300 scale-105 shadow-emerald-500/50' : 'bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 shadow-emerald-900/30 border-emerald-400/20'}`}>
                                        <span className="relative z-10">{isHoldingBreath ? 'Invocando o Espírito...' : 'Segure para Consagrar'}</span>
                                        <div className={`absolute inset-0 bg-white/20 transition-transform duration-[2000ms] ease-out origin-left ${isHoldingBreath ? 'scale-x-100' : 'scale-x-0'}`}></div>
                                    </button>
                                    <p className="text-[10px] text-emerald-400/60">Segure o botão para chamar o animal e a força.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col max-w-3xl relative">
                                 {isLoading ? (
                                     <div className="text-center m-auto py-20 flex flex-col items-center">
                                         <div className="w-24 h-24 border-4 border-emerald-500/20 border-t-amber-400 rounded-full animate-spin mb-6"></div>
                                         <p className="text-xl text-amber-200 font-serif animate-pulse">
                                             {isFetchingText ? `Invocando o espírito: ${selectedMedicine.animal.split(' ')[0]}...` : "Materializando Frequência Sonora..."}
                                         </p>
                                         {isGenerating && (
                                             <div className="w-64 mt-4 h-2 bg-emerald-900/50 rounded-full overflow-hidden border border-emerald-700/30">
                                                 <div className="h-full bg-amber-400 transition-all duration-300" style={{width: `${progress}%`}}></div>
                                             </div>
                                         )}
                                         <p className="text-sm text-emerald-400/50 mt-2 tracking-widest uppercase">
                                             {isGenerating ? `${progress}% Concluído` : "Preparando o rezo..."}
                                         </p>
                                     </div>
                                 ) : (
                                     <div className="w-full bg-[#051e11]/80 backdrop-blur-md p-6 sm:p-8 rounded-lg border border-amber-500/10 shadow-2xl animate-fadeIn">
                                         <div className="flex items-center justify-center mb-6 opacity-50">
                                             <div className="h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent w-full"></div>
                                             <span className="mx-4 text-amber-500 text-xl">❖</span>
                                             <div className="h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent w-full"></div>
                                         </div>
                                         
                                         <div ref={printableRef} className="hidden print:block">
                                            <h1>{selectedMedicine.name} - Ritual da Floresta</h1>
                                            <h2>Guardião: {selectedMedicine.animal}</h2>
                                            {playlist && playlist.map((item, idx) => (
                                                <div key={idx}><h3>{item.title}</h3><p>{item.text.replace(/###/g, '').replace(/\*\*\*/g, '')}</p></div>
                                            ))}
                                         </div>

                                         <AudioPlayer playlist={playlist!} audioBlob={audioBlob} />

                                         <VisualGenerator promptContext={`A energia espiritual do Rapé ${selectedMedicine.name} (${selectedMedicine.property}) fundida com a presença do Animal de Poder: ${selectedMedicine.animal}. Estilo xamânico visionário.`} />

                                         <div className="flex flex-col gap-4 mt-6">
                                             <button onClick={handlePrint} className="text-emerald-300/70 hover:text-white text-sm flex items-center justify-center gap-2 border border-emerald-500/30 rounded-full py-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Salvar Rezo (Imprimir)</button>
                                             <ConcludeSessionButton onConclude={handleConclude} text="Finalizar Rezo (Haux Haux)" />
                                         </div>
                                         <YouTubeAgent theme={`Medicina: ${selectedMedicine.name} e o ${selectedMedicine.animal}`} focus={intention || selectedMedicine.property} />
                                     </div>
                                 )}
                            </div>
                        )}
                    </div>
                )}
            </RoomLayout>
        </div>
    );
};

export default MedicineRoom;
