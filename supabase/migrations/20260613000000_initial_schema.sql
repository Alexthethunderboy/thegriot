-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- Sources table to store primary colonial texts, translations, and origins
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255),
    original_text TEXT NOT NULL,
    translated_text TEXT,
    author VARCHAR(255),
    date_published DATE,
    url TEXT,
    language VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nodes table representing entities (People, Places, Events, Tribes)
-- Incorporates PostGIS for rapid spatial queries and pgvector for semantic search
CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- e.g., 'person', 'place', 'event', 'tribe'
    location GEOMETRY(Point, 4326),   -- EPSG:4326 (WGS 84) coordinate system
    embedding VECTOR(768),            -- For Gemini 1.5 Pro embeddings
    metadata JSONB DEFAULT '{}'::jsonb, -- Flexible metadata (e.g. population, biome)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for spatial queries
CREATE INDEX idx_nodes_location ON nodes USING GIST(location);

-- Index for vector similarity search (IVFFlat or HNSW can be added later as data grows)
-- CREATE INDEX idx_nodes_embedding ON nodes USING hnsw (embedding vector_l2_ops);

-- Claims table: Handles epistemological conflicts.
-- Links a Node to a Source with temporal context and confidence scores.
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    start_year INT,                   -- Temporal scrubbing bounds
    end_year INT,
    confidence_score FLOAT CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    is_contested BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edges table: Represents relationships between entities (e.g., migrations, lineage arcs)
CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- e.g., 'migration_route', 'lineage', 'trade_route'
    route GEOMETRY(LineString, 4326),       -- Optional path (for 3D bezier rendering if known)
    description TEXT,
    start_year INT,
    end_year INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edges_route ON edges USING GIST(route);

-- RPC for the Frontend API: Find nodes within a specific distance (ST_DWithin) and temporal range.
-- Handles rapid clustering logic queries on the database side to maintain 60 FPS.
CREATE OR REPLACE FUNCTION get_nearby_nodes_temporal(
    p_lon FLOAT,
    p_lat FLOAT,
    p_distance_meters FLOAT,
    p_start_year INT DEFAULT NULL,
    p_end_year INT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    entity_type VARCHAR,
    lon FLOAT,
    lat FLOAT,
    is_contested BOOLEAN,
    confidence_score FLOAT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id, 
        n.name, 
        n.entity_type,
        ST_X(n.location) AS lon,
        ST_Y(n.location) AS lat,
        BOOL_OR(c.is_contested) AS is_contested,
        AVG(c.confidence_score) AS confidence_score
    FROM nodes n
    LEFT JOIN claims c ON n.id = c.node_id
    WHERE 
        -- ST_DWithin uses geography internally for accurate meter-based distances if casted, 
        -- but here we use ST_DWithin on geometry with ST_Transform or geography cast.
        ST_DWithin(n.location::geography, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, p_distance_meters)
        AND (p_start_year IS NULL OR c.end_year >= p_start_year OR c.end_year IS NULL)
        AND (p_end_year IS NULL OR c.start_year <= p_end_year OR c.start_year IS NULL)
    GROUP BY n.id, n.name, n.entity_type, n.location;
END;
$$;
