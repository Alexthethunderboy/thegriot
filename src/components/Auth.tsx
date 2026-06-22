"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { LogIn, LogOut, User as UserIcon, Loader2 } from "lucide-react";

export function Auth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [username, setUsername] = useState("");
    const [pin, setPin] = useState("");
    const [authError, setAuthError] = useState("");
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            setLoading(false);
        };
        
        fetchSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            subscription.unsubscribe();
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSeamlessAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || pin.length < 6) {
            setAuthError("Username and 6-digit PIN required.");
            return;
        }

        setIsAuthenticating(true);
        setAuthError("");

        const dummyEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@thegriot.local`;
        
        // Try sign in first
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: dummyEmail,
            password: pin,
        });

        if (signInError) {
            // If invalid credentials, attempt Auto-Register (sign up)
            if (signInError.message.toLowerCase().includes("invalid login credentials")) {
                const { error: signUpError } = await supabase.auth.signUp({
                    email: dummyEmail,
                    password: pin,
                    options: {
                        data: {
                            username: username
                        }
                    }
                });

                if (signUpError) {
                    setAuthError("Account exists with different PIN, or error occurred.");
                } else {
                    setIsDropdownOpen(false);
                }
            } else {
                setAuthError(signInError.message);
            }
        } else {
            // Success
            setIsDropdownOpen(false);
        }

        setIsAuthenticating(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (loading) return <div className="w-8 h-8 rounded-full glass-panel animate-pulse pointer-events-auto"></div>;

    if (user) {
        // Extract original username from the dummy email or user metadata
        const displayUsername = user.user_metadata?.username || user.email?.split('@')[0] || 'Historian';
        
        return (
            <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full pointer-events-auto shadow-lg border border-[var(--border-glass)] bg-[#0A0A0A]/80">
                <UserIcon className="w-4 h-4 text-[var(--accent-ochre)]" />
                <span className="text-xs font-mono text-[var(--foreground)]">{displayUsername}</span>
                <button onClick={handleLogout} className="text-[var(--text-body)] hover:text-[var(--accent-glow)] transition-colors ml-2">
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="relative pointer-events-auto" ref={dropdownRef}>
            <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 glass-panel px-4 py-2 rounded-full hover:bg-white/10 transition-colors text-xs font-semibold text-[var(--foreground)] border border-[var(--border-glass)]"
            >
                <LogIn className="w-4 h-4 text-[var(--accent-glow)]" />
                Sign In
            </button>

            {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 glass-panel p-4 rounded-2xl shadow-2xl border border-[var(--border-glass)] bg-[#0A0A0A]">
                    <h3 className="text-sm font-serif text-[var(--foreground)] mb-3 tracking-wide">Enter the Archives</h3>
                    <form onSubmit={handleSeamlessAuth} className="space-y-3">
                        <div>
                            <input 
                                type="text" 
                                placeholder="Username" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-black/40 border border-[var(--border-glass)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-glow)] placeholder-[var(--text-body)]/50"
                            />
                        </div>
                        <div>
                            <input 
                                type="password" 
                                placeholder="6-Digit PIN" 
                                maxLength={6}
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full bg-black/40 border border-[var(--border-glass)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-glow)] placeholder-[var(--text-body)]/50 tracking-widest font-mono"
                            />
                        </div>
                        
                        {authError && <p className="text-[10px] text-red-400 font-sans">{authError}</p>}
                        
                        <button 
                            type="submit" 
                            disabled={isAuthenticating || pin.length < 6}
                            className="w-full bg-[var(--surface-glass-light)] border border-[var(--accent-glow)]/30 hover:border-[var(--accent-glow)] text-[var(--accent-glow)] transition-colors rounded-lg py-2 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAuthenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Access / Register"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
