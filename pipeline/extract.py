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

def generate_embedding(text: str) -> List[float]:
    """Generates a 768-dimensional text embedding using Gemini."""
    if not API_KEY:
        return [0.0] * 768
    try:
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        print("Failed to generate embedding:", e)
        return [0.0] * 768

def resolve_and_insert(extracted_data: Dict[str, Any], source_id: str):
    """
    Connects to Supabase, deduplicates entities, generates embeddings, 
    and inserts records into the temporal knowledge graph (clusters, epochs, entities).
    """
    if not DB_CONNECTION_STRING:
        print("Warning: SUPABASE_DB_URL not set. Skipping DB insert.")
        return

    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cursor = conn.cursor()
        
        entity_id_map = {}
        for entity in extracted_data.get("entities", []):
            name = entity["name"]
            e_type = entity["entity_type"]
            lat, lon = entity.get("location_approx", [0.0, 0.0])
            
            # 1. Cluster resolution (find within 50km or create)
            cursor.execute("""
                SELECT id FROM clusters 
                WHERE ST_DWithin(coordinates::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 50000)
                LIMIT 1
            """, (lon, lat))
            cluster_res = cursor.fetchone()
            if cluster_res:
                cluster_id = cluster_res[0]
            else:
                cursor.execute("""
                    INSERT INTO clusters (current_name, coordinates)
                    VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                    RETURNING id
                """, (f"Region of {name}", lon, lat))
                cluster_id = cursor.fetchone()[0]

            # 2. Epoch resolution (default to 3: Modern for simplicity, or 2 if historical)
            # A full implementation would parse years from claims, but we use a default here
            epoch_level = 2 
            cursor.execute("SELECT id FROM epochs WHERE cluster_id = %s AND epoch_level = %s", (cluster_id, epoch_level))
            epoch_res = cursor.fetchone()
            if epoch_res:
                epoch_id = epoch_res[0]
            else:
                cursor.execute("""
                    INSERT INTO epochs (cluster_id, epoch_level) VALUES (%s, %s) RETURNING id
                """, (cluster_id, epoch_level))
                epoch_id = cursor.fetchone()[0]

            # 3. Entity Semantic deduplication
            embedding_text = f"{name} ({e_type})"
            embedding = generate_embedding(embedding_text)
            embedding_str = "[" + ",".join(map(str, embedding)) + "]"
            
            cursor.execute("""
                SELECT id FROM entities 
                WHERE embedding IS NOT NULL 
                  AND 1 - (embedding <=> %s::vector) > 0.85 
                ORDER BY embedding <=> %s::vector 
                LIMIT 1
            """, (embedding_str, embedding_str))
            
            result = cursor.fetchone()
            if result:
                entity_id = result[0]
                print(f"Matched {name} semantically to existing entity {entity_id}")
            else:
                cursor.execute("""
                    INSERT INTO entities (epoch_id, name, entity_type, embedding, metadata)
                    VALUES (%s, %s, %s, %s::vector, %s)
                    RETURNING id
                """, (epoch_id, name, e_type, embedding_str, json.dumps(entity.get("metadata", {}))))
                entity_id = cursor.fetchone()[0]
                
            entity_id_map[name] = entity_id

        # 4. Insert Claims
        for claim in extracted_data.get("claims", []):
            e_name = claim.get("entity_name")
            if e_name in entity_id_map:
                cursor.execute("""
                    INSERT INTO claims (entity_id, source_id, claim_text, confidence_score, is_contested)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    entity_id_map[e_name], 
                    source_id, 
                    claim.get("claim_text"),
                    claim.get("confidence_score", 0.5),
                    claim.get("is_contested", False)
                ))

        # 5. Insert Edges (Relationships)
        for rel in extracted_data.get("relationships", []):
            src_name = rel.get("source_name")
            tgt_name = rel.get("target_name")
            if src_name in entity_id_map and tgt_name in entity_id_map:
                cursor.execute("""
                    INSERT INTO edges (source_entity_id, target_entity_id, relationship_type, description)
                    VALUES (%s, %s, %s, %s)
                """, (
                    entity_id_map[src_name],
                    entity_id_map[tgt_name],
                    rel.get("relationship_type"),
                    rel.get("description")
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
