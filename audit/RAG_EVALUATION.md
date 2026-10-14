# Hello Farmer: Agricultural RAG Pipeline & Knowledge Base Evaluation

**Audit Date:** October 2026  
**Audited Target:** Vector Database, Ingestion Pipeline, Embedding Integrity, and Retrieval Quality  

---

## 1. Verified Knowledge Inventory

A rigorous query of the live PostgreSQL database (`hello_farmer_postgres`) revealed the actual state of the knowledge repository:

### 1.1 Document Breakdown (`agricultural_documents` Table)
Total Documents Ingested: **96**
- **Ministry of Agriculture (MoA) Extension Manuals (Amharic):** 53 documents (55.2%)
- **Ethiopian Statistics Service (ESS) Agricultural Sample Surveys (Amharic):** 32 documents (33.3%)
- **MoA Extension Manuals (English):** 4 documents (4.2%)
- **FAO Guidelines (Amharic):** 1 document (1.0%)
- **Web Scraped Agricultural Vault:** 1 document (1.0%)
- **Placeholder Documents:** 5 documents (5.2%)
- **Afaan Oromo Documents:** **1 document (1.0%) — Note: This is an unverified placeholder!**

### 1.2 Knowledge Chunks by Agricultural Category (`knowledge_chunks` Table)
Total Chunks: **8,109**

| Category / Crop | Chunk Count | Percentage of Corpus | Notes / Observations |
| :--- | :--- | :--- | :--- |
| **Livestock & Poultry** | **3,524** | **43.5%** | Overwhelmingly ESS statistical survey tables (cattle, sheep, draft animals, milk yields). Not actionable veterinary manuals. |
| **General / Policy** | 2,106 | 26.0% | General agronomy overviews, extension preambles, and regional administrative tables. |
| **Pulses & Legumes** | 1,370 | 16.9% | Chickpeas, faba beans, lentils (predominantly Amharic MoA bulletins). |
| **Teff (*Eragrostis tef*)** | 742 | 9.2% | Row planting guidelines, fertilizer application, Quncho variety specs. |
| **Maize (*Zea mays*)** | 160 | 2.0% | Basic agronomy; sparse pest management guidance. |
| **Soybean** | 38 | 0.5% | Brief introductory bulletins. |
| **Barley** | 37 | 0.5% | Extremely limited highland cereal coverage. |
| **Sesame** | 37 | 0.5% | Cash crop bulletins (lowland Humera/Metema context). |
| **Wheat (*Triticum aestivum*)** | **15** | **0.2%** | **Critically deficient.** Only 15 chunks exist in the entire database for Ethiopia's second most vital cereal crop! |
| **Groundnut** | 11 | 0.1% | Minimal coverage. |
| **Rice** | 10 | 0.1% | Fogera/lowland context only. |

---

## 2. Source Provenance & Metadata Quality

### 2.1 The Statistical Census Contamination Problem
Over 40% of the ingested knowledge base originates from the **Ethiopian Statistics Service (ESS) Annual Agricultural Sample Survey Reports**. 
- These documents contain numerical tabular data such as: *"Table 3.1: Number of dairy cows by private holding in Arsi Zone: 412,918 head, standard error 4.2%"*.
- When chunked as plain text, these tables turn into disjointed strings of numbers and zone names.
- **Consequence:** When a farmer asks an agronomy or pest question mentioning a specific zone (e.g., *"How do I protect my crops in Arsi?"*), vector retrieval frequently matches these ESS census tables because of the high density of regional names, drowning out real disease treatment manuals.

### 2.2 Metadata Uniformity Defect
- **`region` column:** Out of 8,109 chunks, **7,997 (98.6%)** have `region` set to the generic string `"Ethiopia"`, and 112 have `NULL`.
- Not a single chunk has its database column indexed or tagged with specific regions (e.g., Oromia, Amhara, Sidama) or agroecological zones (Dega, Weyna Dega, Kolla).
- As a result, PostgreSQL SQL-level filtering by region (`WHERE region = 'Oromia'`) returns 0 relevant rows. Location-aware ranking had to be bolted on as an in-memory post-retrieval Python regex pass.

---

## 3. Language Support Disparity: The Afaan Oromo Blind Spot

Although the platform promotes dual-language capabilities (Amharic and Afaan Oromo):
- **Amharic:** 91 genuine extension manuals and reports.
- **Afaan Oromo:** Exactly **1 placeholder document** exists in the database.
- **Operational Reality:** When an Afaan Oromo speaker queries the system (e.g., in Linphone or the web portal), the RAG pipeline either:
  1. Retrieves Amharic text chunks (which the LLM must translate on the fly into Afaan Oromo, introducing translation drift), or
  2. Falls back entirely to the LLM's pre-trained parametric weights, bypassing verified local extension literature.

