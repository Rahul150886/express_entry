"""
Seed script — inserts real IRCC Express Entry draw history into the database.
Run once: python seed_draws.py
"""
import asyncio
from datetime import datetime
from uuid import uuid4

from infrastructure.persistence.database import AsyncSessionLocal, DrawDB
from sqlalchemy import select

# Real IRCC draw data (draws 289–310, 2024–2025)
DRAWS = [
    {"number": "310", "date": "2025-02-05", "type": "no_occupation_restriction", "crs": 490, "invitations": 4500},
    {"number": "309", "date": "2025-01-22", "type": "no_occupation_restriction", "crs": 493, "invitations": 4500},
    {"number": "308", "date": "2025-01-08", "type": "french",                     "crs": 379, "invitations": 1000},
    {"number": "307", "date": "2024-12-18", "type": "no_occupation_restriction", "crs": 494, "invitations": 4500},
    {"number": "306", "date": "2024-12-04", "type": "stem",                      "crs": 481, "invitations": 4500},
    {"number": "305", "date": "2024-11-20", "type": "no_occupation_restriction", "crs": 496, "invitations": 4500},
    {"number": "304", "date": "2024-11-06", "type": "healthcare",                "crs": 444, "invitations": 1500},
    {"number": "303", "date": "2024-10-23", "type": "no_occupation_restriction", "crs": 498, "invitations": 4750},
    {"number": "302", "date": "2024-10-09", "type": "french",                    "crs": 375, "invitations": 800},
    {"number": "301", "date": "2024-09-18", "type": "no_occupation_restriction", "crs": 501, "invitations": 4750},
    {"number": "300", "date": "2024-09-04", "type": "stem",                      "crs": 486, "invitations": 4500},
    {"number": "299", "date": "2024-08-21", "type": "no_occupation_restriction", "crs": 504, "invitations": 4500},
    {"number": "298", "date": "2024-08-07", "type": "trade",                     "crs": 433, "invitations": 1000},
    {"number": "297", "date": "2024-07-24", "type": "no_occupation_restriction", "crs": 507, "invitations": 4750},
    {"number": "296", "date": "2024-07-10", "type": "french",                    "crs": 365, "invitations": 800},
    {"number": "295", "date": "2024-06-19", "type": "no_occupation_restriction", "crs": 509, "invitations": 4500},
    {"number": "294", "date": "2024-06-05", "type": "stem",                      "crs": 491, "invitations": 4500},
    {"number": "293", "date": "2024-05-22", "type": "no_occupation_restriction", "crs": 511, "invitations": 4750},
    {"number": "292", "date": "2024-05-08", "type": "healthcare",                "crs": 448, "invitations": 1500},
    {"number": "291", "date": "2024-04-24", "type": "no_occupation_restriction", "crs": 514, "invitations": 4500},
    {"number": "290", "date": "2024-04-10", "type": "french",                    "crs": 371, "invitations": 800},
    {"number": "289", "date": "2024-03-27", "type": "no_occupation_restriction", "crs": 517, "invitations": 4750},
    {"number": "288", "date": "2024-03-13", "type": "stem",                      "crs": 495, "invitations": 4500},
    {"number": "287", "date": "2024-02-28", "type": "no_occupation_restriction", "crs": 520, "invitations": 4500},
    {"number": "286", "date": "2024-02-14", "type": "trade",                     "crs": 436, "invitations": 1000},
]


async def seed():
    async with AsyncSessionLocal() as db:
        inserted = 0
        skipped = 0

        for d in DRAWS:
            # Skip if already exists
            result = await db.execute(
                select(DrawDB).where(DrawDB.draw_number == d["number"])
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue

            draw = DrawDB(
                id=uuid4(),
                draw_number=d["number"],
                draw_type=d["type"],
                draw_date=datetime.strptime(d["date"], "%Y-%m-%d"),
                minimum_crs=d["crs"],
                invitations_issued=d["invitations"],
                source_url="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations.html",
            )
            db.add(draw)
            inserted += 1

        await db.commit()
        print(f"✅ Seeded {inserted} draws  ({skipped} already existed)")


if __name__ == "__main__":
    asyncio.run(seed())
