"""Verifies the 14 protected pre-v2 records in memory/data_preservation.json are
byte-equivalent (canonical JSON, _id excluded) to the raw Mongo records right now.

Reads Mongo directly (not through the app object) because the preservation
contract is specifically about the stored documents surviving the v2 migration
untouched, independent of API serialization changes.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path(__file__).parent.parent
load_dotenv(BACKEND_DIR / ".env")

PRESERVATION_FILE = Path(__file__).parent.parent.parent / "memory" / "data_preservation.json"


@pytest.mark.asyncio
async def test_protected_records_hash_unchanged():
    baseline = json.loads(PRESERVATION_FILE.read_text())
    ids = baseline["ids"]
    assert len(ids) == baseline["count"] == 14

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        records = []
        async for doc in db["analyses"].find({"id": {"$in": ids}}):
            doc.pop("_id", None)
            records.append(doc)
    finally:
        client.close()

    assert len(records) == 14, f"expected all 14 protected ids present, found {len(records)}"
    records.sort(key=lambda r: r["id"])
    canonical = json.dumps(records, sort_keys=True, default=str)
    digest = hashlib.sha256(canonical.encode()).hexdigest()

    assert digest == baseline["sha256"], (
        "protected pre-v2 records changed: canonical hash mismatch "
        f"(expected {baseline['sha256']}, got {digest})"
    )
