import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { epochId, entityName, claimText } = await request.json();

        // 1. Insert Entity
        const { data: entityData, error: entityError } = await supabase
            .from('entities')
            .insert({
                epoch_id: epochId,
                name: entityName,
                entity_type: 'Community Contributed'
            })
            .select()
            .single();

        if (entityError) throw entityError;

        // 2. Insert Claim
        const { error: claimError } = await supabase
            .from('claims')
            .insert({
                entity_id: entityData.id,
                claim_text: claimText,
                confidence_score: 0.8, // Community claims have relatively high confidence internally
                is_contested: true     // Mark as a contested/indigenous perspective
            });

        if (claimError) throw claimError;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Contribute failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
