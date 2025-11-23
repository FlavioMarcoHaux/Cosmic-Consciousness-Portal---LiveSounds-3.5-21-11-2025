
import React from 'react';

const PortalLoader: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full min-h-[50vh] animate-fadeIn">
            <div className="relative w-24 h-24">
                {/* Core */}
                <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
                
                {/* Spinning Rings */}
                <div className="absolute inset-0 border-t-2 border-purple-400 rounded-full animate-spin" style={{ animationDuration: '1.5s' }}></div>
                <div className="absolute inset-2 border-r-2 border-cyan-400 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
                <div className="absolute inset-4 border-b-2 border-pink-400 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                
                {/* Center Spark */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white] animate-ping"></div>
                </div>
            </div>
            <p className="mt-6 text-indigo-200/70 font-serif tracking-widest text-sm animate-pulse">
                Abrindo Portal...
            </p>
        </div>
    );
};

export default PortalLoader;
