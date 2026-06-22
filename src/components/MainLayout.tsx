"use client";

import React from "react";
import { X } from "lucide-react";

interface MainLayoutProps {
  mapComponent: React.ReactNode;
  headerContent: React.ReactNode;
  drawerContent: React.ReactNode;
  timelineContent: React.ReactNode;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
}

export function MainLayout({ 
  mapComponent, 
  headerContent, 
  drawerContent, 
  timelineContent, 
  isDrawerOpen, 
  onCloseDrawer 
}: MainLayoutProps) {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      {/* Map Background Layer */}
      <div 
        className="absolute inset-0 z-0 transition-transform duration-700 ease-[var(--ease-mechanical)]"
        style={{
          // Simple visual translation to mimic recentering when drawer opens
          transform: isDrawerOpen ? "translateX(-15%)" : "translateX(0%)"
        }}
      >
        {mapComponent}
      </div>

      {/* Floating Header / Navigation */}
      <header className="absolute top-4 sm:top-6 left-4 sm:left-6 right-4 sm:right-6 z-10 flex flex-wrap sm:flex-nowrap justify-between items-start gap-3 sm:gap-4 pointer-events-none">
        {headerContent}
      </header>

      {/* Split-Screen Glass Drawer */}
      <div
        className={`absolute top-4 sm:top-6 bottom-4 sm:bottom-6 right-4 sm:right-6 left-4 sm:left-auto sm:w-[500px] md:w-[600px] lg:w-[900px] z-40 sm:z-20 transition-all duration-[800ms] ease-[var(--ease-mechanical)] ${
          isDrawerOpen 
            ? "translate-x-0 opacity-100 pointer-events-auto" 
            : "translate-x-[120%] opacity-0 pointer-events-none"
        }`}
      >
        <div className="glass-panel w-full h-full rounded-3xl flex flex-col overflow-hidden relative shadow-2xl border border-white/10">
          {/* Subtle top glare/gradient for glass effect */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-0"></div>

          {/* Drawer Header Area (Close Button overlay) */}
          <button 
            onClick={onCloseDrawer}
            className="absolute top-4 sm:top-6 right-4 sm:right-6 z-50 p-2 bg-black/40 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white backdrop-blur-md border border-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Drawer Content Area */}
          <div className="flex-1 overflow-hidden relative z-10">
            {drawerContent}
          </div>
        </div>
      </div>

      {/* Floating Timeline Slider */}
      <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 w-full max-w-4xl px-4 sm:px-6 pointer-events-none">
        {timelineContent}
      </div>

    </div>
  );
}
