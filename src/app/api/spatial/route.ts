import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/spatial?lon=-43.2&lat=-22.9&distance=500000
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lon = parseFloat(searchParams.get('lon') || '0');
    const lat = parseFloat(searchParams.get('lat') || '0');
    const distance = parseFloat(searchParams.get('distance') || '1000000'); // Default 1000km

    try {
        const { data, error } = await supabase.rpc('get_nearby_clusters', {
            p_lon: lon,
            p_lat: lat,
            p_distance_meters: distance
        });

        if (error) {
            console.error("Supabase RPC error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Convert the returned flat data to GeoJSON for Deck.GL
        const geojson = {
            type: 'FeatureCollection',
            features: data.map((cluster: any) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [cluster.lon, cluster.lat],
                },
                properties: {
                    id: cluster.id,
                    name: cluster.current_name,
                    historical_names: cluster.historical_names,
                },
            })),
        };

        return NextResponse.json(geojson);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
