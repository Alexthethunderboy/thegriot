CREATE OR REPLACE FUNCTION get_cluster_edges()
RETURNS TABLE (
    id UUID,
    source_lon FLOAT,
    source_lat FLOAT,
    target_lon FLOAT,
    target_lat FLOAT,
    relationship_type VARCHAR,
    description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        ST_X(sc.coordinates) AS source_lon,
        ST_Y(sc.coordinates) AS source_lat,
        ST_X(tc.coordinates) AS target_lon,
        ST_Y(tc.coordinates) AS target_lat,
        e.relationship_type,
        e.description
    FROM edges e
    JOIN entities se ON e.source_entity_id = se.id
    JOIN epochs sep ON se.epoch_id = sep.id
    JOIN clusters sc ON sep.cluster_id = sc.id
    JOIN entities te ON e.target_entity_id = te.id
    JOIN epochs tep ON te.epoch_id = tep.id
    JOIN clusters tc ON tep.cluster_id = tc.id
    WHERE sc.id != tc.id; -- Only show edges between different clusters
END;
$$;
