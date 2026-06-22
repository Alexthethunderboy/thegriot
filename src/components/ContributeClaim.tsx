"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Send, PlusCircle } from "lucide-react";

export function ContributeClaim({ epochId, onClaimSubmitted }: { epochId: string, onClaimSubmitted: () => void }) {
    const [user, setUser] = useState<any>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [entityName, setEntityName] = useState("");
    const [claimText, setClaimText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !entityName.trim() || !claimText.trim()) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/claims/contribute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ epochId, entityName, claimText })
            });
            if (res.ok) {
                setIsOpen(false);
                setEntityName("");
                setClaimText("");
                onClaimSubmitted();
            }
        } catch (err) {
            console.error("Submission failed", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user) return null;

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 rounded-xl border border-dashed border-white/20 transition-colors"
            >
                <PlusCircle className="w-4 h-4" />
                Contribute Oral History
            </button>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="bg-black/40 border border-[var(--accent-glow)]/30 rounded-xl p-4 shadow-[0_0_20px_rgba(245,158,11,0.1)] relative">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--accent-glow)] mb-3">Add Community Record</h4>
            
            <input 
                type="text" 
                placeholder="Entity Name (e.g. Chief, Place)" 
                value={entityName}
                onChange={e => setEntityName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 mb-3 outline-none focus:border-[var(--accent-glow)]/50"
                required
            />
            
            <textarea 
                placeholder="Describe the historical event or oral tradition..." 
                value={claimText}
                onChange={e => setClaimText(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 mb-3 outline-none focus:border-[var(--accent-glow)]/50 min-h-[80px]"
                required
            />

            <div className="flex justify-end gap-2">
                <button 
                    type="button" 
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-white/50 hover:text-white"
                >
                    Cancel
                </button>
                <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-[var(--accent-glow)] text-black text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-opacity-90 transition-opacity disabled:opacity-50"
                >
                    {isSubmitting ? "Submitting..." : (
                        <>
                            Submit Record <Send className="w-3 h-3" />
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
