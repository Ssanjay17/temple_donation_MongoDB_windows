# faq_routes.py — FAQ Chatbot API  (Jagannath Temple Donation System)
# Endpoints: /faq/session  /faq/ask  /faq/items  /faq/items/{id}  /faq/sessions
#
# Collections used:
#   faq_items          : {_id, question, answer, keywords[], created_at}
#   faq_chat_sessions  : {_id, name, phone, created_at, messages[]}

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import re

from database import get_db, get_next_id

router = APIRouter(prefix="/faq", tags=["FAQ Chatbot"])


# ─────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────

class FAQItemCreate(BaseModel):
    question: str
    answer:   str
    keywords: List[str] = []

class FAQItemUpdate(BaseModel):
    question: Optional[str] = None
    answer:   Optional[str] = None
    keywords: Optional[List[str]] = None

class FAQSessionCreate(BaseModel):
    name:  str
    phone: str

class FAQAskRequest(BaseModel):
    session_id: int
    question:   str


# ─────────────────────────────────────────
# KEYWORD MATCHING HELPER
# ─────────────────────────────────────────


# ─────────────────────────────────────────
# GREETING DETECTION
# ─────────────────────────────────────────
_GREETINGS = {
    "hi", "hello", "hey", "helo", "hii", "hiii", "hai",
    "good morning", "good afternoon", "good evening", "good night",
    "namaste", "namaskar", "jai jagannath", "om", "greetings",
}
_THANKS = {
    "thank you", "thanks", "thank u", "thankyou", "ty",
    "dhanyavad", "dhanyabad", "shukriya", "ok", "okay", "ok thanks",
    "got it", "noted", "understood", "great", "nice", "good",
}

def _detect_greeting(text: str) -> Optional[str]:
    """Return a greeting/thanks reply if the message is a greeting, else None."""
    t = text.strip().lower()
    if t in _GREETINGS:
        return (
            "\U0001f64f Jai Jagannath! Welcome to the Temple Help Desk.\n\n"
            "I'm here to help you with any questions about the seva booking form \u2014 "
            "gotra, nakshatra, zodiac, donation, OTP, and more.\n\n"
            "Please tap a quick question above or type what you'd like to know! \U0001f33a"
        )
    if t in _THANKS:
        return (
            "\U0001f64f You're most welcome! It's our humble service.\n\n"
            "If you have any more questions about your seva booking, feel free to ask. "
            "Jai Jagannath! \U0001f338"
        )
    return None

def _tokenize(text: str) -> List[str]:
    """Lower-case word tokens, length > 2."""
    return [w for w in re.findall(r'\b[a-zA-Z0-9]+\b', text.lower()) if len(w) > 2]

def _find_matching_faqs(db, user_question: str, limit: int = 3) -> list:
    """
    Score every FAQ item by overlap between user tokens and
    the FAQ's question words + explicit keywords.
    Returns up to `limit` items sorted best-first.
    """
    user_tokens = set(_tokenize(user_question))
    if not user_tokens:
        return []

    all_faqs = list(db["faq_items"].find({}))
    scored   = []

    for faq in all_faqs:
        faq_terms = set(
            _tokenize(faq.get("question", ""))
            + [k.lower() for k in faq.get("keywords", [])]
        )
        score = len(user_tokens & faq_terms)
        if score > 0:
            scored.append((score, faq))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored[:limit]]


# ─────────────────────────────────────────
# FAQ ITEM  CRUD  (admin use)
# ─────────────────────────────────────────

@router.get("/items")
def list_faq_items(db=Depends(get_db)):
    """Return all FAQ items (for suggestion chips + admin management)."""
    items = list(db["faq_items"].find({}, {"_id": 1, "question": 1, "answer": 1, "keywords": 1}))
    return [
        {"id": i["_id"], "question": i["question"],
         "answer": i["answer"], "keywords": i.get("keywords", [])}
        for i in items
    ]

@router.post("/items", status_code=201)
def create_faq_item(data: FAQItemCreate, db=Depends(get_db)):
    """Add a new FAQ entry."""
    if not data.question.strip() or not data.answer.strip():
        raise HTTPException(400, "Question and answer are required.")
    fid = get_next_id("faq_items")
    db["faq_items"].insert_one({
        "_id":        fid,
        "question":   data.question.strip(),
        "answer":     data.answer.strip(),
        "keywords":   [k.lower().strip() for k in data.keywords],
        "created_at": datetime.utcnow().isoformat(),
    })
    return {"id": fid, "message": "FAQ item created."}