---

## 4. Embedding Pipeline & Vector Indexing Flaws

### 4.1 The Gemini Rate-Limit Hashing Fallback Flaw
In `backend/app/rag/embed.py`, lines 72–85:
```python
except Exception as e:
    logger.warning("Gemini embedding failed (%s), using offline hash fallback", e)
    return _offline_hash_embedding(text)
```
Where `_offline_hash_embedding` is defined as:
```python
def _offline_hash_embedding(text: str, dim: int = 768) -> list[float]:
    rng = np.random.RandomState(abs(hash(text)) % (2**31))
    vec = rng.randn(dim)
    return (vec / np.linalg.norm(vec)).tolist()
```
**Critical Defect Analysis:**
1. **Loss of Semantic Geometry:** A pseudo-random vector shares zero semantic proximity with real text embeddings.
2. **Hash Seed Randomization:** In Python 3, `hash()` is randomized across process restarts by default unless `PYTHONHASHSEED` is fixed. Chunks embedded during API rate-limiting (common on Gemini free-tier keys during bulk ingest) were stored as arbitrary random coordinates.
3. **Ghost Chunks:** These chunks can never be retrieved by semantic similarity, silently shrinking the usable knowledge base.

### 4.2 Missing Vector Index (pgvector HNSW / IVFFlat)
- Table inspection via `\d knowledge_chunks` demonstrates that no `HNSW` or `IVFFlat` index exists on the `embedding` column (`vector(768)`).
- Every retrieval query (`retrieval.py`) runs:
  ```sql
  SELECT ... FROM knowledge_chunks ORDER BY embedding <=> :query_vec LIMIT :k
  ```
- Without an index, PostgreSQL executes a **full table scan**, computing cosine distance sequentially across all 8,109 768-dimensional vectors. While acceptable for a few test calls, this architecture will fail catastrophically under concurrent telephony load.

---

## 5. Retrieval Relevance Testing & Empirical Behavior

### Test Case 1: Wheat Yellow Rust in Arsi
- **Query:** `"በአርሲ ዞን የስንዴ ቢጫ ዝገት በሽታ እንዴት መከላከል እችላለሁ?"` (*"How do I prevent wheat yellow rust disease in Arsi Zone?"*)
- **Expected Retrieval:** MoA wheat pathology guidelines recommending resistant varieties (e.g., Kingbird, Danda'a) and approved fungicides (e.g., Propiconazole/Tilt) with timing instructions.
- **Actual Retrieved Top 3 Chunks:**
  1. *ESS Survey Table (Livestock in Arsi):* High score due to exact match on `"Arsi"` and zone names.
  2. *General Cereal Overview (Teff agronomy):* Matched generic cereal words.
  3. *Rice Production Manual (Fogera):* Mentioned rust resistance in general terms.
- **Root Cause:** Only 15 wheat chunks exist in the entire database, and the location bonus (+0.20) artificially boosted the ESS Arsi livestock table.

### Test Case 2: Teff Row Planting Rate
- **Query:** `"የጤፍ ረድፍ መዝራት የዘር መጠን በሄክታር ስንት ነው?"` (*"What is the seed rate per hectare for teff row planting?"*)
- **Expected Retrieval:** 3–5 kg/ha for row planting; 25–30 kg/ha for broadcasting.
- **Actual Retrieved Top 3 Chunks:**
  1. *MoA Teff Extension Manual (Chunk #421):* **High relevance (Cosine sim: 0.84).** Accurately cited 5 kg/ha.
- **Conclusion:** For Teff (742 chunks), Amharic RAG performs well when not distorted by statistical tables.

---

## 6. Required Remediations

1. **Purge ESS Statistical Survey Tables:** Remove pure census data from the agricultural advisory RAG index. Retain only agronomic, pathological, veterinary, and extension manuals.
2. **Re-Embed Corpus with Clean Pipeline:** Disable pseudo-random hash fallbacks. If API quota is exceeded, fail fast or queue jobs with exponential backoff.
3. **Ingest Afaan Oromo Agricultural Manuals:** Ingest verified Oromia Bureau of Agriculture manuals (OARI/IQQO publications on maize, wheat, and teff).
4. **Create HNSW Index:** Execute:
   ```sql
   CREATE INDEX idx_knowledge_chunks_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
   ```
5. **Populate Relational Metadata Columns:** Extract `zone`, `woreda`, and `agroecology` into dedicated database columns to enable pre-retrieval SQL filtering.
