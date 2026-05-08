# models.py — MongoDB edition
# Replaces SQLAlchemy ORM models with:
#   1. Collection name constants
#   2. A Row() wrapper that gives dot-access to MongoDB documents
#      (so all existing  donor.first_name / user.is_admin usage still works)
#   3. Thin helper functions for common query patterns

from datetime import datetime
import enum


# ─────────────────────────────────────────
# ENUMS  (unchanged from v11.0)
# ─────────────────────────────────────────
class GenderEnum(str, enum.Enum):
    Male   = "Male"
    Female = "Female"

class CalendarTypeEnum(str, enum.Enum):
    English = "English"
    Hindu   = "Hindu"

class ProfessionEnum(str, enum.Enum):
    Work    = "Work"
    Student = "Student"

class SevaTypeEnum(str, enum.Enum):
    OneTime = "One Time"
    Regular = "Regular"


# ─────────────────────────────────────────
# COLLECTION NAME CONSTANTS
# ─────────────────────────────────────────
COL_USERS                  = "users"
COL_USER_ROLES             = "user_roles"
COL_ZODIAC                 = "zodiac"
COL_BIRTHSTAR              = "birthstar"
COL_GOTRA                  = "gotra"
COL_DONORS                 = "donors"
COL_SEVA                   = "seva"
COL_SEVA_DONATIONS         = "seva_donations"
COL_SEVA_PERSONS           = "seva_persons"
COL_SEVA_PERSON_RELATIONS  = "seva_person_relations"
COL_PURNIMA_NAMES          = "purnima_names"
COL_AMAVASYA_NAMES         = "amavasya_names"
COL_KRISHNA_PAKSHA_TITHIS  = "krishna_paksha_tithis"
COL_SHUKLA_PAKSHA_TITHIS   = "shukla_paksha_tithis"
COL_COUNTERS               = "counters"


# ─────────────────────────────────────────
# ROW WRAPPER
# Converts a MongoDB document dict into an object with attribute access,
# mapping "_id" → "id" so all existing .id references keep working.
# ─────────────────────────────────────────
class Row:
    """
    Thin wrapper around a pymongo document dict.

    Usage:
        doc  = db["users"].find_one({"username": "Administrator"})
        user = Row(doc)
        print(user.id, user.username, user.is_admin)
    """
    __slots__ = ("_data",)

    def __init__(self, doc: dict | None):
        if doc is None:
            self._data = {}
        else:
            d = dict(doc)
            # Normalise MongoDB "_id" → "id"
            if "_id" in d and "id" not in d:
                d["id"] = d.pop("_id")
            elif "_id" in d:
                d.pop("_id")          # keep "id" already present
            self._data = d

    # Attribute access
    def __getattr__(self, name: str):
        try:
            return self._data[name]
        except KeyError:
            return None   # return None for missing fields (mirrors SQLAlchemy behaviour)

    def __setattr__(self, name: str, value):
        if name == "_data":
            object.__setattr__(self, name, value)
        else:
            self._data[name] = value

    def __bool__(self):
        return bool(self._data)

    def __repr__(self):
        return f"Row({self._data!r})"

    # Allow dict(row) for compatibility
    def __iter__(self):
        return iter(self._data.items())

    def items(self):
        return self._data.items()

    def get(self, key, default=None):
        return self._data.get(key, default)


# ─────────────────────────────────────────
# QUERY HELPERS
# Drop-in replacements for the most common SQLAlchemy patterns.
# ─────────────────────────────────────────

def find_one(collection, query: dict) -> Row | None:
    """Return first matching document as a Row, or None."""
    doc = collection.find_one(query)
    return Row(doc) if doc else None


def find_all(collection, query: dict = None, sort_field: str = None,
             sort_dir: int = 1) -> list[Row]:
    """Return all matching documents as a list of Rows."""
    cursor = collection.find(query or {})
    if sort_field:
        cursor = cursor.sort(sort_field, sort_dir)
    return [Row(doc) for doc in cursor]


def count_docs(collection, query: dict = None) -> int:
    return collection.count_documents(query or {})


