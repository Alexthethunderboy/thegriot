import requests
import json
import time

# ==============================================================================
# The Griot Fact-Sourcing Engine: Wikidata Ingestion (SPARQL)
# Queries Wikidata for historical entities (battles, people, states) 
# within a bounding box and maps them to Epoch 1 (Pre-Colonial) or Epoch 2 (Colonial).
# ==============================================================================

WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

def fetch_historic_entities_in_bbox(west, south, east, north):
    """
    Fetches entities with coordinate location (P625) within a bounding box.
    Focuses on 'historic state' (Q3024240), 'battle' (Q178561), etc.
    """
    # SPARQL query: finds items with a coordinate location within the box
    # that are instances of subclasses of 'historical geographic entity' (Q27350339) or similar.
    # For demonstration, we just pull any entity with coordinates in the box and a 'start time' or 'inception'.
    query = f"""
    SELECT ?item ?itemLabel ?coord ?inception ?dissolved WHERE {{
      # Bounding box filter (approximate via Service wikibase:box)
      SERVICE wikibase:box {{
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:cornerWest "Point({west} {south})"^^geo:wktLiteral .
        bd:serviceParam wikibase:cornerEast "Point({east} {north})"^^geo:wktLiteral .
      }}
      # Must have inception (P571) or start time (P580)
      OPTIONAL {{ ?item wdt:P571 ?inception . }}
      OPTIONAL {{ ?item wdt:P580 ?inception . }}
      
      # Optional: dissolved or abolished (P576) or end time (P582)
      OPTIONAL {{ ?item wdt:P576 ?dissolved . }}
      OPTIONAL {{ ?item wdt:P582 ?dissolved . }}
      
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT 100
    """
    
    headers = {
        "User-Agent": "TheGriot-DataPipeline/1.0 (Contact: admin@thegriot.app)",
        "Accept": "application/sparql-results+json"
    }
    
    try:
        response = requests.get(WIKIDATA_ENDPOINT, headers=headers, params={"query": query})
        response.raise_for_status()
        data = response.json()
        return data.get("results", {}).get("bindings", [])
    except Exception as e:
        print(f"Wikidata query failed: {e}")
        return []

def map_to_epochs(wikidata_results):
    """
    Transforms raw Wikidata SPARQL output into Griot Cluster/Epoch format.
    """
    clusters = []
    for row in wikidata_results:
        # Extract coordinates from "Point(lon lat)"
        coord_str = row.get("coord", {}).get("value", "")
        if coord_str.startswith("Point("):
            lon_lat = coord_str.replace("Point(", "").replace(")", "").split(" ")
            if len(lon_lat) == 2:
                lon, lat = float(lon_lat[0]), float(lon_lat[1])
                
                name = row.get("itemLabel", {}).get("value", "Unknown Entity")
                start_date = row.get("inception", {}).get("value")
                end_date = row.get("dissolved", {}).get("value")
                
                start_year = int(start_date[:4]) if start_date else None
                end_year = int(end_date[:4]) if end_date else None
                
                # Determine Epoch Level (0=Mythic, 1=Pre-Colonial < 1800, 2=Colonial 1800-1960, 3=Modern > 1960)
                epoch_level = 1
                if start_year:
                    if start_year >= 1960: epoch_level = 3
                    elif start_year >= 1800: epoch_level = 2
                    
                cluster = {
                    "current_name": name,
                    "coordinates": [lon, lat],
                    "epochs": [
                        {
                            "epoch_level": epoch_level,
                            "start_year": start_year,
                            "end_year": end_year,
                            "entities": [
                                {
                                    "name": name,
                                    "entity_type": "Wikidata Entity",
                                    "source": "Wikidata",
                                    "claim": f"Existed from {start_year} to {end_year}."
                                }
                            ]
                        }
                    ]
                }
                clusters.append(cluster)
    return clusters

if __name__ == "__main__":
    # Example: Bounding box around West Africa (e.g. Uyo / Calabar region)
    print("Querying Wikidata for Uyo / Calabar region...")
    results = fetch_historic_entities_in_bbox(7.0, 4.0, 9.0, 6.0)
    print(f"Found {len(results)} raw entities.")
    
    clusters = map_to_epochs(results)
    print(f"Mapped {len(clusters)} clusters.")
    # In a full run, we would push these `clusters` directly to the Supabase database.
