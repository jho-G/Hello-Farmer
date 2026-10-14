"""Agricultural Knowledge Base Retrieval Engine.

Implements:
- Vector similarity search via PostgreSQL pgvector cosine distance.
- Location-Aware Regional Agricultural Retrieval & Reranking:
  1. Locality specific trials & manuals (town / woreda) -> Top boost (+0.20)
  2. Regional state & zone evidence (regional bureaus & research centers) -> Regional boost (+0.12)
  3. Agroecological zone matching (Highland/Dega, Midland, Lowland/Kolla) -> Context boost (+0.08)
  4. National MoA / EIAR technical guidance -> Reliable baseline
- Cross-lingual retrieval (Amharic / Afaan Oromo matching English & vernacular chunks).
- Similarity threshold filtering (below threshold -> question 'not covered').
- Source tier attribution (Tiers 1, 2, 3, and placeholder).
"""
import logging
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from app.config import settings
    from app.database.models import AgriculturalDocument, KnowledgeChunk
    from app.rag.embed import get_embedding_provider
except ImportError:
    from backend.app.config import settings
    from backend.app.database.models import AgriculturalDocument, KnowledgeChunk
    from backend.app.rag.embed import get_embedding_provider

logger = logging.getLogger("hello_farmer.rag.retrieve")


