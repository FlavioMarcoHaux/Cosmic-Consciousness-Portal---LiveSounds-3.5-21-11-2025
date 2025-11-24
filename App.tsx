
import React, { useState, useEffect, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import Home from './components/Home';
import { CoherenceProvider } from './providers/CoherenceProvider';
import { RoomStateProvider } from './providers/RoomStateProvider';
import GenerativeArt from './components/GenerativeArt';
import ProactiveSuggestion from './components/ProactiveSuggestion';
import CoherenceAgent from './components/CoherenceAgent';
import Header from './components/Header';
import AudioOrchestrator from './components/AudioOrchestrator';
import PortalLoader from './components/PortalLoader';
import { View, AppMode } from './types';

// --- Lazy Load Rooms for Performance Optimization ---
// Note: We handle both default and named exports to ensure compatibility
const TarotRoom = React.lazy(() => import('./components/TarotRoom').then(module => ({ default: module.TarotRoom })));
const GeometryRoom = React.lazy(() => import('./components/GeometryRoom'));
const TantraRoom = React.lazy(() => import('./components/TantraRoom'));
const RelationshipRoom = React.lazy(() => import('./components/RelationshipRoom'));
const MedicineRoom = React.lazy(() => import('./components/MedicineRoom').then(module => ({ default: module.MedicineRoom })));
const MarketingRoom = React.lazy(() => import('./components/MarketingRoom'));

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<View>('home');
    const [isVoiceNavOpen, setIsVoiceNavOpen] = useState(false);
    const [appMode, setAppMode] = useState<AppMode>('solo');
    const [isMuted, setIsMuted] = useState(false);
    const [userLevel, setUserLevel] = useState(1);

    // Gamification logic (Simple visit counter simulation)
    useEffect(() => {
        const visits = parseInt(localStorage.getItem('cosmic_visits') || '0');
        const newVisits = visits + 1;
        localStorage.setItem('cosmic_visits', newVisits.toString());
        
        // Level up every 5 interactions
        setUserLevel(Math.floor(newVisits / 5) + 1);
    }, [currentView]);

    const handleNavigate = (view: View) => {
        setCurrentView(view);
    };

    const renderRoom = () => {
        return (
            <Suspense fallback={<PortalLoader />}>
                {(() => {
                    switch (currentView) {
                        case 'tarot':
                            return <TarotRoom onNavigate={handleNavigate} />;
                        case 'geometry':
                            return <GeometryRoom onNavigate={handleNavigate} />;
                        case 'tantra':
                            return <TantraRoom onNavigate={handleNavigate} appMode={appMode} setAppMode={setAppMode} />;
                        case 'relationship':
                            return <RelationshipRoom onNavigate={handleNavigate} />;
                        case 'medicine':
                            return <MedicineRoom onNavigate={handleNavigate} />;
                        case 'marketing':
                            return <MarketingRoom onNavigate={handleNavigate} />;
                        default:
                            return null;
                    }
                })()}
            </Suspense>
        );
    };

    const HeaderComponent = (
        <Header 
            onToggleVoice={currentView === 'home' ? () => setIsVoiceNavOpen(!isVoiceNavOpen) : undefined}
            isVoiceActive={currentView === 'home' ? isVoiceNavOpen : false}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            userLevel={userLevel}
            showHero={currentView === 'home'}
            currentView={currentView} // Pass context to header for Mixer
        />
    );

    return (
        <CoherenceProvider>
            <RoomStateProvider>
                <div className="h-[100dvh] bg-gradient-to-br from-[#0a0a1a] via-[#100f2c] to-[#0a0a1a] flex flex-col items-center font-sans transition-all duration-500 relative isolate overflow-hidden">
                    <GenerativeArt />
                    
                    {/* The Maestro controls all audio */}
                    <AudioOrchestrator activeView={currentView} isMuted={isMuted} />
                    
                    {/* 
                        LAYOUT LOGIC:
                        If Home: Header + Content share the scroll container (Header scrolls away).
                        If Room: Cinema Mode (Full Screen, Fixed, No Global Header).
                    */}

                    {currentView === 'home' ? (
                        // Home Layout: Single scroll container for Header + Content
                        <div className="w-full h-full overflow-y-auto custom-scrollbar flex flex-col min-h-0">
                            <div className="w-full max-w-4xl mx-auto flex-shrink-0 p-4 sm:p-6 lg:p-8 pb-0">
                                {HeaderComponent}
                            </div>
                            <div className="w-full max-w-4xl mx-auto flex-grow flex flex-col p-4 sm:p-6 lg:p-8 pt-2">
                                <Home 
                                    onNavigate={handleNavigate} 
                                    isVoiceNavOpen={isVoiceNavOpen} 
                                    setIsVoiceNavOpen={setIsVoiceNavOpen} 
                                    appMode={appMode} 
                                    setAppMode={setAppMode}
                                    renderHeader={false} 
                                />
                            </div>
                        </div>
                    ) : (
                        // Room Layout: Cinema Mode (Full Screen)
                        <div className="fixed inset-0 z-10 w-full h-full bg-[#0a0a1a]">
                            {renderRoom()}
                        </div>
                    )}
                    
                     <ProactiveSuggestion />
                     <CoherenceAgent />
                     
                    <footer className={`absolute bottom-0 w-full text-center p-2 text-[10px] text-indigo-400/20 pointer-events-none z-0 ${currentView !== 'home' ? 'hidden' : ''}`}>
                        <p>Consciousness Portal v8.0 - The Cosmic Mixer</p>
                    </footer>
                </div>
            </RoomStateProvider>
        </CoherenceProvider>
    );
};

export default App;
