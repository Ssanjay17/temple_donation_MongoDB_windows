# database.py — MongoDB edition
# Replaces SQLAlchemy/MySQL setup with PyMongo.
# Uses auto-increment integer IDs (via a "counters" collection)
# so all existing endpoint logic keeps working with numeric IDs.

import os
from pymongo import MongoClient, ASCENDING
from pymongo.collection import Collection
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "temple_donation")

if not MONGO_URI:
    raise RuntimeError(
        "Missing MONGO_URI. Check your .env file has MONGO_URI set correctly."
    )

client      = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db_instance = client[DB_NAME]


# ─────────────────────────────────────────
# AUTO-INCREMENT HELPER
# Uses a dedicated "counters" collection.
# Each document: { _id: "<collection_name>", seq: <int> }
# ─────────────────────────────────────────
def get_next_id(collection_name: str) -> int:
    """Return the next auto-increment integer ID for the given collection."""
    result = db_instance["counters"].find_one_and_update(
        {"_id": collection_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,   # pymongo ReturnDocument.AFTER equivalent
    )
    return result["seq"]


# ─────────────────────────────────────────
# DB DEPENDENCY  (FastAPI Depends)
# ─────────────────────────────────────────
def get_db():
    """Yield the MongoDB database instance. Compatible with FastAPI Depends."""
    yield db_instance


# ─────────────────────────────────────────
# INDEX SETUP
# Call once at startup to create unique/compound indexes.
# ─────────────────────────────────────────
def create_indexes():
    db = db_instance

    # users
    db["users"].create_index("username",     unique=True)
    db["users"].create_index("email",        unique=True, sparse=True)

    # user_roles
    db["user_roles"].create_index("role_name", unique=True)

    # zodiac
    db["zodiac"].create_index("zodiac_order")

    # birthstar
    db["birthstar"].create_index([("zodiac_id", ASCENDING), ("star_order", ASCENDING)])

    # gotra
    db["gotra"].create_index("gotra_name", unique=True)

    # donors
    db["donors"].create_index("whatsapp_number", unique=True)
    db["donors"].create_index("email",           unique=True)
    db["donors"].create_index("first_name")

    # seva
    db["seva"].create_index("seva_name", unique=True)

    # seva_donations
    db["seva_donations"].create_index("receipt_no", unique=True)
    db["seva_donations"].create_index("donor_id")
    db["seva_donations"].create_index("seva_id")

    # seva_persons
    db["seva_persons"].create_index("seva_donation_id", unique=True)

    # seva_person_relations
    db["seva_person_relations"].create_index("seva_person_id")

    # purnima_names
    db["purnima_names"].create_index("name",          unique=True)
    db["purnima_names"].create_index("display_order")

    # amavasya_names
    db["amavasya_names"].create_index("name",          unique=True)
    db["amavasya_names"].create_index("display_order")

    # krishna_paksha_tithis
    db["krishna_paksha_tithis"].create_index("tithi_name",   unique=True)
    db["krishna_paksha_tithis"].create_index("tithi_number")

    # shukla_paksha_tithis
    db["shukla_paksha_tithis"].create_index("tithi_name",   unique=True)
    db["shukla_paksha_tithis"].create_index("tithi_number")