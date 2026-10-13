"""CLI Script to ingest knowledge base documents into PostgreSQL pgvector."""
import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.config import settings
from backend.app.rag.ingest import parse_and_validate_document
from backend.app.rag.store import store_ingested_document


async def main():
    print("=" * 80)
    print("HELLO FARMER: KNOWLEDGE BASE INGESTION PIPELINE (PHASE 3)")
    print("=" * 80)

    kb_dir = Path("knowledge_base/raw")
    if not kb_dir.exists():
        print(f"Directory {kb_dir} does not exist!")
        return

    doc_files = sorted(
        [f for f in kb_dir.rglob("*") if f.is_file() and f.suffix.lower() in (".txt", ".pdf", ".docx", ".md")],
        key=lambda p: str(p),
    )
    print(f"Found {len(doc_files)} candidate documents in {kb_dir}", flush=True)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    total_chunks = 0
    accepted_docs = 0
    rejected_docs = 0

    for idx, doc_file in enumerate(doc_files, 1):
        try:
            doc = parse_and_validate_document(str(doc_file))
            if doc is None:
                continue
            async with session_factory() as session:
                num_chunks = await store_ingested_document(doc, session)
            tier_label = "Placeholder" if doc.is_placeholder else f"Tier {doc.source_tier}"
            print(f"  [{idx}/{len(doc_files)}] ✓ [{tier_label}] {doc.title} ({num_chunks} chunks)", flush=True)
            total_chunks += num_chunks
            accepted_docs += 1
        except ValueError as e:
            print(f"  [{idx}/{len(doc_files)}] ✗ REJECTED: {doc_file.name} -> {e}", flush=True)
            rejected_docs += 1
        except Exception as e:
            print(f"  [{idx}/{len(doc_files)}] ✗ Error ingesting {doc_file.name}: {e}", flush=True)
            rejected_docs += 1

    await engine.dispose()

    print("-" * 80, flush=True)
    print(f"Ingestion complete: {accepted_docs} accepted, {rejected_docs} rejected. Total chunks: {total_chunks}", flush=True)
    print("=" * 80, flush=True)


if __name__ == "__main__":
    asyncio.run(main())
