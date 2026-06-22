import { LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';

export const ambientLight = new AmbientLight({
    color: [255, 255, 255],
    intensity: 1.0
});

export const directionalLight = new DirectionalLight({
    color: [255, 255, 255],
    intensity: 2.0,
    direction: [-3, -4, -1]
});

export const lightingEffect = new LightingEffect({ ambientLight, directionalLight });

export const PIN_ATLAS_URL = '/pin.png';

export const PIN_MAPPING = {
    marker: { x: 0, y: 0, width: 64, height: 64, anchorY: 64, mask: true }
};

export const TILE_LAYER_URLS = {
    terrain: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
};