@router.put("/items/{faq_id}")
def update_faq_item(faq_id: int, data: FAQItemUpdate, db=Depends(get_db)):
    """Update an existing FAQ entry."""
    update: dict = {}
    if data.question  is not None: update["question"]  = data.question.strip()
    if data.answer    is not None: update["answer"]    = data.answer.strip()
    if data.keywords  is not None: update["keywords"]  = [k.lower().strip() for k in data.keywords]
    if not update:
        raise HTTPException(400, "Nothing to update.")
    result = db["faq_items"].update_one({"_id": faq_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "FAQ item not found.")
    return {"message": "Updated."}

@router.delete("/items/{faq_id}")
def delete_faq_item(faq_id: int, db=Depends(get_db)):
    """Delete a FAQ entry."""
    result = db["faq_items"].delete_one({"_id": faq_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "FAQ item not found.")
    return {"message": "Deleted."}


# ─────────────────────────────────────────
# CHAT SESSION
# ─────────────────────────────────────────

@router.post("/session", status_code=201)
def create_faq_session(data: FAQSessionCreate, db=Depends(get_db)):
    """
    Start a new chat session.  Stores visitor name + phone in DB.
    Returns session_id used in subsequent /ask calls.
    """
    name  = data.name.strip()
    phone = data.phone.strip()
    if not name:
        raise HTTPException(400, "Name is required.")
    if not phone or not re.fullmatch(r'[\d\s\+\-\(\)]{7,20}', phone):
        raise HTTPException(400, "A valid phone number is required.")

    sid = get_next_id("faq_chat_sessions")
    db["faq_chat_sessions"].insert_one({
        "_id":        sid,
        "name":       name,
        "phone":      phone,
        "created_at": datetime.utcnow().isoformat(),
        "messages":   [],
    })
    return {"session_id": sid, "name": name}


@router.post("/ask")
def ask_faq(data: FAQAskRequest, db=Depends(get_db)):
    """
    Match user question against FAQ items using keyword overlap.
    Logs the exchange to the session.  Returns best answer + related matches.
    """
    session = db["faq_chat_sessions"].find_one({"_id": data.session_id})
    if not session:
        raise HTTPException(404, "Session not found. Please start a new session.")

    question = data.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty.")

    # ── Check for greeting / thanks first ──
    greeting_reply = _detect_greeting(question)
    if greeting_reply:
        db["faq_chat_sessions"].update_one(
            {"_id": data.session_id},
            {"$push": {"messages": {
                "user_question": question,
                "answer":        greeting_reply,
                "matches_count": 0,
                "timestamp":     datetime.utcnow().isoformat(),
            }}}
        )
        return {"answer": greeting_reply, "matches": [], "related": []}

    matches = _find_matching_faqs(db, question)

    if matches:
        primary_answer = matches[0]["answer"]
        related = [
            {"question": m["question"], "answer": m["answer"]}
            for m in matches[1:]
        ]
    else:
        primary_answer = (
            "\U0001f64f I\'m sorry, I couldn\'t find an answer to your question. "
            "Please contact our temple office or speak to a staff member for assistance."
        )
        related = []

    # Persist message to session
    db["faq_chat_sessions"].update_one(
        {"_id": data.session_id},
        {"$push": {"messages": {
            "user_question": question,
            "answer":        primary_answer,
            "matches_count": len(matches),
            "timestamp":     datetime.utcnow().isoformat(),
        }}}
    )

    return {
        "answer":  primary_answer,
        "matches": [{"question": m["question"], "answer": m["answer"]} for m in matches],
        "related": related,
    }


# ─────────────────────────────────────────
# SESSION HISTORY  (admin use)
# ─────────────────────────────────────────

@router.get("/sessions")
def list_faq_sessions(limit: int = 50, db=Depends(get_db)):
    """List recent chat sessions (admin/reporting use)."""
    sessions = list(
        db["faq_chat_sessions"]
        .find({}, {"_id": 1, "name": 1, "phone": 1, "created_at": 1, "messages": 1})
        .sort("_id", -1)
        .limit(limit)
    )
    return [
        {
            "id":           s["_id"],
            "name":         s["name"],
            "phone":        s["phone"],
            "created_at":   s["created_at"],
            "message_count": len(s.get("messages", [])),
        }
        for s in sessions
    ]