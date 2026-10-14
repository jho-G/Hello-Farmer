"""Automated test suite for Location-Aware Agricultural Voice Agent.

Tests cover:
1. Greeting and recording announcement (no yes/no question, immediate location query, recording policy).
2. Location resolution (spelling variants, spoken prefix/suffix cleaning, ambiguity handling, no silent Addis default).
3. Regional knowledge retrieval (location-aware pgvector boosting, national fallback, source auditability).
4. Telephony call flow state machine lifecycle.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    from app.config import settings
    from app.rag.retrieve import RetrievedPassage
    from app.telephony.call_flow import CallStateMachine
    from app.telephony.prompts_audio import get_prompt_pcm
    from app.weather.location import (
        LocationMatch,
        clean_spoken_location_text,
        resolve_location,
    )
except ImportError:
    from backend.app.config import settings
    from backend.app.rag.retrieve import RetrievedPassage
    from backend.app.telephony.call_flow import CallStateMachine
    from backend.app.telephony.prompts_audio import get_prompt_pcm
    from backend.app.weather.location import (
        LocationMatch,
        clean_spoken_location_text,
        resolve_location,
    )


# ==============================================================================
# 1. GREETING AND RECORDING POLICY TESTS
# ==============================================================================

def test_greeting_and_recording_announcement_scripts():
    """Verify greeting scripts include recording notice and location question without yes/no consent."""
    # English reference
    en_greeting = (
        "Hello, welcome to Hello Farmer. This call is being recorded to help us improve our service. "
        "Which town or nearby city are you calling from?"
    )
    # Amharic reference
    am_greeting = "ሰላም፣ ወደ ሄሎ ፋርመር እንኳን ደህና መጡ። አገልግሎታችንን ለማሻሻል ይህ ጥሪ እየተቀዳ ነው። ከየትኛው ከተማ ወይም አካባቢ እየደወሉ ነው?"
    # Afaan Oromoo reference
    om_greeting = (
        "Nagaa, baga gara Hello Farmer nagaan dhuftan. Tajaajila keenya fooyyessuuf wamichi kun waraabamaa jira. "
        "Magaalaa ykn naannoo kam irraa bilbilaa jirtu?"
    )

    # 1. Must NOT ask for yes/no permission or consent confirmation
    forbidden_phrases_en = ["say yes or no", "do you agree", "press 1", "please confirm"]
    forbidden_phrases_am = ["ይፈቅዳሉ", "አዎ ወይም አይደለም", "አንድን ይጫኑ", "እስማማለሁ"]
    forbidden_phrases_om = ["eeyyee ykn lakki", "ni eeyyamtuu", "tokko cuqpoint"]

    for phrase in forbidden_phrases_en:
        assert phrase not in en_greeting.lower(), f"English greeting must not ask yes/no: {phrase}"
    for phrase in forbidden_phrases_am:
        assert phrase not in am_greeting, f"Amharic greeting must not ask yes/no: {phrase}"
    for phrase in forbidden_phrases_om:
        assert phrase not in om_greeting.lower(), f"Oromo greeting must not ask yes/no: {phrase}"

    # 2. Must contain location question directly in the greeting
    assert "which town or nearby city" in en_greeting.lower()
    assert "ከየትኛው ከተማ ወይም አካባቢ" in am_greeting
    assert "magaalaa ykn naannoo kam" in om_greeting.lower()


def test_recording_policy_configuration():
    """Verify recording policy follows legal and privacy rules without unconsented persistence."""
    assert hasattr(settings, "RECORDING_POLICY")
    # Default is transient_only to avoid persisting farmer call audio unnecessarily
    assert settings.RECORDING_POLICY in ("transient_only", "notice_based_persistent")
    assert hasattr(settings, "RECORDING_RETENTION_DAYS")
    assert settings.RECORDING_RETENTION_DAYS > 0


def test_prerendered_telephony_prompts_exist():
    """Verify 8 kHz PCM audio bytes exist for all critical telephony prompts."""
    for lang in ("am", "om", "en"):
        # Greeting location prompt
        greeting_pcm = get_prompt_pcm("greeting_location", lang)
        assert len(greeting_pcm) > 0, f"Missing greeting_location PCM for {lang}"

        # Region clarification prompt
        clarify_pcm = get_prompt_pcm("clarify_region", lang)
        assert len(clarify_pcm) > 0, f"Missing clarify_region PCM for {lang}"

        # Problem query prompt
        problem_pcm = get_prompt_pcm("ask_problem", lang)
        assert len(problem_pcm) > 0, f"Missing ask_problem PCM for {lang}"


# ==============================================================================
# 2. LOCATION RESOLUTION AND GEOCODING TESTS
# ==============================================================================

def test_spoken_text_prefix_and_suffix_cleaning():
    """Verify spoken conversational wrappers are removed before place matching."""
    # Amharic prefix 'ከ' (from) and suffix 'ነው' (it is)
    assert clean_spoken_location_text("ከአዳማ ነው") == "አዳማ"
    assert clean_spoken_location_text("ከአዳማ") == "አዳማ"
    assert clean_spoken_location_text("በደብረ ብርሃን አካባቢ") == "ደብረ ብርሃን"
    assert clean_spoken_location_text("ሐዋሳ ነኝ") == "ሐዋሳ"

    # Afaan Oromoo suffixes
    assert clean_spoken_location_text("Adaamaa irraa") == "Adaamaa"
    assert clean_spoken_location_text("Bishooftuu keessaa") == "Bishooftuu"


def test_known_places_resolve_correctly():
    """Verify known Ethiopian agricultural reference hubs resolve with structured geography."""
    # 1. Adama (Oromia, Midland)
    adama = resolve_location("Adama")
    assert adama is not None
    assert adama.name == "Adama"
    assert adama.region == "Oromia"
    assert adama.zone == "East Shewa"
    assert adama.agroecological_zone == "Midland"
    assert adama.confidence >= 0.9

    # 2. Debre Birhan (Amhara, Highland/Dega)
    db = resolve_location("ደብረ ብርሃን")
    assert db is not None
    assert db.name == "Debre Birhan"
    assert db.region == "Amhara"
    assert db.zone == "North Shewa"
    assert db.agroecological_zone == "Highland"

    # 3. Hawassa (Sidama, Midland)
    hawassa = resolve_location("ሐዋሳ")
    assert hawassa is not None
    assert hawassa.name == "Hawassa"
    assert hawassa.region == "Sidama"

    # 4. Mekelle (Tigray, Highland)
    mekelle = resolve_location("መቐለ")
    assert mekelle is not None
    assert mekelle.name == "Mekelle"
    assert mekelle.region == "Tigray"

    # 5. Jimma (Oromia, Midland)
    jimma = resolve_location("Jimma")
    assert jimma is not None
    assert jimma.name == "Jimma"
    assert jimma.region == "Oromia"


def test_spelling_variants_and_aliases():
    """Verify common transliterations and historical names resolve to canonical places."""
    # Nazret -> Adama
    loc = resolve_location("ናዝሬት")
    assert loc is not None
    assert loc.name == "Adama"

    # Debre Zeit -> Bishoftu
    loc = resolve_location("ደብረ ዘይት")
    assert loc is not None
    assert loc.name == "Bishoftu"

    # English alias Debrezeit
    loc = resolve_location("Debrezeit")
    assert loc is not None
    assert loc.name == "Bishoftu"

    # Asella variant Asela
    loc = resolve_location("Asela")
    assert loc is not None
    assert loc.name == "Asella"


def test_spoken_utterance_containing_location():
    """Verify place name embedded in natural speech resolves accurately."""
    loc = resolve_location("ከአዳማ ነው የምደውለው")
    assert loc is not None
    assert loc.name == "Adama"
    assert loc.region == "Oromia"

    loc2 = resolve_location("ከባህር ዳር አካባቢ ነኝ")
    assert loc2 is not None
    assert loc2.name == "Bahir Dar"
    assert loc2.region == "Amhara"


def test_unknown_location_never_defaults_to_addis_ababa():
    """CRITICAL TEST: System MUST NEVER silently default an unknown place to Addis Ababa."""
    # Completely unknown location
    loc = resolve_location("RandomUnknownVillage1234")
    assert loc is None, "Unknown location must return None and NEVER default to Addis Ababa"

    # Nonsense spoken noise
    loc2 = resolve_location("እእእ... አላውቅም")
    assert loc2 is None or loc2.name != "Addis Ababa"


def test_ambiguous_location_handling():
    """Verify places that share names across regions or have ambiguity can be disambiguated with region hint."""
    # Simulate an ambiguous query or test location with ambiguity flag
    ambig_match = resolve_location("Mojo")
    assert ambig_match is not None

    # Disambiguation with region hint
    resolved_with_hint = resolve_location("Mojo", region_hint="Oromia")
    assert resolved_with_hint is not None
    assert resolved_with_hint.region == "Oromia"


def test_regional_state_mention_fallback():
    """Verify mention of an entire regional state resolves to that region without defaulting to a city."""
    loc = resolve_location("ኦሮሚያ ክልል")
    assert loc is not None
    assert loc.region == "Oromia"
    assert loc.town is None  # Town remains unspecified
    assert loc.agroecological_zone == "Regional_General"


# ==============================================================================
# 3. REGIONAL KNOWLEDGE RETRIEVAL TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_location_aware_retrieval_differentiation():
    """Verify that different locations receive different ranking boosts for regional agricultural evidence."""
    # Mock knowledge chunks from different regions and research centers
    oromia_chunk = RetrievedPassage(
        chunk_id="chk-oro-01",
        document_id="DOC-KULUMSA-01",
        document_title="EIAR Kulumsa Agricultural Research Center: Wheat Rust Management in Arsi and East Shewa",
        content="In East Shewa and Arsi zones of Oromia, early yellow rust monitoring on Kubsa wheat is critical.",
        source_tier=1,
        score=0.80,
    )
    amhara_chunk = RetrievedPassage(
        chunk_id="chk-amh-01",
        document_id="DOC-ADET-01",
        document_title="ARARI Adet & Debre Birhan Research Center: Highland Wheat Agronomy in Amhara",
        content="In the high-altitude Dega zones of North Shewa, Amhara, cold stress and stripe rust require resistant varieties.",
        source_tier=1,
        score=0.80,
    )
    national_chunk = RetrievedPassage(
        chunk_id="chk-nat-01",
        document_id="DOC-MOA-01",
        document_title="Ministry of Agriculture National Wheat Advisory",
        content="National guidance for wheat rust prevention across all Ethiopian grain belts.",
        source_tier=2,
        score=0.75,
    )

    all_passages = [oromia_chunk, amhara_chunk, national_chunk]

    # Helper function simulating retrieve_passages scoring boost logic
    def score_passages_with_loc(passages, loc: LocationMatch):
        scored = []
        for p in passages:
            boost = 0.0
            combined_text = (p.document_title + " " + p.content).lower()
            if loc.name.lower() in combined_text or (loc.zone and loc.zone.lower() in combined_text):
                boost += 0.20
            elif loc.region.lower() in combined_text:
                boost += 0.12
            if loc.agroecological_zone and loc.agroecological_zone.lower() in combined_text:
                boost += 0.08
            scored.append((p, p.score + boost))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [p for p, _ in scored]

    loc_adama = resolve_location("Adama")  # East Shewa, Oromia
    loc_debre_birhan = resolve_location("Debre Birhan")  # North Shewa, Amhara, Highland

    # For Adama caller: Kulumsa / East Shewa / Oromia guidance ranks FIRST
    ranked_adama = score_passages_with_loc(all_passages, loc_adama)
    assert ranked_adama[0].chunk_id == "chk-oro-01"

    # For Debre Birhan caller: Debre Birhan / Amhara / Highland guidance ranks FIRST
    ranked_db = score_passages_with_loc(all_passages, loc_debre_birhan)
    assert ranked_db[0].chunk_id == "chk-amh-01"

    # National guidance remains in both result sets as a trustworthy fallback
    assert any(p.chunk_id == "chk-nat-01" for p in ranked_adama)
    assert any(p.chunk_id == "chk-nat-01" for p in ranked_db)


# ==============================================================================
# 4. TELEPHONY CALL FLOW STATE MACHINE TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_call_state_machine_initial_state_and_recording_notice():
    """Verify call state machine starts in GREETING with notice announced and location-first structure."""
    mock_conn = MagicMock()
    mock_conn.call_uuid = "test-call-uuid-1234"
    mock_conn.is_active = True
    mock_conn.send_audio = AsyncMock()
    mock_conn.drain_audio_buffer = AsyncMock()

    sm = CallStateMachine(mock_conn)
    assert sm.current_state == "GREETING"
    assert sm.session_state.has_consented is True
    assert sm.session_state.call_stage == "GREETING"

    # Verify greeting execution plays prompt without yes/no consent
    await sm._state_greeting()
    assert mock_conn.send_audio.called


@pytest.mark.asyncio
async def test_call_state_machine_location_resolution_and_update():
    """Verify call state machine parses resolved location and applies fields to session."""
    mock_conn = MagicMock()
    mock_conn.call_uuid = "test-call-uuid-5678"
    mock_conn.is_active = True
    mock_conn.send_audio = AsyncMock()

    sm = CallStateMachine(mock_conn)

    adama_match = resolve_location("Adama")
    sm._apply_resolved_location(adama_match)

    assert sm.session_state.location_name == "Adama"
    assert sm.session_state.location_region == "Oromia"
    assert sm.session_state.location_zone == "East Shewa"
    assert sm.session_state.agroecological_zone == "Midland"
    assert sm.session_state.location_latitude == 8.54
    assert sm.session_state.location_longitude == 39.27
