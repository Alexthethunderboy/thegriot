import requests
import json
import os
import google.generativeai as genai

# ==============================================================================
# The Griot Fact-Sourcing Engine: Wikipedia Ingestion (Consensus History)
# Fetches the "History" section of geographic municipalities using Wikimedia API,
# and parses the text into Epochs via Gemini 1.5 Pro.
# ==============================================================================

# Initialize Gemini 1.5 Pro
API_KEY = os.environ.get("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

def fetch_wikipedia_history_section(page_title):
    """
    Fetches the History section from Wikipedia for a given municipality.
    """
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles={page_title}&format=json"
    headers = {"User-Agent": "TheGriot-DataPipeline/1.0"}
    
    try:
        response = requests.get(url, headers=headers)
        data = response.json()
        pages = data.get("query", {}).get("pages", {})
        
        for page_id, page_info in pages.items():
            extract = page_info.get("extract", "")
            
            # Very naive split to find the history section (in a real app, parse the wiki AST)
            if "== History ==" in extract:
                history_text = extract.split("== History ==")[1].split("\n\n==")[0]
                return history_text.strip()
            
            # Fallback to the whole extract if no distinct section
            return extract[:5000] # Limiting size for LLM context
            
    except Exception as e:
        print(f"Failed to fetch Wikipedia page: {e}")
        return None

def extract_epochs_via_gemini(text, cluster_name):
    """
    Passes raw Wikipedia text to Gemini to classify facts into the 4 Griot Epochs.
    """
    if not API_KEY:
        print("GEMINI_API_KEY missing. Returning mock data.")
        return []

    prompt = f"""
    You are extracting structured historical data for the geographic cluster: {cluster_name}.
    Analyze the following Wikipedia history text and categorize the events, entities, and claims 
    into these specific Temporal Epochs:
    - Epoch 0: Mythic & Geological (Pre-History, oral traditions if any)
    - Epoch 1: Pre-Colonial Governance (Pre-1800s)
    - Epoch 2: Colonial Incursion & Resistance (1800s - 1960)
    - Epoch 3: Post-Colonial & Modern (1960 - Present)

    Output strictly as JSON in this format:
    [
      {{
        "epoch_level": INT (0, 1, 2, or 3),
        "start_year": INT (Use -999999 for Epoch 0 if unknown),
        "end_year": INT,
        "entities": [
          {{ "name": "String", "entity_type": "String", "claim": "String representing consensus history" }}
        ]
      }}
    ]

    TEXT:
    {text}
    """
    
    model = genai.GenerativeModel('gemini-1.5-pro-latest')
    
    try:
        response = model.generate_content(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        return data
    except Exception as e:
        print("Failed to parse Gemini output:", e)
        return []

if __name__ == "__main__":
    cluster_title = "Calabar"
    print(f"Fetching Wikipedia data for {cluster_title}...")
    history_text = fetch_wikipedia_history_section(cluster_title)
    
    if history_text:
        print(f"Extracted {len(history_text)} characters. Passing to Gemini...")
        epochs_data = extract_epochs_via_gemini(history_text, cluster_title)
        print("Extracted Epochs:")
        print(json.dumps(epochs_data, indent=2))
        # From here, the data would be upserted to the `epochs`, `entities`, and `claims` tables in Supabase.
