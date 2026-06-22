-- Add HNSW index to entities.embedding for fast semantic search
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities USING hnsw (embedding vector_cosine_ops);

-- Create RPC for semantic search on entities, returning their cluster info
CREATE OR REPLACE FUNCTION match_entities(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    entity_id UUID,
    entity_name VARCHAR,
    cluster_id UUID,
    cluster_name VARCHAR,
    lon FLOAT,
    lat FLOAT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id AS entity_id, 
        e.name AS entity_name,
        c.id AS cluster_id,
        c.current_name AS cluster_name,
        ST_X(c.coordinates) AS lon,
        ST_Y(c.coordinates) AS lat,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM entities e
    JOIN epochs ep ON e.epoch_id = ep.id
    JOIN clusters c ON ep.cluster_id = c.id
    WHERE e.embedding IS NOT NULL AND 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
