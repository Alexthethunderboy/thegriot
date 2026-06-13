import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/spatial?lon=-43.2&lat=-22.9&distance=500000&start_year=1500&end_year=1600
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lon = parseFloat(searchParams.get('lon') || '0');
    const lat = parseFloat(searchParams.get('lat') || '0');
    const distance = parseFloat(searchParams.get('distance') || '1000000'); // Default 1000km
    const start_year = searchParams.get('start_year') ? parseInt(searchParams.get('start_year')!) : null;
    const end_year = searchParams.get('end_year') ? parseInt(searchParams.get('end_year')!) : null;

    try {
        const { data, error } = await supabase.rpc('get_nearby_nodes_temporal', {
            p_lon: lon,
            p_lat: lat,
            p_distance_meters: distance,
            p_start_year: start_year,
            p_end_year: end_year,
        });

        if (error) {
            console.error("Supabase RPC error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Convert the returned flat data to GeoJSON for Deck.GL
        const geojson = {
            type: 'FeatureCollection',
            features: data.map((node: any) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.lon, node.lat],
                },
                properties: {
                    id: node.id,
                    name: node.name,
                    entity_type: node.entity_type,
                    is_contested: node.is_contested,
                    confidence_score: node.confidence_score,
                },
            })),
        };

        return NextResponse.json(geojson);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
