import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/cluster/[id]
// Lazy-loads the detailed epochs, entities, and claims for a specific geographic cluster.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: clusterId } = await params;

    try {
        // Fetch epochs ordered by epoch_level
        const { data: epochs, error: epochError } = await supabase
            .from('epochs')
            .select('*')
            .eq('cluster_id', clusterId)
            .order('epoch_level', { ascending: true });

        if (epochError) {
            console.error("Supabase Epoch fetch error:", epochError);
            return NextResponse.json({ error: epochError.message }, { status: 500 });
        }

        if (!epochs || epochs.length === 0) {
            return NextResponse.json({ epochs: [] });
        }

        // Fetch entities for these epochs
        const epochIds = epochs.map((e: any) => e.id);
        const { data: entities, error: entityError } = await supabase
            .from('entities')
            .select('*, claims(*)')
            .in('epoch_id', epochIds);

        if (entityError) {
            console.error("Supabase Entity fetch error:", entityError);
            return NextResponse.json({ error: entityError.message }, { status: 500 });
        }

        // Aggregate entities into their respective epochs
        const enrichedEpochs = epochs.map((epoch: any) => {
            return {
                ...epoch,
                entities: entities?.filter((ent: any) => ent.epoch_id === epoch.id) || []
            };
        });

        return NextResponse.json({ epochs: enrichedEpochs });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