def insert_one(collection, doc: dict, next_id: int) -> Row:
    """
    Insert a document with an auto-increment integer _id.
    Adds 'created_at' automatically if not already present.
    Returns the inserted document wrapped in a Row.
    """
    doc = dict(doc)
    doc["_id"] = next_id
    if "created_at" not in doc:
        doc["created_at"] = datetime.utcnow()
    collection.insert_one(doc)
    return Row(doc)


def update_one(collection, query: dict, updates: dict):
    """Thin wrapper for find_one_and_update (set operation)."""
    collection.update_one(query, {"$set": updates})


def delete_one(collection, query: dict):
    collection.delete_one(query)


def delete_many(collection, query: dict):
    collection.delete_many(query)


# ─────────────────────────────────────────
# DOCUMENT SHAPE TEMPLATES
# These replace SQLAlchemy model constructors.
# Each function returns a plain dict ready for insert_one().
# ─────────────────────────────────────────

def user_doc(username, hashed_password, is_admin=0,
             email=None, phone_number=None, role_name=None) -> dict:
    return {
        "username":        username,
        "hashed_password": hashed_password,
        "is_admin":        is_admin,
        "email":           email,
        "phone_number":    phone_number,
        "role_name":       role_name,
    }


def user_role_doc(role_name: str) -> dict:
    return {"role_name": role_name}


def donor_doc(**fields) -> dict:
    return fields


def seva_doc(seva_name, seva_description=None,
             default_amount_one_time=0.0, default_amount_regular=0.0,
             is_active=1) -> dict:
    return {
        "seva_name":               seva_name,
        "seva_description":        seva_description,
        "default_amount_one_time": default_amount_one_time,
        "default_amount_regular":  default_amount_regular,
        "is_active":               is_active,
    }


def seva_donation_doc(donor_id, seva_id, seva_type, donation_amount,
                      transaction_id, receipt_no, seva_image=None) -> dict:
    return {
        "donor_id":        donor_id,
        "seva_id":         seva_id,
        "seva_type":       seva_type,
        "donation_amount": float(donation_amount),
        "transaction_id":  transaction_id,
        "receipt_no":      receipt_no,
        "seva_image":      seva_image,
    }


def seva_person_doc(seva_donation_id, first_name, middle_name, last_name,
                    gotra_id, birthstar_id, zodiac_id,
                    seva_calendar_type, seva_english_date, seva_hindu_date,
                    seva_purnima_name_id, seva_krishna_tithi_id,
                    seva_amavasya_name_id, seva_shukla_tithi_id) -> dict:
    return {
        "seva_donation_id":       seva_donation_id,
        "first_name":             first_name,
        "middle_name":            middle_name,
        "last_name":              last_name,
        "gotra_id":               gotra_id,
        "birthstar_id":           birthstar_id,
        "zodiac_id":              zodiac_id,
        "seva_calendar_type":     seva_calendar_type,
        "seva_english_date":      str(seva_english_date) if seva_english_date else None,
        "seva_hindu_date":        seva_hindu_date,
        "seva_purnima_name_id":   seva_purnima_name_id,
        "seva_krishna_tithi_id":  seva_krishna_tithi_id,
        "seva_amavasya_name_id":  seva_amavasya_name_id,
        "seva_shukla_tithi_id":   seva_shukla_tithi_id,
    }


def seva_person_relation_doc(seva_person_id, relation_type, first_name, middle_name,
                              last_name, gender, zodiac_id, birthstar_id, gotra_id,
                              birthdate=None, email=None, phone=None,
                              profession=None, designation=None, institution=None) -> dict:
    return {
        "seva_person_id": seva_person_id,
        "relation_type":  relation_type,
        "first_name":     first_name,
        "middle_name":    middle_name,
        "last_name":      last_name,
        "gender":         gender,
        "zodiac_id":      zodiac_id,
        "birthstar_id":   birthstar_id,
        "gotra_id":       gotra_id,
        "birthdate":      str(birthdate) if birthdate else None,
        "email":          email,
        "phone":          phone,
        "profession":     profession,
        "designation":    designation,
        "institution":    institution,
    }