class RetrievedPassage(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    content: str
    source_tier: int
    score: float  # Cosine similarity score + geographic relevance boost (0.0 to 1.0+)
    crop: str | None = None
    topic: str | None = None
    page_number: int | None = None
    is_placeholder: bool = False
    geographic_tier: str = "national"  # locality, regional, agroecological, national
    locality_match: str | None = None


# Regional keywords mapping for content search
REGION_SYNONYMS = {
    "Oromia": ["oromia", "oromiyaa", "ኦሮሚያ", "arsi", "አርሲ", "shewa", "ሸዋ", "bale", "ባሌ", "jimma", "ጅማ", "wollega", "ወለጋ", "kulumsa", "ኩሉምሳ", "bako", "ባኮ", "melkassa", "መልካሳ", "holeta", "ሆለታ", "adama", "አዳማ", "bishoftu", "ቢሾፍቱ"],
    "Amhara": ["amhara", "አማራ", "gojjam", "ጎጃም", "wollo", "ወሎ", "gondar", "ጎንደር", "shewa", "ሸዋ", "debre birhan", "ደብረ ብርሃን", "bahir dar", "ባህር ዳር", "adet", "አዴት", "sirinka", "ስሪንቃ", "kombolcha", "ኮምቦልቻ"],
    "Tigray": ["tigray", "ትግራይ", "mekelle", "መቀሌ", "መቐለ", "shire", "ሽሬ", "alamata", "አላማጣ", "axum", "አክሱም"],
    "Sidama": ["sidama", "ሲዳማ", "hawassa", "ሀዋሳ", "awassa", "አዋሳ", "wondo genet", "ወንዶ ገነት"],
    "South Ethiopia": ["wolaita", "ዎላይታ", "sodo", "ሶዶ", "arba minch", "አርባ ምንጭ", "gamo", "ጋሞ", "gedeo", "ጌዴኦ"],
    "Central Ethiopia": ["gurage", "ጉራጌ", "butajira", "ቡታጅራ", "hadiya", "ሃዲያ", "hossana", "ሆሳዕና"],
    "Somali": ["somali", "ሶማሌ", "jigjiga", "ጅግጅጋ", "gode", "ጎዴ"],
    "Afar": ["afar", "አፋር", "semera", "ሰመራ", "awash", "አዋሽ"],
    "Benishangul-Gumuz": ["benishangul", "ቤንሻንጉል", "assosa", "አሶሳ", "bambasi", "ባምባሲ"],
    "Gambella": ["gambella", "ጋምቤላ", "itang", "ኢታንግ", "abobo", "አቦቦ"],
}

AGROECOLOGY_KEYWORDS = {
    "Highland": ["highland", "dega", "ደጋ", "frost", "ውርጭ", "vertisol", "black soil", "አሲዳማ", "acidic", "nitisol", "cool", "cold", "ቀዝቃዛ", "2400m", "2500m", "2600m", "2800m"],
    "Midland": ["midland", "weyna dega", "ወይና ደጋ", "medium rainfall", "loam", "1800m", "2000m", "2200m"],
    "Lowland": ["lowland", "kolla", "ቆላ", "bereha", "በረሃ", "drought", "ድርቅ", "semi-arid", "arid", "warm", "hot", "ሞቃት", "1500m", "1200m", "1000m"],
}


async def retrieve_passages(
    query: str,
    session: AsyncSession,
    top_k: int = 4,
    similarity_threshold: float | None = None,
    crop_filter: str | None = None,
    location: Any | None = None,
    region_filter: str | None = None,
) -> list[RetrievedPassage]:
    """Retrieve top-k relevant knowledge passages from pgvector with location awareness.

    Args:
        query: Caller or user question text.
        session: Database async session.
        top_k: Maximum number of chunks to return.
        similarity_threshold: Minimum cosine similarity score (defaults to config: 0.65).
        crop_filter: Optional crop filter (e.g. 'teff', 'wheat', 'maize').
        location: Optional LocationMatch instance representing caller's locality.
        region_filter: Optional explicit region string (e.g. 'Oromia', 'Amhara').

    Returns:
        List of RetrievedPassage objects prioritized by locality, regional evidence, and semantic similarity.
    """
    if not query or not query.strip():
        return []

    threshold = similarity_threshold if similarity_threshold is not None else getattr(
        settings, "SIMILARITY_THRESHOLD", 0.65
    )

    embedder = get_embedding_provider()
    query_vector = await embedder.embed_query(query)

    # Use pgvector cosine distance: <=> operator
    cosine_dist = KnowledgeChunk.embedding.cosine_distance(query_vector)

    stmt = (
        select(
            KnowledgeChunk,
            AgriculturalDocument.title.label("doc_title"),
            AgriculturalDocument.source_tier.label("doc_tier"),
            (1.0 - cosine_dist).label("similarity_score"),
        )
        .join(AgriculturalDocument, KnowledgeChunk.document_id == AgriculturalDocument.id)
        .where(KnowledgeChunk.embedding.is_not(None))
    )

    if crop_filter:
        stmt = stmt.where(KnowledgeChunk.crop == crop_filter)

    # Retrieve candidate pool for location-aware ranking (3x top_k)
    stmt = stmt.order_by(cosine_dist.asc()).limit(max(top_k * 4, 20))

    result = await session.execute(stmt)
    rows = result.all()

    # Extract target geographic tokens
    target_town = ""
    target_town_am = ""
    target_town_om = ""
    target_woreda = ""
    target_zone = ""
    target_region = region_filter or ""
    target_agroecology = ""

    if location:
        target_town = (getattr(location, "town", "") or getattr(location, "name", "")).lower()
        target_town_am = getattr(location, "name_am", "")
        target_town_om = getattr(location, "name_om", "").lower()
        target_woreda = (getattr(location, "woreda", "") or "").lower()
        target_zone = (getattr(location, "zone", "") or "").lower()
        target_region = getattr(location, "region", "") or target_region
        target_agroecology = getattr(location, "agroecological_zone", "")

    regional_synonyms = REGION_SYNONYMS.get(target_region, [])
    agro_keywords = AGROECOLOGY_KEYWORDS.get(target_agroecology, [])

    candidate_passages: list[RetrievedPassage] = []

    for chunk, doc_title, doc_tier, similarity_score in rows:
        base_score = float(similarity_score) if similarity_score is not None else 0.0
        content_lower = (chunk.content or "").lower()
        doc_lower = (doc_title or "").lower()

        geo_tier = "national"
        locality_match_name = None
        geo_boost = 0.0

        # Tier 1 Geographic Priority: Specific Locality Match (Town / Woreda)
        if target_town and (
            target_town in content_lower
            or (target_town_am and target_town_am in chunk.content)
            or (target_town_om and target_town_om in content_lower)
            or (target_woreda and target_woreda in content_lower)
            or target_town in doc_lower
        ):
            geo_tier = "locality"
            locality_match_name = getattr(location, "name", target_town)
            geo_boost = 0.20

        # Tier 2 Geographic Priority: Regional State / Zone / Local Research Center
        elif target_region and (
            target_region.lower() in content_lower
            or any(syn in content_lower for syn in regional_synonyms)
            or (target_zone and target_zone in content_lower)
            or target_region.lower() in doc_lower
        ):
            geo_tier = "regional"
            locality_match_name = target_region
            geo_boost = 0.12

        # Tier 3 Geographic Priority: Agroecological Zone (Highland/Dega vs Lowland/Kolla)
        elif target_agroecology and any(kw in content_lower for kw in agro_keywords):
            geo_tier = "agroecological"
            locality_match_name = f"{target_agroecology} agroecological zone"
            geo_boost = 0.08

        final_score = base_score + geo_boost

        if final_score < threshold:
            continue

        is_ph = (doc_tier == 0 or "placeholder" in (doc_title or "").lower())
        candidate_passages.append(
            RetrievedPassage(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_title=doc_title or "Agricultural Guide",
                content=chunk.content,
                source_tier=doc_tier,
                score=round(final_score, 4),
                crop=chunk.crop,
                topic=chunk.topic,
                page_number=chunk.page_number,
                is_placeholder=is_ph,
                geographic_tier=geo_tier,
                locality_match=locality_match_name,
            )
        )

    # Sort candidates by combined score descending (locality-boosted items rise to top)
    candidate_passages.sort(key=lambda p: p.score, reverse=True)

    passages = candidate_passages[:top_k]

    locality_count = sum(1 for p in passages if p.geographic_tier == "locality")
    regional_count = sum(1 for p in passages if p.geographic_tier == "regional")
    logger.info(
        f"Location-aware retrieval for '{query[:30]}...' -> {len(passages)} passages "
        f"(locality={locality_count}, regional={regional_count}, target_region={target_region})"
    )
    return passages
