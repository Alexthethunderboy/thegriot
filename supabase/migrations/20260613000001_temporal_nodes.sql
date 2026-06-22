-- Migration: 20260613000001_temporal_nodes.sql
-- Description: Refactor into Cluster -> Epoch -> Entity hierarchy for the Griot architecture.

-- We drop the original tables if they exist to apply the new schema cleanly
-- (Assuming dev environment with no production data yet)
DROP TABLE IF EXISTS edges CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;

-- 1. CLUSTERS: The geographic anchor. Represents a physical region (e.g., Uyo / Calabar)
CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    current_name VARCHAR(255) NOT NULL,
    historical_names TEXT[] DEFAULT '{}',
    coordinates GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clusters_coordinates ON clusters USING GIST(coordinates);

-- 2. EPOCHS: Chronological layers mapped to a cluster.
-- Levels: 0=Mythic, 1=Pre-Colonial, 2=Colonial, 3=Modern
CREATE TABLE epochs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    epoch_level INT NOT NULL CHECK (epoch_level IN (0, 1, 2, 3)),
    start_year INT, -- For Epoch 0, we can use a very large negative int like -999999 to represent mythic time
    end_year INT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cluster_id, epoch_level)
);
CREATE INDEX idx_epochs_cluster ON epochs(cluster_id);

-- 3. ENTITIES: Linked people, events, artifacts within an epoch
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epoch_id UUID REFERENCES epochs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'Person', 'Event', 'Artifact'
    embedding VECTOR(768),            -- Semantic search embedding
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_entities_epoch ON entities(epoch_id);

-- 4. CLAIMS: Linking entities to sources, with conflict clustering
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE, -- sources table kept from previous migration
    claim_text TEXT NOT NULL,
    confidence_score FLOAT CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    is_contested BOOLEAN DEFAULT false,
    conflict_cluster_id UUID, -- Group UUID to link mutually exclusive or contradictory claims
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EDGES: Relationships between entities (e.g., lineage)
CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,
    route GEOMETRY(LineString, 4326),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated RPC for spatial clustering
-- Now it searches `clusters` instead of `nodes`.
CREATE OR REPLACE FUNCTION get_nearby_clusters(
    p_lon FLOAT,
    p_lat FLOAT,
    p_distance_meters FLOAT
)
RETURNS TABLE (
    id UUID,
    current_name VARCHAR,
    historical_names TEXT[],
    lon FLOAT,
    lat FLOAT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, 
        c.current_name, 
        c.historical_names,
        ST_X(c.coordinates) AS lon,
        ST_Y(c.coordinates) AS lat
    FROM clusters c
    WHERE ST_DWithin(c.coordinates::geography, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, p_distance_meters);
END;
$$;
