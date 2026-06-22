CREATE OR REPLACE FUNCTION search_clusters(query_text TEXT)
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
    WHERE c.current_name ILIKE '%' || query_text || '%'
       OR query_text = ANY(c.historical_names)
    LIMIT 10;
END;
$$;
