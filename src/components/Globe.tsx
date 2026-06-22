import React, { useEffect, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView, FlyToInterpolator } from '@deck.gl/core';
import { ArcLayer, BitmapLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { lightingEffect, PIN_ATLAS_URL, PIN_MAPPING, TILE_LAYER_URLS } from '@/lib/mapConfig';

interface GlobeProps {
    startYear: number;
    endYear: number;
    onNodeClick?: (nodeData: any) => void;
    onMapClick?: (coordinate: [number, number]) => void;
    pinnedLocation?: [number, number] | null;
    selectedCluster?: any;
    viewState: any;
    onViewStateChange: (params: any) => void;
}

export default function Globe({ startYear, endYear, onNodeClick, onMapClick, pinnedLocation, selectedCluster, viewState, onViewStateChange }: GlobeProps) {
    const [data, setData] = useState<any>(null);
    const [edges, setEdges] = useState<any[]>([]);

    // Fetch spatial data whenever temporal range or viewport changes
    useEffect(() => {
        const fetchSpatialData = async () => {
            try {
                // Fetching within a large radius
                const res = await fetch(`/api/spatial?lon=0&lat=0&distance=20000000`);
                const geojson = await res.json();
                setData(geojson);
            } catch (err) {
                console.error("Failed to fetch spatial data", err);
            }
        };

        const fetchEdges = async () => {
            try {
                const res = await fetch(`/api/edges`);
                const json = await res.json();
                setEdges(json.edges || []);
            } catch (err) {
                console.error("Failed to fetch edges data", err);
            }
        };

        fetchSpatialData();
        fetchEdges();
    }, [startYear, endYear]);

    const layers = [
        // 1. Terrain Base Layer (Satellite Imagery from Esri)
        new TileLayer({
            id: 'terrain-layer',
            data: TILE_LAYER_URLS.terrain,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            renderSubLayers: props => {
                const bbox = props.tile.bbox as any;
                const { west, south, east, north } = bbox;
                
                return new BitmapLayer(props, {
                    data: undefined, 
                    image: props.data,
                    bounds: [west, south, east, north]
                });
            }
        }),

        // 2. Labels and Boundaries Overlay (Esri Reference)
        new TileLayer({
            id: 'labels-layer',
            data: TILE_LAYER_URLS.labels,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            renderSubLayers: props => {
                const bbox = props.tile.bbox as any;
                const { west, south, east, north } = bbox;
                
                return new BitmapLayer(props, {
                    data: undefined,
                    image: props.data,
                    bounds: [west, south, east, north],
                    transparentColor: [0, 0, 0, 0] // Ensure transparency works for labels
                });
            }
        }),

        // 3. Node Layer (IconLayer)
        new IconLayer({
            id: 'scatter-layer',
            data: data?.features || [],
            iconAtlas: PIN_ATLAS_URL,
            iconMapping: PIN_MAPPING,
            getIcon: () => 'marker',
            getColor: (d: any) => d.properties?.is_contested ? [239, 68, 68] : [16, 185, 129], // Red or Emerald
            getPosition: (d: any) => d.geometry.coordinates,
            getSize: 40,
            sizeUnits: 'pixels',
            sizeScale: 1,
            pickable: true,
            onClick: (info) => {
                if (info.object && onNodeClick) {
                    onNodeClick(info.object);
                }
            }
        }),

        // 3.2 ArcLayer for Edges (Relationships/Migrations)
        new ArcLayer({
            id: 'arc-layer',
            data: edges,
            getSourcePosition: (d: any) => [d.source_lon, d.source_lat],
            getTargetPosition: (d: any) => [d.target_lon, d.target_lat],
            getSourceColor: [16, 185, 129, 200], // Emerald
            getTargetColor: [245, 158, 11, 200], // Amber
            getWidth: 2,
            pickable: true,
            autoHighlight: true
        }),

        // 3.4 Selected Cluster Pulsing Glow
        ...(selectedCluster && selectedCluster.geometry?.coordinates ? [
            new ScatterplotLayer({
                id: 'selected-cluster-glow',
                data: [selectedCluster.geometry.coordinates],
                getPosition: (d: any) => d,
                getFillColor: [217, 119, 87, 80], // Deep Terracotta translucent
                getLineColor: [217, 119, 87, 200],
                getLineWidth: 2,
                lineWidthUnits: 'pixels',
                getRadius: 150000, // 150km radius glow
                radiusScale: 1,
                stroked: true,
                filled: true,
                parameters: { depthTest: false } // ensure it renders over terrain easily
            })
        ] : []),

        // 3.5 Temporary Pinned Location Layer
        ...(pinnedLocation ? [
            new IconLayer({
                id: 'pinned-location-layer',
                data: [{ coordinates: pinnedLocation }],
                iconAtlas: PIN_ATLAS_URL,
                iconMapping: PIN_MAPPING,
                getIcon: () => 'marker',
                getColor: () => [245, 158, 11], // Amber
                getPosition: (d: any) => d.coordinates,
                getSize: 60,
                sizeUnits: 'pixels',
                sizeScale: 1,
                pickable: false,
            })
        ] : []),
    ];

    return (
        <div className="w-full h-full relative bg-black">
            <DeckGL
                views={new GlobeView()}
                viewState={viewState}
                onViewStateChange={onViewStateChange}
                controller={true}
                layers={layers}
                effects={[lightingEffect]}
                getTooltip={({object}) => object && (object as any).properties?.name}
                onClick={(info) => {
                    // Only trigger map click if we didn't click an object, and we have a coordinate
                    if (!info.object && info.coordinate && onMapClick) {
                        onMapClick(info.coordinate as [number, number]);
                    }
                }}
            />
        </div>
    );
}
