import os
import json
import uuid
import psycopg2
import google.generativeai as genai
from typing import List, Dict, Any

# ==============================================================================
# "thegriot" - Data Ingestion Pipeline
# Extracts entities and relationships from historical texts using Gemini 1.5 Pro,
# resolves deduplication, and inserts the data into Supabase (PostGIS & pgvector).
# ==============================================================================

# Initialize Gemini 1.5 Pro
API_KEY = os.environ.get("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)
else:
    print("Warning: GEMINI_API_KEY not set in environment.")

# Initialize Supabase/PostgreSQL connection
DB_CONNECTION_STRING = os.environ.get("SUPABASE_DB_URL")

SYSTEM_PROMPT = """
You are an expert historian and geospatial data extractor.
Your task is to analyze historical colonial texts, extract indigenous entities (people, tribes, places, events),
and identify epistemological conflicts or contested narratives.
Extract the data into a strict JSON format with the following keys:
- entities: [ { name, entity_type (person/place/event/tribe), location_approx (lat, lon), metadata } ]
- relationships: [ { source_name, target_name, relationship_type, description, start_year, end_year } ]
- claims: [ { entity_name, claim_text, start_year, end_year, confidence_score (0.0-1.0), is_contested } ]
"""

def extract_entities_from_text(text: str) -> Dict[str, Any]:
    """
    Calls Gemini 1.5 Pro to extract structured entities from the raw source text.
    """
    print(f"Extracting entities from text ({len(text)} chars)...")
    
    # Mocking Gemini response for development if API is not available
    if not API_KEY:
        return {
            "entities": [
                {"name": "Chief Example", "entity_type": "person", "location_approx": [-43.1, -22.9], "metadata": {}}
            ],
            "relationships": [],
            "claims": []
        }
        
    model = genai.GenerativeModel('gemini-1.5-pro-latest')
    
    response = model.generate_content(
        contents=[
            {"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\nTEXT:\n" + text}]}
        ],
        generation_config={"response_mime_type": "application/json"}
    )
    
    try:
        data = json.loads(response.text)
        return data
    except Exception as e:
        print("Failed to parse Gemini output:", e)
        return {}

def resolve_and_insert(extracted_data: Dict[str, Any], source_id: str):
    """
    Connects to Supabase, deduplicates entities, generates embeddings, 
    and inserts records into the knowledge graph.
    """
    if not DB_CONNECTION_STRING:
        print("Warning: SUPABASE_DB_URL not set. Skipping DB insert.")
        return

    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cursor = conn.cursor()
        
        # 1. Deduplicate & Insert Nodes
        entity_id_map = {}
        for entity in extracted_data.get("entities", []):
            name = entity["name"]
            e_type = entity["entity_type"]
            lat, lon = entity.get("location_approx", [0.0, 0.0])
            
            # Simple deduplication: Check if entity with same name exists
            cursor.execute("SELECT id FROM nodes WHERE name = %s LIMIT 1", (name,))
            result = cursor.fetchone()
            
            if result:
                node_id = result[0]
            else:
                # Need to generate embedding via Vertex/Gemini in real app.
                # Here we insert just the geographic info and base metadata.
                # location is GEOMETRY(Point, 4326) -> ST_SetSRID(ST_MakePoint(lon, lat), 4326)
                cursor.execute("""
                    INSERT INTO nodes (name, entity_type, location, metadata)
                    VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
                    RETURNING id
                """, (name, e_type, lon, lat, json.dumps(entity.get("metadata", {}))))
                node_id = cursor.fetchone()[0]
                
            entity_id_map[name] = node_id

        # 2. Insert Claims
        for claim in extracted_data.get("claims", []):
            e_name = claim.get("entity_name")
            if e_name in entity_id_map:
                cursor.execute("""
                    INSERT INTO claims (node_id, source_id, claim_text, start_year, end_year, confidence_score, is_contested)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    entity_id_map[e_name], 
                    source_id, 
                    claim.get("claim_text"),
                    claim.get("start_year"),
                    claim.get("end_year"),
                    claim.get("confidence_score", 0.5),
                    claim.get("is_contested", False)
                ))

        # 3. Insert Edges (Relationships)
        for rel in extracted_data.get("relationships", []):
            src_name = rel.get("source_name")
            tgt_name = rel.get("target_name")
            if src_name in entity_id_map and tgt_name in entity_id_map:
                cursor.execute("""
                    INSERT INTO edges (source_node_id, target_node_id, relationship_type, description, start_year, end_year)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    entity_id_map[src_name],
                    entity_id_map[tgt_name],
                    rel.get("relationship_type"),
                    rel.get("description"),
                    rel.get("start_year"),
                    rel.get("end_year")
                ))

        conn.commit()
        cursor.close()
        conn.close()
        print("Successfully ingested extracted data into Supabase.")
        
    except Exception as e:
        print("Database error:", e)

if __name__ == "__main__":
    # Example usage
    sample_text = "In 1532, Chief Example led the local tribe in the region of modern-day Rio de Janeiro, before being forced inland in 1535."
    mock_source_id = str(uuid.uuid4())
    extracted = extract_entities_from_text(sample_text)
    print("Extracted:", json.dumps(extracted, indent=2))
    resolve_and_insert(extracted, mock_source_id)
