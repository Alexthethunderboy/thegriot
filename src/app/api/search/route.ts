import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        if (!query || query.trim() === '') {
            return NextResponse.json({ results: [] });
        }

        let embeddingStr = null;
        
        // Generate embedding
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
                const result = await model.embedContent(query);
                const embedding = result.embedding.values;
                embeddingStr = "[" + embedding.join(",") + "]";
            } catch (err) {
                console.error("Embedding generation failed:", err);
            }
        }

        if (embeddingStr) {
            // Semantic Search using match_entities RPC
            const { data, error } = await supabase
                .rpc('match_entities', { 
                    query_embedding: embeddingStr,
                    match_threshold: 0.7,
                    match_count: 10
                });

            if (error) throw error;
            
            // Map the semantic search response to what the UI expects
            // Returning the clusters since the UI navigates to a cluster
            const results = (data || []).map((row: any) => ({
                id: row.cluster_id,
                current_name: row.cluster_name,
                historical_names: [`Matched via entity: ${row.entity_name} (${Math.round(row.similarity * 100)}%)`],
                lon: row.lon,
                lat: row.lat
            }));
            
            // Deduplicate clusters (multiple entities might belong to same cluster)
            const uniqueResults = [];
            const seenClusters = new Set();
            for (const r of results) {
                if (!seenClusters.has(r.id)) {
                    seenClusters.add(r.id);
                    uniqueResults.push(r);
                }
            }

            return NextResponse.json({ results: uniqueResults });
        } else {
            // Fallback to text search on clusters
            const { data, error } = await supabase
                .rpc('search_clusters', { query_text: query });

            if (error) throw error;

            return NextResponse.json({ results: data || [] });
        }

    } catch (error: any) {
        console.error("Search failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
