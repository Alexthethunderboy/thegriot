"use client";

import { useState, useEffect } from 'react';
import Globe from '@/components/Globe';
import { MainLayout } from '@/components/MainLayout';
import { Search, Info, SlidersHorizontal, Map as MapIcon, GitCompare, Loader2, MapPin } from 'lucide-react';
import { FlyToInterpolator } from '@deck.gl/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Auth } from '@/components/Auth';
import { ContributeClaim } from '@/components/ContributeClaim';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export default function Home() {
    // Auth and User State
    const [user, setUser] = useState<User | null>(null);
    const [claimVotes, setClaimVotes] = useState<Record<string, { verifications: number, contests: number, userVoted?: 'verify'|'contest' }>>({});

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

    const handleVote = async (claimId: string, voteType: 'verify' | 'contest') => {
        if (!user) return;
        
        // Optimistic UI update
        const prevVotes = claimVotes[claimId] || { verifications: 0, contests: 0 };
        const newVotes = { ...prevVotes, userVoted: voteType };
        if (voteType === 'verify') newVotes.verifications += 1;
        if (voteType === 'contest') newVotes.contests += 1;
        
        setClaimVotes(prev => ({ ...prev, [claimId]: newVotes }));

        try {
            const { data, error } = await supabase.rpc('vote_claim', {
                p_claim_id: claimId,
                p_vote_type: voteType
            });
            if (error) throw error;
            if (data) {
                setClaimVotes(prev => ({ ...prev, [claimId]: { verifications: data.verifications, contests: data.contests, userVoted: voteType }}));
            }
        } catch (err) {
            console.error("Vote failed", err);
            // Revert optimistic
            setClaimVotes(prev => ({ ...prev, [claimId]: prevVotes }));
        }
    };

    // Map Viewport State
    const [viewState, setViewState] = useState({
        longitude: 8.0,
        latitude: 5.0,
        zoom: 2,
        minZoom: 0,
        maxZoom: 10,
        transitionDuration: 0,
        transitionInterpolator: null as any
    });

    // Timeline state
    const [currentYear, setCurrentYear] = useState<number>(2025);
    
    // Compute current epoch based on year for data fetching/UI
    const getCurrentEpoch = (year: number) => {
        if (year < 1000) return 0; // Mythic & Geological
        if (year < 1800) return 1; // Pre-Colonial
        if (year < 1960) return 2; // Colonial
        return 3; // Modern
    };
    
    const currentEpoch = getCurrentEpoch(currentYear);
    
    // Map selection state
    const [selectedCluster, setSelectedCluster] = useState<any>(null);
    const [clusterDetails, setClusterDetails] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Dynamic Pinning State
    const [pinnedLocation, setPinnedLocation] = useState<[number, number] | null>(null);
    const [isIngesting, setIsIngesting] = useState(false);
    const [ingestTarget, setIngestTarget] = useState<string | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Refresh trigger for the Globe to refetch spatial data after new ingestion
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Search Debounce Effect
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
                const data = await res.json();
                setSearchResults(data.results || []);
            } catch (err) {
                console.error("Search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // Handle Search Result Click
    const handleSearchResultClick = (cluster: any) => {
        setSearchQuery("");
        setSearchResults([]);
        
        // Fly to the location
        setViewState({
            ...viewState,
            longitude: cluster.lon,
            latitude: cluster.lat,
            zoom: 6,
            transitionDuration: 2000,
            transitionInterpolator: new FlyToInterpolator()
        });

        // Mock properties wrapper since the UI expects GeoJSON-like structure
        setSelectedCluster({
            properties: {
                id: cluster.id,
                name: cluster.current_name,
                historical_names: cluster.historical_names
            }
        });
    };

    // Fetch the lazy-loaded vertical core sample (epochs & entities) when a cluster is clicked
    useEffect(() => {
        if (!selectedCluster) {
            setClusterDetails(null);
            return;
        }

        const fetchDetails = async () => {
            setLoadingDetails(true);
            try {
                const res = await fetch(`/api/cluster/${selectedCluster.properties.id}`);
                const data = await res.json();
                setClusterDetails(data);
            } catch (err) {
                console.error("Failed to fetch cluster details", err);
            } finally {
                setLoadingDetails(false);
            }
        };

        fetchDetails();
    }, [selectedCluster]);

    // Handle clicking on an empty spot on the map
    const handleMapClick = async (coordinate: [number, number]) => {
        // Clear existing selection
        setSelectedCluster(null);
        setClusterDetails(null);
        
        // Set the new pin and start ingestion
        setPinnedLocation(coordinate);
        setIngestTarget(`[${coordinate[0].toFixed(2)}, ${coordinate[1].toFixed(2)}]`);
        setIsIngesting(true);

        // Fly slightly closer if zoomed way out
        if (viewState.zoom < 4) {
            setViewState({
                ...viewState,
                longitude: coordinate[0],
                latitude: coordinate[1],
                zoom: 4,
                transitionDuration: 1000,
                transitionInterpolator: new FlyToInterpolator()
            });
        }

        try {
            const res = await fetch('/api/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lon: coordinate[0], lat: coordinate[1] })
            });
            const data = await res.json();

            if (data.success) {
                setPinnedLocation(null);
                setRefreshTrigger(prev => prev + 1);
                
                // Fly right into the newly discovered region
                setViewState({
                    ...viewState,
                    longitude: coordinate[0],
                    latitude: coordinate[1],
                    zoom: 6,
                    transitionDuration: 1500,
                    transitionInterpolator: new FlyToInterpolator()
                });

                setSelectedCluster({
                    properties: {
                        id: data.cluster_id,
                        name: "Newly Discovered Region",
                        historical_names: ["Extracting..."]
                    }
                });
            } else {
                console.error("Ingestion failed:", data.error);
                setPinnedLocation(null);
            }
        } catch (err) {
            console.error("Network error during ingestion:", err);
            setPinnedLocation(null);
        } finally {
            setIsIngesting(false);
            setIngestTarget(null);
        }
    };

    // Handle Text Search Ingestion
    const handleSearchIngest = async (query: string) => {
        setSelectedCluster(null);
        setClusterDetails(null);
        setSearchQuery("");
        setSearchResults([]);
        
        setIngestTarget(query);
        setIsIngesting(true);

        try {
            const res = await fetch('/api/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await res.json();

            if (data.success) {
                setRefreshTrigger(prev => prev + 1);
                
                if (data.lon && data.lat) {
                    setViewState({
                        ...viewState,
                        longitude: data.lon,
                        latitude: data.lat,
                        zoom: 6,
                        transitionDuration: 2000,
                        transitionInterpolator: new FlyToInterpolator()
                    });
                }

                setSelectedCluster({
                    properties: {
                        id: data.cluster_id,
                        name: "Newly Extracted Region",
                        historical_names: ["Synchronizing..."]
                    }
                });
            } else {
                console.error("Search Ingestion failed:", data.error);
            }
        } catch (err) {
            console.error("Network error during search ingestion:", err);
        } finally {
            setIsIngesting(false);
            setIngestTarget(null);
        }
    };

    // Map epoch levels to titles
    const epochMap: Record<number, { title: string, desc: string }> = {
        0: { title: "Mythic & Geological", desc: "Pre-History & Oral Traditions" },
        1: { title: "Pre-Colonial Governance", desc: "Before 1800s" },
        2: { title: "Colonial Incursion", desc: "1800s - 1960" },
        3: { title: "Post-Colonial & Modern", desc: "1960 - Present" },
    };

    const activeEpochData = clusterDetails?.epochs?.find((e: any) => e.epoch_level === currentEpoch);

    // Render Components to pass into MainLayout
    const mapComponent = (
        <Globe 
            key={`globe-${refreshTrigger}`}
            startYear={0} 
            endYear={2025} 
            onNodeClick={(cluster) => {
                setPinnedLocation(null);
                setSelectedCluster(cluster);
                
                // Fly to clicked node
                if (cluster.geometry?.coordinates) {
                    setViewState({
                        ...viewState,
                        longitude: cluster.geometry.coordinates[0],
                        latitude: cluster.geometry.coordinates[1],
                        zoom: Math.max(viewState.zoom, 5),
                        transitionDuration: 1000,
                        transitionInterpolator: new FlyToInterpolator()
                    });
                }
            }}
            onMapClick={handleMapClick}
            pinnedLocation={pinnedLocation}
            selectedCluster={selectedCluster}
            viewState={viewState}
            onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState)}
        />
    );

    const headerContent = (
        <>
            <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto glass-panel px-4 py-2 sm:px-5 sm:py-3 rounded-full order-1">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[var(--accent-glow)] shadow-[0_0_10px_var(--accent-glow)]"></div>
                <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white">THE GRIOT</h1>
            </div>

            <div className="pointer-events-auto relative w-full sm:flex-1 max-w-md order-3 sm:order-2 mt-2 sm:mt-0">
                <div className="flex items-center glass-panel px-4 py-3 rounded-full">
                    <Search className="w-4 h-4 text-white/50 ml-2" />
                    <input 
                        type="text" 
                        placeholder="Search geographic clusters..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm px-4 w-full placeholder-white/30 text-white"
                    />
                    {isSearching && <Loader2 className="w-4 h-4 text-[var(--accent-glow)] animate-spin mr-2" />}
                </div>

                {/* Search Results Dropdown */}
                {(searchResults.length > 0 || (searchQuery.trim().length > 0 && !isSearching)) && (
                    <div className="absolute top-full left-0 right-0 mt-3 glass-panel rounded-2xl overflow-hidden py-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {searchResults.map((res) => (
                            <button 
                                key={res.id}
                                onClick={() => handleSearchResultClick(res)}
                                className="w-full text-left px-5 py-3 hover:bg-white/10 transition-colors flex items-center gap-3"
                            >
                                <MapPin className="w-4 h-4 text-[var(--accent-glow)] shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{res.current_name}</div>
                                    {res.historical_names && res.historical_names.length > 0 && (
                                        <div className="text-xs text-white/50 truncate">{res.historical_names.join(', ')}</div>
                                    )}
                                </div>
                            </button>
                        ))}
                        
                        {/* Ingestion Button */}
                        <button
                            onClick={() => handleSearchIngest(searchQuery)}
                            className="w-full text-left px-5 py-3 hover:bg-white/10 transition-colors flex items-center gap-3 border-t border-white/10 mt-1"
                        >
                            <Search className="w-4 h-4 text-orange-400 shrink-0" />
                            <div className="text-sm font-semibold text-orange-400 truncate">
                                Extract history for &quot;{searchQuery}&quot;
                            </div>
                        </button>
                    </div>
                )}
            </div>
            {/* Auth Component on right */}
            <div className="w-auto sm:w-32 flex justify-end order-2 sm:order-3">
                <Auth />
            </div>
        </>
    );

    const timelineContent = (
        <div className="glass-panel rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-5 pointer-events-auto border border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--surface-glass-light)] to-transparent pointer-events-none opacity-20"></div>
            
            <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent-glow)] shrink-0" />
                <h2 className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-white/90 truncate">Temporal Navigation ({currentYear} {currentYear < 0 ? 'BCE' : 'CE'})</h2>
            </div>
            
            <div className="flex flex-col gap-4 relative z-10">
                <div className="flex justify-between items-end">
                    <div>
                        <span className="text-[var(--accent-glow)] font-bold tracking-widest uppercase text-xs shadow-sm">
                            {epochMap[currentEpoch].title}
                        </span>
                        <p className="text-xs text-white/50 mt-1 font-sans">{epochMap[currentEpoch].desc}</p>
                    </div>
                </div>
                
                {/* Continuous Year input */}
                <div className="relative flex items-center w-full h-8">
                    <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full"></div>
                    <div className="absolute left-0 h-1 bg-[var(--accent-glow)] rounded-full transition-all duration-300" style={{ width: `${((currentYear - 0) / 2025) * 100}%` }}></div>
                    <input 
                        type="range" 
                        min="0" max="2025" 
                        step="1"
                        value={currentYear}
                        onChange={(e) => setCurrentYear(Number(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-20"
                    />
                    <div 
                        className="absolute w-5 h-5 bg-white rounded-full shadow-[0_0_15px_var(--accent-glow)] border-2 border-black flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform pointer-events-none z-10"
                        style={{ left: `calc(${((currentYear - 0) / 2025) * 100}% - 10px)` }}
                    >
                        <div className="w-1.5 h-1.5 bg-[var(--accent-glow)] rounded-full"></div>
                    </div>
                </div>

                <div className="flex justify-between text-[10px] font-mono tracking-widest text-white/30 mt-1">
                    <span>0 AD</span>
                    <span>1000</span>
                    <span>1800</span>
                    <span>2025</span>
                </div>
            </div>
        </div>
    );

    const drawerContent = (
        <div className="h-full flex flex-col p-4 sm:p-8 overflow-hidden bg-[var(--surface-glass)]">
            {isIngesting ? (
                <div className="flex-1 flex flex-col justify-center items-center h-full relative">
                    <div className="relative w-32 h-32 flex items-center justify-center mb-8">
                        {/* Concentric rotating rings */}
                        <div className="absolute inset-0 rounded-full border border-[var(--accent-glow)]/20 animate-[spin_4s_linear_infinite]"></div>
                        <div className="absolute inset-2 rounded-full border border-[var(--accent-ochre)]/30 border-dashed animate-[spin_6s_linear_infinite_reverse]"></div>
                        <div className="absolute inset-6 rounded-full border border-[var(--accent-glow)]/40 border-dotted animate-[spin_8s_linear_infinite]"></div>
                        <MapIcon className="w-8 h-8 text-[var(--accent-glow)] animate-pulse" />
                    </div>
                    
                    <h2 className="text-2xl font-serif text-[var(--foreground)] mb-4 tracking-wide">Unearthing Records</h2>
                    <div className="flex items-center gap-2 mb-8 bg-black/40 px-5 py-2 rounded-full border border-[var(--border-glass)]">
                        <MapPin className="w-3 h-3 text-[var(--accent-ochre)]" />
                        <span className="text-xs font-mono text-[var(--accent-ochre)] tracking-widest uppercase">{ingestTarget}</span>
                    </div>

                    <div className="space-y-4 text-left w-full max-w-[280px]">
                        <div className="flex items-center gap-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-glow)] animate-pulse"></div>
                            <span className="text-[11px] font-mono text-[var(--text-body)] tracking-wider uppercase">Analyzing stratigraphy...</span>
                        </div>
                        <div className="flex items-center gap-4 opacity-70">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-ochre)] animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                            <span className="text-[11px] font-mono text-[var(--text-body)] tracking-wider uppercase">Translating oral traditions...</span>
                        </div>
                        <div className="flex items-center gap-4 opacity-40">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)] animate-pulse" style={{ animationDelay: '1s' }}></div>
                            <span className="text-[11px] font-mono text-[var(--text-body)] tracking-wider uppercase">Synthesizing consensus...</span>
                        </div>
                    </div>
                </div>
            ) : selectedCluster ? (
                <>
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-2 mt-4 sm:mt-0">
                            <Info className="w-4 h-4 text-[var(--accent-glow)]" />
                            <span className="text-xs font-bold uppercase tracking-widest text-white/50">Geographic Cluster</span>
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight text-white mb-2">{selectedCluster.properties.name}</h2>
                        {selectedCluster.properties.historical_names && selectedCluster.properties.historical_names.length > 0 && (
                            <p className="text-sm text-white/50 font-mono">
                                AKAs: {selectedCluster.properties.historical_names.join(', ')}
                            </p>
                        )}
                    </div>

                    {/* Regional Ecology Section */}
                    {(() => {
                        const ecologyEntities = clusterDetails?.epochs?.flatMap((e: any) => e.entities || [])
                            .filter((ent: any) => {
                                const t = ent.entity_type?.toLowerCase();
                                return t === 'flora' || t === 'fauna';
                            });
                        
                        if (ecologyEntities && ecologyEntities.length > 0) {
                            return (
                                <div className="mb-8 bg-[#0A0A0A]/60 border border-[var(--border-glass)] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[var(--accent-ochre)]/5 pointer-events-none"></div>
                                    <div className="flex items-center gap-3 mb-5 relative z-10">
                                        <div className="w-2 h-2 rounded-full bg-[var(--accent-ochre)] shadow-[0_0_8px_rgba(212,163,115,0.6)]"></div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-ochre)]">Regional Ecology (Flora & Fauna)</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                        {ecologyEntities.map((eco: any) => {
                                            const consensus = eco.claims?.find((c: any) => !c.is_contested)?.claim_text;
                                            const contested = eco.claims?.find((c: any) => c.is_contested)?.claim_text;
                                            return (
                                                <div key={eco.id} className="space-y-2 border-l border-[var(--border-glass)] pl-4">
                                                    <h4 className="text-[10px] font-bold text-[var(--text-body)] uppercase tracking-widest opacity-60">{eco.entity_type}</h4>
                                                    <p className="text-sm font-semibold text-[var(--foreground)] font-sans">{eco.name}</p>
                                                    {consensus && <p className="text-xs text-[var(--text-body)] font-serif italic mt-1 leading-relaxed">&quot;{consensus}&quot;</p>}
                                                    {contested && <p className="text-[10px] text-[var(--accent-glow)] font-mono mt-1 pt-2 border-t border-[var(--border-glass)] uppercase tracking-wide">Variant: {contested}</p>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    <div className="flex-1 overflow-hidden flex flex-col">
                        {loadingDetails ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-4 text-[var(--accent-glow)]">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <span className="text-sm font-mono tracking-widest uppercase">Extracting Core Sample...</span>
                                </div>
                            </div>
                        ) : !activeEpochData ? (
                            <div className="flex-1 flex items-center justify-center text-white/40">
                                <p className="text-sm">No records recovered for {epochMap[currentEpoch].title} in this cluster.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                <div className="flex items-center justify-center gap-3 mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                                    <GitCompare className="text-[var(--accent-glow)] w-5 h-5" />
                                    <span className="text-xs font-semibold text-white tracking-widest uppercase">Contested Narratives Detected</span>
                                </div>

                                {/* Interlocking Narrative Timeline */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative pb-8">
                                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[var(--border-glass)] pointer-events-none"></div>

                                    <div className="space-y-8 relative">
                                        <AnimatePresence>
                                        {activeEpochData.entities.filter((e: any) => {
                                            const t = e.entity_type?.toLowerCase();
                                            return t !== 'flora' && t !== 'fauna';
                                        }).flatMap((entity: any) => 
                                            (entity.claims || []).map((claim: any, index: number) => {
                                                const isContested = claim.is_contested;
                                                return (
                                                    <motion.div 
                                                        key={`${entity.id}-${claim.id || index}`}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ duration: 0.5, delay: index * 0.1 }}
                                                        className="relative pl-14"
                                                    >
                                                        <div className={`absolute left-[21px] top-4 w-3 h-3 rounded-full border-2 border-[#0A0A0A] z-10 shadow-[0_0_10px_${isContested ? 'rgba(212,163,115,0.8)' : 'rgba(217,119,87,0.8)'}] ${isContested ? 'bg-[var(--accent-ochre)]' : 'bg-[var(--accent-glow)]'}`}></div>

                                                        <div className={`rounded-xl p-5 border ${isContested ? 'bg-[var(--surface-glass-light)] border-[var(--accent-ochre)]/30' : 'glass-panel-light border-[var(--accent-glow)]/20'} relative group`}>
                                                            <div className="absolute -top-3 right-4 flex gap-2 items-center">
                                                                <div className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-widest border shadow-lg cursor-help transition-transform hover:scale-105 group/tooltip relative ${isContested ? 'bg-black text-[var(--accent-ochre)] border-[var(--accent-ochre)]/30' : 'bg-black text-[var(--accent-glow)] border-[var(--accent-glow)]/30'}`}>
                                                                    {isContested ? 'SRC: ORAL TRADITION' : 'SRC: ARCHIVES'}
                                                                    
                                                                    <div className="absolute top-full right-0 mt-2 w-56 bg-[#0A0A0A] border border-[var(--border-glass)] rounded-lg p-3 text-[10px] text-[var(--text-body)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-50 font-sans shadow-2xl">
                                                                        <span className="text-[var(--foreground)] font-semibold block mb-1">Source Details</span>
                                                                        {isContested 
                                                                            ? "Extracted from transcribed community interviews, indigenous knowledge, and orally transmitted histories."
                                                                            : "Sourced from canonical digitized historical archives and structured data."
                                                                        }
                                                                        <div className="mt-2 pt-2 border-t border-[var(--border-glass)] flex justify-between text-[var(--accent-glow)]">
                                                                            <span>CONFIDENCE</span>
                                                                            <span>{Math.round(claim.confidence_score * 100)}%</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <span className={`font-semibold block mb-3 font-sans text-sm ${isContested ? 'text-[var(--accent-ochre)]' : 'text-[var(--accent-glow)]'}`}>{entity.name}</span>
                                                            <p className="font-serif text-sm sm:text-base text-[var(--foreground)] leading-relaxed mb-4">
                                                                &quot;{claim.claim_text}&quot;
                                                            </p>

                                                            {/* Community Consensus UI */}
                                                            <div className="flex items-center gap-3 pt-3 border-t border-[var(--border-glass)] mt-auto">
                                                                <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-body)]/50 mr-2">Community Consensus</span>
                                                                <button 
                                                                    onClick={() => handleVote(claim.id, 'verify')}
                                                                    disabled={!user}
                                                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                                                                        claimVotes[claim.id]?.userVoted === 'verify' 
                                                                        ? 'bg-[var(--accent-glow)]/20 border-[var(--accent-glow)] text-[var(--accent-glow)]' 
                                                                        : 'bg-black/40 border-[var(--border-glass)] text-[var(--text-body)] hover:border-[var(--accent-glow)] hover:text-[var(--accent-glow)] disabled:opacity-50 disabled:cursor-not-allowed'
                                                                    }`}
                                                                >
                                                                    Verify {claimVotes[claim.id]?.verifications > 0 && <span className="opacity-70 ml-1">{claimVotes[claim.id].verifications}</span>}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleVote(claim.id, 'contest')}
                                                                    disabled={!user}
                                                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                                                                        claimVotes[claim.id]?.userVoted === 'contest' 
                                                                        ? 'bg-[var(--accent-ochre)]/20 border-[var(--accent-ochre)] text-[var(--accent-ochre)]' 
                                                                        : 'bg-black/40 border-[var(--border-glass)] text-[var(--text-body)] hover:border-[var(--accent-ochre)] hover:text-[var(--accent-ochre)] disabled:opacity-50 disabled:cursor-not-allowed'
                                                                    }`}
                                                                >
                                                                    Contest {claimVotes[claim.id]?.contests > 0 && <span className="opacity-70 ml-1">{claimVotes[claim.id].contests}</span>}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })
                                        )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Community Contribution Form */}
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <ContributeClaim epochId={activeEpochData.id} onClaimSubmitted={() => setRefreshTrigger(prev => prev + 1)} />
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center pt-10 text-center px-4 relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--surface-glass)] opacity-50 pointer-events-none"></div>
                    <div className="w-16 h-16 rounded-full glass-panel-light flex items-center justify-center mb-6 border border-[var(--accent-ochre)]/30 relative z-10 shadow-[0_0_20px_rgba(212,163,115,0.1)]">
                        <MapIcon className="w-8 h-8 text-[var(--accent-ochre)]" />
                    </div>
                    <h3 className="text-2xl font-serif text-[var(--foreground)] mb-3 relative z-10">Discover History</h3>
                    <p className="text-sm text-[var(--text-body)] max-w-sm leading-relaxed mb-8 relative z-10">
                        Select a geographic cluster on the globe, or search for a region to excavate its interwoven narratives.
                    </p>

                    <div className="w-full max-w-md text-left relative z-10">
                        <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-body)] uppercase mb-4 pl-2 border-l border-[var(--accent-glow)]">Featured Regions</h4>
                        <div className="grid gap-3">
                            {['Mali Empire (Timbuktu)', 'Kingdom of Kongo', 'Great Zimbabwe'].map((region, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleSearchIngest(region)}
                                    className="glass-panel-light p-4 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group border border-transparent hover:border-[var(--accent-glow)]/30 text-left"
                                >
                                    <div>
                                        <span className="text-sm font-semibold text-[var(--foreground)] block">{region}</span>
                                        <span className="text-xs text-[var(--text-body)]">Analyze historical claims</span>
                                    </div>
                                    <Search className="w-4 h-4 text-white/20 group-hover:text-[var(--accent-glow)] transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <MainLayout 
                mapComponent={mapComponent}
                headerContent={headerContent}
                drawerContent={drawerContent}
                timelineContent={timelineContent}
                isDrawerOpen={!!selectedCluster || isIngesting}
                onCloseDrawer={() => setSelectedCluster(null)}
            />

            {/* Global Styles for Scrollbar inside Tailwind */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.4);
                }
            `}</style>
        </>
    );
}
