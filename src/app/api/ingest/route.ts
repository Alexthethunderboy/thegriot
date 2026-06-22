import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
    try {
        const body = await request.json();
        let lon: number, lat: number, locationName: string;

        if (body.query) {
            // Forward Geocode via OpenStreetMap Nominatim
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(body.query)}&format=json&limit=1`;
            const geoRes = await fetch(nominatimUrl, { headers: { 'User-Agent': 'TheGriot/1.0' } });
            const geoData = await geoRes.json();

            if (!geoData || geoData.length === 0) {
                return NextResponse.json({ error: 'Could not locate coordinates for this search term on Earth.' }, { status: 404 });
            }

            lon = parseFloat(geoData[0].lon);
            lat = parseFloat(geoData[0].lat);
            locationName = geoData[0].name || geoData[0].display_name.split(',')[0] || body.query;
        } else if (typeof body.lon === 'number' && typeof body.lat === 'number') {
            lon = body.lon;
            lat = body.lat;
            
            // Reverse Geocode
            locationName = "Unknown Region";
            try {
                const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
                const geoRes = await fetch(nominatimUrl, { headers: { 'User-Agent': 'TheGriot/1.0' } });
                const geoData = await geoRes.json();
                if (geoData && geoData.address) {
                    locationName = geoData.address.city || geoData.address.town || geoData.address.state || geoData.address.country || "Unknown Region";
                }
            } catch (e: any) {
                console.warn("Nominatim reverse geocode failed, using placeholder name.");
            }
        } else {
            return NextResponse.json({ error: 'Provide either a text query or lon/lat coordinates.' }, { status: 400 });
        }

        // 1.5 Cache Check: Does this location already exist in our database?
        // This saves Gemini credits by returning existing data instead of re-generating it.
        const { data: existingCluster } = await supabase
            .from('clusters')
            .select('id, current_name')
            .ilike('current_name', `%${locationName}%`)
            .limit(1)
            .maybeSingle();

        // Temporarily disabled cache check to ensure Flora/Fauna feature can be tested on previously clicked locations
        // if (existingCluster) {
        //     return NextResponse.json({ success: true, cluster_id: existingCluster.id, cached: true, lon, lat });
        // }

        // 2. Generate Historical Core Sample via Gemini
        const prompt = `
        You are the Fact-Sourcing Engine for 'The Griot', an indigenous historical mapping app.
        The user has dropped a pin at coordinates [${lon}, ${lat}], which maps to: ${locationName}.

        Generate a historical core sample for this region, categorized into 4 Temporal Epochs.
        If the exact location lacks recorded history, extrapolate based on the broader surrounding region (e.g., West African coast, Amazon basin).
        Crucially, generate both 'Consensus History' (colonial/western) and 'Contested Narrative' (indigenous oral history).

        IMPORTANT: For Epoch 0 (Mythic and Geological Era), you MUST include at least one entity with entity_type "Flora" and one with entity_type "Fauna". 
        - For Flora, the 'name' should be a list of key native plants/trees.
        - For Fauna, the 'name' should be a list of key native animals.
        - The 'consensus_claim' should describe their biological/ecological presence.
        - The 'contested_claim' should describe their spiritual, medicinal, or cultural significance to indigenous peoples.

        Output STRICTLY as a JSON array in this exact format:
        [
          {
            "epoch_level": 0,
            "start_year": -999999,
            "end_year": 1400,
            "description": "Mythic and Geological Era",
            "entities": [
              {
                "name": "Entity Name (e.g., River Spirit / First Settlers)",
                "entity_type": "Mythic Figure / Tribe",
                "consensus_claim": "Western anthropological view.",
                "contested_claim": "Indigenous oral tradition."
              },
              {
                "name": "Baobab, Acacia, etc.",
                "entity_type": "Flora",
                "consensus_claim": "Dominant vegetation types found in the semi-arid regions.",
                "contested_claim": "Sacred trees where ancestors reside and medicinal bark is harvested."
              }
            ]
          },
          // ... repeat for epoch_level 1 (Pre-Colonial), 2 (Colonial 1800-1960), and 3 (Modern)
        ]
        `;

        let epochsData;
        try {
            // Using gemini-2.5-flash since gemini-2.5-pro requires a paid billing account (limit: 0 on free tier)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            
            // Clean markdown from Gemini response
            const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
            epochsData = JSON.parse(jsonStr);
        } catch (e: any) {
            throw new Error("Gemini fetch failed: " + e.message);
        }

        // 3. Database Injection
        let clusterId, sourceId;
        try {
            // Create Cluster
            const { data: clusterData, error: clusterError } = await supabase
                .from('clusters')
                .insert({
                    current_name: locationName,
                    coordinates: `POINT(${lon} ${lat})`
                })
                .select()
                .single();

            if (clusterError) throw clusterError;
            clusterId = clusterData.id;

            // Ensure we have a mock Source for these claims
            const { data: sourceData, error: sourceError } = await supabase
                .from('sources')
                .insert({
                    title: 'Gemini Dynamic Extraction',
                    original_text: 'Generated on the fly',
                    author: 'The Griot Engine'
                })
                .select()
                .single();

            if (sourceError) throw sourceError;
            sourceId = sourceData.id;
        } catch (e: any) {
            throw new Error("Supabase insert failed: " + e.message);
        }

        // Insert Epochs, Entities, and Claims
        try {
            for (const epoch of epochsData) {
                const { data: insertedEpoch, error: epochError } = await supabase
                    .from('epochs')
                    .insert({
                        cluster_id: clusterId,
                        epoch_level: epoch.epoch_level,
                        start_year: epoch.start_year,
                        end_year: epoch.end_year,
                        description: epoch.description
                    })
                    .select()
                    .single();

                if (epochError) {
                    console.error("Epoch insert error:", epochError);
                    continue;
                }

                for (const ent of epoch.entities) {
                    const { data: insertedEntity, error: entityError } = await supabase
                        .from('entities')
                        .insert({
                            epoch_id: insertedEpoch.id,
                            name: ent.name,
                            entity_type: ent.entity_type
                        })
                        .select()
                        .single();

                    if (entityError) continue;

                    // Consensus Claim
                    await supabase.from('claims').insert({
                        entity_id: insertedEntity.id,
                        source_id: sourceId,
                        claim_text: ent.consensus_claim,
                        confidence_score: 0.9,
                        is_contested: false
                    });

                    // Contested Claim
                    await supabase.from('claims').insert({
                        entity_id: insertedEntity.id,
                        source_id: sourceId,
                        claim_text: ent.contested_claim,
                        confidence_score: 0.7,
                        is_contested: true
                    });
                }
            }
        } catch (e: any) {
            throw new Error("Supabase epochs/claims insert failed: " + e.message);
        }

        // Return the new cluster ID so the frontend can select it
        return NextResponse.json({ success: true, cluster_id: clusterId });

    } catch (error: any) {
        console.error("Ingestion failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
