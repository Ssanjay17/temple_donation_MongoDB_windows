# JAGANNATH TEMPLE DONATION SYSTEM — main.py  v11.0  (MongoDB edition)
#
# Database backend converted from MySQL/SQLAlchemy → MongoDB/PyMongo.
# All endpoint logic, schemas, OTP flows, email/WhatsApp helpers are unchanged.
#
# Key changes:
#   - database.py   : MongoClient + get_db() + get_next_id() (auto-increment IDs)
#   - models.py     : Row wrapper + collection constants (no ORM)
#   - SQLAlchemy Session replaced with pymongo Database everywhere
#   - db.query(...).filter(...).first()  → db["col"].find_one({...})
#   - db.query(...).filter(...).all()    → list(db["col"].find({...}))
#   - db.add(obj); db.commit()           → db["col"].insert_one(doc)
#   - db.delete(obj); db.commit()        → db["col"].delete_one({...})
#   - IntegrityError replaced with duplicate-key detection (WriteError code 11000)

from fastapi import FastAPI, Depends, HTTPException, Query, Request, Body, BackgroundTasks
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional
import os, smtplib, random, time, requests as http_requests, base64, logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, WriteError

# ── Load .env FIRST ──
load_dotenv()

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")

from passlib.context import CryptContext

from database import get_db, get_next_id, db_instance, create_indexes
from faq_routes import router as faq_router
from models import (
    Row,
    find_one, find_all, count_docs, insert_one, update_one, delete_one, delete_many,
    user_doc, user_role_doc, donor_doc, seva_doc,
    seva_donation_doc, seva_person_doc, seva_person_relation_doc,
    COL_USERS, COL_USER_ROLES, COL_DONORS, COL_ZODIAC, COL_BIRTHSTAR, COL_GOTRA,
    COL_SEVA, COL_SEVA_DONATIONS, COL_SEVA_PERSONS, COL_SEVA_PERSON_RELATIONS,
    COL_PURNIMA_NAMES, COL_AMAVASYA_NAMES,
    COL_KRISHNA_PAKSHA_TITHIS, COL_SHUKLA_PAKSHA_TITHIS,
)
from schemas import (
    AdminSetupSchema, UserSignupSchema, AdminLoginSchema,
    UserCreateByAdmin, RoleCreate,
    SetupPhoneOtpRequest, SetupPhoneOtpVerify,
    OtpRequest, OtpVerify,
    PhoneOtpRequest, PhoneOtpVerify,
    AdminChangePwOtpRequest, AdminChangePwSet,
    ForgotRequest, ForgotVerify, ForgotSetPassword,
    DonorCreate,
    SevaDonationCreate, SevaDonationUpdate, SevaCreate,
    PurnimaNameOut, AmavasyanNameOut,
    KrishnaPakshaTithiOut, ShuklaPakshaTithiOut,
    ADMIN_DEFAULT_USERNAME,
    CreateDonorFullRequest,
)


# ─────────────────────────────────────────
# SMTP CONFIG
# ─────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM",     SMTP_USER)

# ─────────────────────────────────────────
# WHATSAPP (co3.live) CONFIG
# ─────────────────────────────────────────
WA_API_KEY         = os.getenv("WA_API_KEY",         "")
WA_PHONE_NUMBER_ID = os.getenv("WA_PHONE_NUMBER_ID", "")
WA_TEMPLATE_ID     = os.getenv("WA_TEMPLATE_ID",     "")
WA_TEMPLATE_NAME   = os.getenv("WA_TEMPLATE_NAME",   "")
WA_API_BASE        = os.getenv("WA_API_BASE",        "https://partnersv1.pinbot.ai/v3")

# ─────────────────────────────────────────
# MESSAGE WALL (SMS OTP) CONFIG
# ─────────────────────────────────────────
MESSAGEWALL_API_KEY           = os.getenv("MESSAGEWALL_API_KEY",    "")
MESSAGEWALL_SENDER_ID         = os.getenv("MESSAGEWALL_SENDER_ID",  "JGNATH")
MESSAGEWALL_TEMPLATE_ID       = os.getenv("MESSAGEWALL_TEMPLATE_ID","")
MESSAGEWALL_ROUTE             = os.getenv("MESSAGEWALL_ROUTE",      "2")
MESSAGEWALL_API_URL           = os.getenv("MESSAGEWALL_API_URL",    "http://text.messagewall.in/api/smsapi")
MESSAGEWALL_SETUP_TEMPLATE_ID = os.getenv("MESSAGEWALL_SETUP_TEMPLATE_ID", MESSAGEWALL_TEMPLATE_ID)

# ─────────────────────────────────────────
# GEMINI IMAGE GENERATION CONFIG
# Free API key → https://aistudio.google.com/apikey  (no credit card needed)
# Free tier: 500 images/day, 10 req/min
# Falls back to Pollinations.ai automatically if key missing or quota exhausted
#
# ✅ CORRECT model for image generation: gemini-2.0-flash-exp-image-generation
#    (gemini-2.5-flash-image does NOT exist and returns text-only responses)
# ─────────────────────────────────────────
GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY", "")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.0-flash-exp-image-generation")
_GEMINI_IMG_URL    = ("https://generativelanguage.googleapis.com/v1beta"
                      "/models/{model}:generateContent?key={key}")

# ── Startup guard: catch wrong model names immediately ──────────────────────
# gemini-2.0-flash-exp-image-generation → RETIRED (404 since late 2025)
# gemini-2.5-flash-image                → current GA image-generation model
# gemini-3-flash-preview                → text-only, returns NO_IMAGE
_KNOWN_IMAGE_MODELS = {
    "gemini-2.5-flash-image",              # GA stable  (use this)
    "gemini-2.5-flash-image-preview",      # deprecated alias — still works
    "gemini-2.0-flash-preview-image-generation",  # older preview — may still work
}
if GEMINI_API_KEY and GEMINI_IMAGE_MODEL not in _KNOWN_IMAGE_MODELS:
    import warnings as _warnings
    _warnings.warn(
        f"\n\n⚠  GEMINI_IMAGE_MODEL='{GEMINI_IMAGE_MODEL}' is not a known image-generation model.\n"
        f"   Set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image in your .env\n"
        f"   Falling back to Pollinations for now.\n",
        stacklevel=1,
    )
    logging.getLogger("gemini_img").error(
        "GEMINI_IMAGE_MODEL='%s' is not an image-generation model — "
        "Gemini disabled, Pollinations fallback active.",
        GEMINI_IMAGE_MODEL,
    )
    GEMINI_API_KEY = ""   # disable Gemini so Pollinations activates immediately
# ───────────────────────────────────────────────────────────────────────────

# In-process OTP / verified-phone state
_otp_store:             dict = {}
_verified_emails:       set  = set()
OTP_EXPIRY_SECONDS            = 300
_phone_otp_store:       dict = {}
_verified_phones:       set  = set()
_setup_phone_otp_store: dict = {}
_setup_verified_phones: set  = set()


# ─────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Jagannath Temple Donation System", version="11.0.0-mongo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Create MongoDB indexes on startup
create_indexes()

# ── Register FAQ chatbot routes ──
app.include_router(faq_router)


# ─────────────────────────────────────────
# HOME PAGE
# ─────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ═══════════════════════════════════════════════════════════
# AUTH — SETUP STATUS
# ═══════════════════════════════════════════════════════════
@app.get("/auth/setup-status")
def setup_status(db=Depends(get_db)):
    user_count = count_docs(db[COL_USERS])
    smtp_ok    = bool(SMTP_USER and SMTP_PASSWORD)
    return {
        "setup_complete":  user_count > 0,
        "admin_username":  ADMIN_DEFAULT_USERNAME,
        "smtp_configured": smtp_ok,
    }


# ═══════════════════════════════════════════════════════════
# AUTH — ADMIN SETUP PHONE OTP
# ═══════════════════════════════════════════════════════════
@app.post("/auth/setup/send-phone-otp")
def setup_send_phone_otp(data: SetupPhoneOtpRequest, db=Depends(get_db)):
    if count_docs(db[COL_USERS]) > 0:
        raise HTTPException(403, "Setup already completed.")

    phone = data.phone_number.strip()
    if not phone:
        raise HTTPException(400, "Phone number is required.")
    if not MESSAGEWALL_API_KEY:
        raise HTTPException(503, "SMS service is not configured. Add MESSAGEWALL_API_KEY to .env.")

    otp    = str(random.randint(100000, 999999))
    expiry = time.time() + OTP_EXPIRY_SECONDS
    _setup_phone_otp_store[phone] = {"otp": otp, "expires": expiry}

    message = f"Welcome To Administrator Registration Here your OTP is {otp} VECTRA"
    number_digits = phone.lstrip("+")
    params = {
        "key": MESSAGEWALL_API_KEY, "route": MESSAGEWALL_ROUTE,
        "sender": MESSAGEWALL_SENDER_ID, "number": number_digits,
        "sms": message, "templateid": MESSAGEWALL_SETUP_TEMPLATE_ID,
    }
    try:
        resp = http_requests.get(MESSAGEWALL_API_URL, params=params, timeout=15)
        body = resp.text.strip()
        print(f"[MessageWall Setup OTP] HTTP {resp.status_code} | response: {body!r}")
        resp.raise_for_status()
        MESSAGEWALL_ERRORS = {
            "101": "Invalid API user.", "102": "Invalid Sender ID.",
            "103": "Invalid mobile number.", "104": "Invalid Route.",
            "105": "Invalid message.", "106": "Spam blocked.",
            "107": "Promotional block.", "108": "Insufficient credits.",
            "109": "Promotional route time restriction.", "110": "Invalid DLT Template ID.",
            "111": "Invalid schedule time.",
        }
        if body in MESSAGEWALL_ERRORS:
            _setup_phone_otp_store.pop(phone, None)
            raise HTTPException(500, f"SMS failed (code {body}): {MESSAGEWALL_ERRORS[body]}")
        if body.upper().startswith(("ERROR", "FAIL", "INVALID", "REJECTED", "BLOCKED")):
            _setup_phone_otp_store.pop(phone, None)
            raise HTTPException(500, f"SMS gateway error: {body}")
    except http_requests.RequestException as e:
        _setup_phone_otp_store.pop(phone, None)
        raise HTTPException(500, f"SMS gateway unreachable: {str(e)}")

    masked = phone[:3] + "****" + phone[-3:] if len(phone) > 6 else "****"
    return {"success": True, "masked_phone": masked,
            "message": f"OTP sent to {masked}. Valid for 5 minutes."}


@app.post("/auth/setup/verify-phone-otp")
def setup_verify_phone_otp(data: SetupPhoneOtpVerify, db=Depends(get_db)):
    if count_docs(db[COL_USERS]) > 0:
        raise HTTPException(403, "Setup already completed.")

    phone  = data.phone_number.strip()
    record = _setup_phone_otp_store.get(phone)
    if not record:
        raise HTTPException(400, "No OTP found. Please request a new one.")
    if time.time() > record["expires"]:
        _setup_phone_otp_store.pop(phone, None)
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if record["otp"] != data.otp.strip():
        raise HTTPException(400, "Incorrect OTP. Please try again.")

    _setup_phone_otp_store.pop(phone, None)
    _setup_verified_phones.add(phone)
    return {"success": True, "message": "Phone number verified successfully."}


# ═══════════════════════════════════════════════════════════
# AUTH — ADMIN FIRST-TIME SETUP
# ═══════════════════════════════════════════════════════════
@app.post("/auth/admin-setup")
def admin_setup(data: AdminSetupSchema, db=Depends(get_db)):
    if count_docs(db[COL_USERS]) > 0:
        raise HTTPException(403, "Setup already completed. Contact your administrator.")

    smtp_ok   = bool(SMTP_USER and SMTP_PASSWORD)
    email_val = data.email.lower().strip() if data.email else None
    phone_val = data.phone_number.strip()  if data.phone_number else None

    if not phone_val:
        raise HTTPException(400, "Phone number is required for administrator setup.")
    if phone_val not in _setup_verified_phones:
        raise HTTPException(400, "Phone number has not been verified.")
    if smtp_ok and email_val:
        if email_val not in _verified_emails:
            raise HTTPException(400, "Email address has not been verified.")
    if email_val and find_one(db[COL_USERS], {"email": email_val}):
        raise HTTPException(400, "This email is already registered.")

    try:
        new_id = get_next_id(COL_USERS)
        insert_one(db[COL_USERS],
                   user_doc(ADMIN_DEFAULT_USERNAME,
                            pwd_context.hash(data.password),
                            is_admin=1,
                            email=email_val or None,
                            phone_number=phone_val,
                            role_name="Administrator"),
                   new_id)
        if email_val:
            _verified_emails.discard(email_val)
        _setup_verified_phones.discard(phone_val)
        return {"success": True, "message": "Administrator account created. Please login."}
    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))


# ═══════════════════════════════════════════════════════════
# AUTH — NORMAL USER SELF-SIGNUP
# ═══════════════════════════════════════════════════════════
@app.post("/auth/signup")
def user_signup(data: UserSignupSchema, db=Depends(get_db)):
    if data.username.strip().lower() == ADMIN_DEFAULT_USERNAME.lower():
        raise HTTPException(400, f"Username '{ADMIN_DEFAULT_USERNAME}' is reserved.")

    username = data.username.strip()
    if find_one(db[COL_USERS], {"username": username}):
        raise HTTPException(400, f"Username '{username}' is already taken.")

    try:
        new_id = get_next_id(COL_USERS)
        insert_one(db[COL_USERS],
                   user_doc(username,
                            pwd_context.hash(data.password),
                            is_admin=0,
                            phone_number=data.phone_number.strip(),
                            role_name="Staff"),
                   new_id)
        return {"success": True, "message": f"Account '{username}' created. Please login."}
    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))


# ═══════════════════════════════════════════════════════════
# AUTH — LOGIN
# ═══════════════════════════════════════════════════════════
@app.post("/auth/login")
def login(data: AdminLoginSchema, db=Depends(get_db)):
    uname = data.username.strip()
    user  = find_one(db[COL_USERS], {"username": uname})
    if not user:
        raise HTTPException(404, "No account found for this username")
    if not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(401, "Incorrect password")
    return {
        "success":      True,
        "message":      "Login successful",
        "username":     user.username,
        "is_admin":     bool(user.is_admin),
        "user_id":      user.id,
        "role_name":    user.role_name or ("Administrator" if user.is_admin else "Staff"),
        "phone_number": user.phone_number,
        "email":        user.email,
    }


# ═══════════════════════════════════════════════════════════
# ADMIN — LIST USERS
# ═══════════════════════════════════════════════════════════
@app.get("/admin/users")
def list_users(admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    users = find_all(db[COL_USERS], sort_field="created_at")
    return [
        {
            "id":           u.id,
            "username":     u.username,
            "is_admin":     u.is_admin,
            "email":        u.email,
            "phone_number": u.phone_number,
            "role_name":    u.role_name,
            "created_at":   str(u.created_at) if u.created_at else None,
        }
        for u in users
    ]


# ═══════════════════════════════════════════════════════════
# ADMIN — CREATE USER
# ═══════════════════════════════════════════════════════════
@app.post("/admin/users")
def create_user(data: UserCreateByAdmin, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")

    username = data.username.strip()
    if username.lower() == ADMIN_DEFAULT_USERNAME.lower():
        raise HTTPException(400, f"'{ADMIN_DEFAULT_USERNAME}' is reserved for the primary admin.")
    if find_one(db[COL_USERS], {"username": username}):
        raise HTTPException(400, f"Username '{username}' is already registered")

    email_lower = None
    if data.email:
        email_lower = data.email.lower()
        if find_one(db[COL_USERS], {"email": email_lower}):
            raise HTTPException(400, "This email is already registered to another user.")

    role_label = data.role_name.strip() if data.role_name else ("Administrator" if data.is_admin else "Staff")

    try:
        new_id = get_next_id(COL_USERS)
        new_user = insert_one(db[COL_USERS],
                              user_doc(username,
                                       pwd_context.hash(data.password),
                                       is_admin=1 if data.is_admin else 0,
                                       email=email_lower,
                                       phone_number=data.phone_number.strip() if data.phone_number else None,
                                       role_name=role_label),
                              new_id)
        return {"success": True, "user_id": new_user.id,
                "message": f"Account '{username}' ({role_label}) created successfully"}
    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))


# ═══════════════════════════════════════════════════════════
# ADMIN — DELETE USER
# ═══════════════════════════════════════════════════════════
@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    if admin.id == user_id:
        raise HTTPException(400, "You cannot delete your own account")
    user = find_one(db[COL_USERS], {"_id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    if user.username == ADMIN_DEFAULT_USERNAME:
        raise HTTPException(400, "The primary Administrator account cannot be deleted.")
    username = user.username
    delete_one(db[COL_USERS], {"_id": user_id})
    return {"success": True, "message": f"User '{username}' deleted successfully"}


# ═══════════════════════════════════════════════════════════
# ADMIN — ROLES CRUD
# ═══════════════════════════════════════════════════════════
@app.get("/admin/roles")
def list_roles(admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    roles = find_all(db[COL_USER_ROLES], sort_field="role_name")
    return [{"id": r.id, "role_name": r.role_name} for r in roles]


@app.post("/admin/roles")
def create_role(data: RoleCreate, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")

    existing = find_one(db[COL_USER_ROLES], {"role_name": data.role_name})
    if existing:
        return {"id": existing.id, "role_name": existing.role_name, "already_exists": True}

    new_id = get_next_id(COL_USER_ROLES)
    new_role = insert_one(db[COL_USER_ROLES], user_role_doc(data.role_name), new_id)
    return {"id": new_role.id, "role_name": new_role.role_name, "already_exists": False, "success": True}


@app.delete("/admin/roles/{role_id}")
def delete_role(role_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    role = find_one(db[COL_USER_ROLES], {"_id": role_id})
    if not role:
        raise HTTPException(404, "Role not found")
    delete_one(db[COL_USER_ROLES], {"_id": role_id})
    return {"success": True, "message": f"Role '{role.role_name}' deleted"}


# ═══════════════════════════════════════════════════════════
# ADMIN — GET SINGLE DONOR DETAILS
# ═══════════════════════════════════════════════════════════
@app.get("/admin/donors/{donor_id}/detail")
def get_donor_detail(donor_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    donor = find_one(db[COL_DONORS], {"_id": donor_id})
    if not donor:
        raise HTTPException(404, "Donor not found")

    seva_donations_list = []
    for sd in find_all(db[COL_SEVA_DONATIONS], {"donor_id": donor_id}):
        seva_obj = find_one(db[COL_SEVA], {"_id": sd.seva_id})
        sp       = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
        seva_person_data = None
        if sp:
            gotra_obj     = find_one(db[COL_GOTRA],     {"_id": sp.gotra_id})
            birthstar_obj = find_one(db[COL_BIRTHSTAR],  {"_id": sp.birthstar_id})
            zodiac_obj    = find_one(db[COL_ZODIAC],     {"_id": sp.zodiac_id})
            rels          = find_all(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id})
            seva_person_data = {
                "first_name":          sp.first_name,
                "middle_name":         sp.middle_name,
                "last_name":           sp.last_name,
                "gotra_name":          gotra_obj.gotra_name if gotra_obj else "—",
                "birthstar_name":      birthstar_obj.birthstar_name if birthstar_obj else "—",
                "zodiac_name":         zodiac_obj.zodiac_name if zodiac_obj else "—",
                "seva_calendar_type":  sp.seva_calendar_type,
                "seva_english_date":   sp.seva_english_date,
                "relation_count":      len(rels),
            }
        seva_donations_list.append({
            "id":              sd.id,
            "seva_name":       seva_obj.seva_name if seva_obj else "—",
            "seva_type":       sd.seva_type,
            "donation_amount": float(sd.donation_amount),
            "receipt_no":      sd.receipt_no,
            "transaction_id":  sd.transaction_id,
            "created_at":      str(sd.created_at),
            "seva_image":      sd.seva_image,
            "seva_person":     seva_person_data,
        })

    return {**_donor_to_dict(donor), "seva_donations": seva_donations_list}


# ═══════════════════════════════════════════════════════════
# GEOCODE PROXY
# ═══════════════════════════════════════════════════════════
@app.get("/geocode")
def geocode_address(
    line1:   Optional[str] = Query(None),
    line2:   Optional[str] = Query(None),
    pincode: Optional[str] = Query(None),
    city:    Optional[str] = Query(None),
    state:   Optional[str] = Query(None),
):
    import time as _time
    from urllib.parse import quote as _q
    _log = logging.getLogger("geocode")

    def _clean(v):
        return v.strip() if v and v.strip() else None

    l1  = _clean(line1); l2  = _clean(line2)
    pin = _clean(pincode); cty = _clean(city); st = _clean(state)

    queries = []
    full = [p for p in [l1, l2, pin, cty, st, "India"] if p]
    if len(full) > 1:
        queries.append((" + ".join(full[:3] or full), ", ".join(full), "full"))
    if pin and cty and st:
        queries.append(("pincode+city+state", ", ".join([pin, cty, st, "India"]), "pincode"))
    if pin and st:
        queries.append(("pincode+state", ", ".join([pin, st, "India"]), "pincode"))
    if cty and st:
        queries.append(("city+state", ", ".join([cty, st, "India"]), "city"))
    if st:
        queries.append(("state", f"{st}, India", "state"))

    if not queries:
        return {"lat": None, "lng": None, "display": None, "precision": None}

    for label, query, precision in queries:
        url = ("https://nominatim.openstreetmap.org/search"
               "?format=json&limit=1&countrycodes=in&addressdetails=0&q=" + _q(query))
        _log.info("[Geocode] Trying [%s]: %s", label, query)
        try:
            resp = http_requests.get(url, headers={
                "User-Agent": "JagannathTempleApp/2.0 (temple-donation-system)",
                "Accept-Language": "en", "Accept": "application/json",
            }, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data:
                result = {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"]),
                          "display": data[0].get("display_name", ""), "precision": precision}
                _log.info("[Geocode] ✅ [%s] lat=%s lng=%s", precision, result["lat"], result["lng"])
                return result
            _log.warning("[Geocode] No result for [%s]: %s", label, query)
        except Exception as exc:
            _log.error("[Geocode] Error [%s]: %s", label, exc)
        _time.sleep(1.1)

    return {"lat": None, "lng": None, "display": None, "precision": None}


# ═══════════════════════════════════════════════════════════
# PHONE LOOKUP
# ═══════════════════════════════════════════════════════════
@app.get("/check-phone")
def check_phone(whatsapp_number: str = Query(...), db=Depends(get_db)):
    donor = find_one(db[COL_DONORS], {"whatsapp_number": whatsapp_number.strip()})
    if not donor:
        return {"exists": False, "donor": None}
    return {"exists": True, "donor": _donor_to_dict(donor)}


# ═══════════════════════════════════════════════════════════
# SEARCH DONOR
# ═══════════════════════════════════════════════════════════
@app.get("/search-donor")
def search_donor(
    first_name:      Optional[str] = Query(default=None),
    whatsapp_number: Optional[str] = Query(default=None),
    db=Depends(get_db)
):
    if not first_name and not whatsapp_number:
        raise HTTPException(400, "Provide at least one of: first_name, whatsapp_number")

    q: dict = {}
    if first_name:
        import re
        q["first_name"] = {"$regex": re.escape(first_name.strip()), "$options": "i"}
    if whatsapp_number:
        q["whatsapp_number"] = whatsapp_number.strip()

    donors = find_all(db[COL_DONORS], q, sort_field="first_name")
    return [_donor_to_dict(d) for d in donors]


# ═══════════════════════════════════════════════════════════
# CREATE DONOR FULL
# ═══════════════════════════════════════════════════════════
@app.post("/create-donor-full")
def create_donor_full(data: CreateDonorFullRequest, db=Depends(get_db)):
    if find_one(db[COL_DONORS], {"whatsapp_number": data.whatsapp_number}):
        raise HTTPException(400, f"Phone '{data.whatsapp_number}' already registered")
    if find_one(db[COL_DONORS], {"email": str(data.email)}):
        raise HTTPException(400, f"Email '{data.email}' already registered")

    try:
        new_id = get_next_id(COL_DONORS)
        donor = insert_one(db[COL_DONORS], {
            "first_name":      data.first_name,
            "middle_name":     data.middle_name,
            "last_name":       data.last_name,
            "gender":          data.gender.value,
            "whatsapp_number": data.whatsapp_number,
            "email":           str(data.email),
        }, new_id)

        donation_result = None
        if data.donation:
            don = data.donation
            if not don.donation_reason or not don.donation_amount:
                raise HTTPException(400, "donation must include donation_reason and donation_amount")
            from datetime import datetime
            date_str   = datetime.now().strftime("%Y%m%d")
            receipt_no = f"JGN-{date_str}-{random.randint(1000,9999)}"
            while find_one(db[COL_SEVA_DONATIONS], {"receipt_no": receipt_no}):
                receipt_no = f"JGN-{date_str}-{random.randint(1000,9999)}"
            donation_result = {"receipt_no": receipt_no, "status": getattr(don, "status", "Pending")}

        return {"success": True, "donor_id": donor.id,
                "message": "Donor created successfully", "donation": donation_result}

    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# DONOR CAMERA ENDPOINTS
# ═══════════════════════════════════════════════════════════
import logging as _logging
_cam_log = _logging.getLogger("camera")

@app.get("/donor/camera-debug")
def camera_debug():
    import traceback, time as _t
    try:
        import cv2
    except ImportError:
        return {"error": "opencv not installed", "fix": "pip install opencv-python-headless"}

    info = {"os": os.name, "DISPLAY": os.environ.get("DISPLAY", "(not set)"),
            "cv2_version": cv2.__version__, "devices": {}}
    flat_backends = (
        [("DEFAULT", -1), ("CAP_DSHOW", cv2.CAP_DSHOW), ("CAP_MSMF", cv2.CAP_MSMF)]
        if os.name == "nt" else [("DEFAULT", -1)]
    )
    for bname, bval in flat_backends:
        for idx in range(3):
            key = f"{bname}/dev{idx}"
            try:
                c = cv2.VideoCapture(idx) if bval == -1 else cv2.VideoCapture(idx, bval)
                opened = c.isOpened(); frame_ok = False; reads = 0
                if opened:
                    for _ in range(10):
                        ret, frame = c.read(); reads += 1
                        if ret and frame is not None:
                            frame_ok = True; break
                        _t.sleep(0.05)
                c.release()
                info["devices"][key] = {"opened": opened, "frame_ok": frame_ok, "attempts": reads}
            except Exception as e:
                info["devices"][key] = {"error": str(e)}
    working = [k for k, v in info["devices"].items() if v.get("frame_ok")]
    info["recommended"] = working[0] if working else "NONE"
    return info


@app.post("/donor/capture-photo")
def capture_photo():
    import traceback as _tb
    try:
        import cv2
    except ImportError:
        raise HTTPException(503, "opencv-python is not installed. Run: pip install opencv-python")

    import time as _time
    cap = None; cap_errors = []
    backends = ([("DEFAULT", -1), ("CAP_DSHOW", cv2.CAP_DSHOW), ("CAP_MSMF", cv2.CAP_MSMF)]
                if os.name == "nt" else [("DEFAULT", -1)])

    for bname, bval in backends:
        if cap is not None:
            break
        for idx in range(3):
            try:
                c = (cv2.VideoCapture(idx) if bval == -1 else cv2.VideoCapture(idx, bval))
                if not c.isOpened():
                    c.release(); cap_errors.append(f"{bname}/dev{idx}:not_opened"); continue
                frame = None
                for _ in range(10):
                    ret, f = c.read()
                    if ret and f is not None:
                        frame = f; break
                    _time.sleep(0.1)
                if frame is None:
                    c.release(); cap_errors.append(f"{bname}/dev{idx}:10_reads_failed"); continue
                cap = c; _cam_log.info(f"Camera ready: backend={bname} index={idx}"); break
            except Exception as exc:
                cap_errors.append(f"{bname}/dev{idx}:exc={exc}")
                _cam_log.error(f"[{bname}/dev{idx}] {exc}\n{_tb.format_exc()}")
                try: c.release()
                except Exception: pass

    if cap is None:
        msg = ("No working webcam found. Tried: " + " | ".join(cap_errors) +
               ". Visit GET /donor/camera-debug for full diagnostics.")
        _cam_log.error(msg); raise HTTPException(503, msg)

    frame_to_save = None
    has_display   = bool(os.environ.get("DISPLAY") or os.name == "nt")

    if has_display:
        try:
            WIN = "Donor Photo  -  SPACE=capture  |  ESC=cancel"
            t0  = time.time(); cv2.namedWindow(WIN, cv2.WINDOW_NORMAL); cv2.resizeWindow(WIN, 640, 480)
            while True:
                ret, frame = cap.read()
                if not ret: break
                elapsed = time.time() - t0; remaining = max(0, int(10 - elapsed) + 1)
                overlay = frame.copy()
                cv2.putText(overlay, f"SPACE=capture   ESC=cancel   Auto in {remaining}s",
                            (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2, cv2.LINE_AA)
                cv2.imshow(WIN, overlay)
                key = cv2.waitKey(1) & 0xFF
                if key == 32:   frame_to_save = frame.copy(); break
                elif key == 27: break
                elif elapsed >= 10: frame_to_save = frame.copy(); break
            cv2.destroyAllWindows()
        except Exception as exc:
            _cam_log.error(f"GUI error: {exc}\n{_tb.format_exc()}"); has_display = False

    if frame_to_save is None:
        _cam_log.info("Headless grab (no GUI or GUI failed)")
        for _ in range(5): cap.read()
        ret, frame = cap.read()
        if ret and frame is not None: frame_to_save = frame.copy()

    cap.release()
    if frame_to_save is None:
        raise HTTPException(400, "Capture cancelled (ESC pressed or no frame available).")

    try:
        ok, buf = cv2.imencode(".jpg", frame_to_save, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok: raise RuntimeError("imencode returned False")
        data_uri = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
        return {"success": True, "photo": data_uri}
    except Exception as exc:
        _cam_log.error(f"Encode error: {exc}\n{_tb.format_exc()}")
        raise HTTPException(500, f"Failed to encode image: {exc}")


# ═══════════════════════════════════════════════════════════
# GET DONOR SEVA DONATION HISTORY
# ═══════════════════════════════════════════════════════════
@app.get("/donors/{donor_id}/seva-donations")
def get_donor_seva_donations(donor_id: int, whatsapp_number: str, db=Depends(get_db)):
    donor = find_one(db[COL_DONORS], {"_id": donor_id})
    if not donor:
        raise HTTPException(404, "Donor not found")
    if donor.whatsapp_number != whatsapp_number:
        raise HTTPException(403, "Phone number does not match this donor record")

    results = []
    for sd in find_all(db[COL_SEVA_DONATIONS], {"donor_id": donor_id}):
        sp = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
        seva_person_data = None
        if sp:
            gotra_name     = find_one(db[COL_GOTRA],    {"_id": sp.gotra_id})
            birthstar_name = find_one(db[COL_BIRTHSTAR], {"_id": sp.birthstar_id})
            zodiac_name    = find_one(db[COL_ZODIAC],    {"_id": sp.zodiac_id})
            relations_data = []
            for rel in find_all(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id}):
                rel_gotra     = find_one(db[COL_GOTRA],    {"_id": rel.gotra_id})
                rel_birthstar = find_one(db[COL_BIRTHSTAR], {"_id": rel.birthstar_id})
                rel_zodiac    = find_one(db[COL_ZODIAC],    {"_id": rel.zodiac_id})
                relations_data.append({
                    "id":             rel.id,
                    "relation_type":  rel.relation_type,
                    "first_name":     rel.first_name,
                    "middle_name":    rel.middle_name,
                    "last_name":      rel.last_name,
                    "gender":         rel.gender,
                    "zodiac_id":      rel.zodiac_id,
                    "zodiac_name":    rel_zodiac.zodiac_name if rel_zodiac else "",
                    "birthstar_id":   rel.birthstar_id,
                    "birthstar_name": rel_birthstar.birthstar_name if rel_birthstar else "",
                    "gotra_id":       rel.gotra_id,
                    "gotra_name":     rel_gotra.gotra_name if rel_gotra else "",
                    "birthdate":      rel.birthdate,
                    "email":          rel.email,
                    "phone":          rel.phone,
                    "profession":     rel.profession,
                    "institution":    rel.institution,
                })
            seva_person_data = {
                "id":                    sp.id,
                "first_name":            sp.first_name,
                "middle_name":           sp.middle_name,
                "last_name":             sp.last_name,
                "gotra_id":              sp.gotra_id,
                "gotra_name":            gotra_name.gotra_name if gotra_name else "",
                "birthstar_id":          sp.birthstar_id,
                "birthstar_name":        birthstar_name.birthstar_name if birthstar_name else "",
                "zodiac_id":             sp.zodiac_id,
                "zodiac_name":           zodiac_name.zodiac_name if zodiac_name else "",
                "seva_calendar_type":    sp.seva_calendar_type,
                "seva_english_date":     sp.seva_english_date,
                "seva_purnima_name_id":  sp.seva_purnima_name_id,
                "seva_krishna_tithi_id": sp.seva_krishna_tithi_id,
                "seva_amavasya_name_id": sp.seva_amavasya_name_id,
                "seva_shukla_tithi_id":  sp.seva_shukla_tithi_id,
                "relations":             relations_data,
            }
        seva_obj = find_one(db[COL_SEVA], {"_id": sd.seva_id})
        results.append({
            "id":              sd.id,
            "seva_id":         sd.seva_id,
            "seva_name":       seva_obj.seva_name if seva_obj else "",
            "seva_type":       sd.seva_type,
            "donation_amount": float(sd.donation_amount),
            "receipt_no":      sd.receipt_no,
            "transaction_id":  sd.transaction_id,
            "created_at":      str(sd.created_at),
            "seva_image":      sd.seva_image,
            "seva_person":     seva_person_data,
        })
    return results


# ═══════════════════════════════════════════════════════════
# CREATE DONOR
# ═══════════════════════════════════════════════════════════
@app.post("/donors")
def create_donor(data: DonorCreate, db=Depends(get_db)):
    try:
        if find_one(db[COL_DONORS], {"whatsapp_number": data.whatsapp_number}):
            raise HTTPException(400, f"Phone '{data.whatsapp_number}' already registered")
        if find_one(db[COL_DONORS], {"email": str(data.email)}):
            raise HTTPException(400, f"Email '{data.email}' already registered")

        new_id = get_next_id(COL_DONORS)
        donor  = insert_one(db[COL_DONORS], _donor_fields(data), new_id)
        return {"success": True, "donor_id": donor.id, "message": "Donor registered successfully"}

    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# UPDATE DONOR
# ═══════════════════════════════════════════════════════════
@app.put("/donors/{donor_id}")
def update_donor(donor_id: int, data: DonorCreate, db=Depends(get_db)):
    donor = find_one(db[COL_DONORS], {"_id": donor_id})
    if not donor:
        raise HTTPException(404, "Donor not found")

    dup = find_one(db[COL_DONORS], {"email": str(data.email)})
    if dup and dup.id != donor_id:
        raise HTTPException(400, "Email already in use by another donor")

    try:
        update_one(db[COL_DONORS], {"_id": donor_id}, _donor_fields(data))
        return {"success": True, "message": "Donor updated successfully"}
    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# DELETE DONOR
# ═══════════════════════════════════════════════════════════
@app.delete("/donors/{donor_id}")
def delete_donor(donor_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Unauthorized: valid admin username required")
    donor = find_one(db[COL_DONORS], {"_id": donor_id})
    if not donor:
        raise HTTPException(404, "Donor not found")

    name = f"{donor.first_name} {donor.last_name}"
    try:
        # Cascade: delete seva_person_relations → seva_persons → seva_donations → donor
        for sd in find_all(db[COL_SEVA_DONATIONS], {"donor_id": donor_id}):
            sp = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
            if sp:
                delete_many(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id})
                delete_one(db[COL_SEVA_PERSONS], {"_id": sp.id})
        delete_many(db[COL_SEVA_DONATIONS], {"donor_id": donor_id})
        delete_one(db[COL_DONORS], {"_id": donor_id})
        return {"success": True, "message": f"Donor '{name}' and all related records deleted"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# ADMIN — LIST DONORS
# ═══════════════════════════════════════════════════════════
@app.get("/admin/donors")
def list_donors(admin_username: str = Query(...), search: Optional[str] = Query(default=None), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")

    q: dict = {}
    if search:
        import re
        term = re.escape(search.strip())
        q["$or"] = [
            {"first_name":       {"$regex": term, "$options": "i"}},
            {"last_name":        {"$regex": term, "$options": "i"}},
            {"whatsapp_number":  {"$regex": term, "$options": "i"}},
            {"email":            {"$regex": term, "$options": "i"}},
        ]

    donors = find_all(db[COL_DONORS], q, sort_field="first_name")
    result = []
    for d in donors:
        count = count_docs(db[COL_SEVA_DONATIONS], {"donor_id": d.id})
        result.append({
            "id":                  d.id,
            "first_name":          d.first_name,
            "middle_name":         d.middle_name,
            "last_name":           d.last_name,
            "whatsapp_number":     d.whatsapp_number,
            "email":               d.email,
            "seva_donation_count": count,
        })
    return result


# ═══════════════════════════════════════════════════════════
# ADMIN — GET ALL SEVAS
# ═══════════════════════════════════════════════════════════
@app.get("/admin/sevas")
def list_sevas(db=Depends(get_db)):
    sevas = find_all(db[COL_SEVA], sort_field="seva_name")
    return [
        {
            "id":                      s.id,
            "seva_name":               s.seva_name,
            "seva_description":        s.seva_description,
            "default_amount_one_time": float(s.default_amount_one_time or 0),
            "default_amount_regular":  float(s.default_amount_regular or 0),
            "is_active":               s.is_active,
        }
        for s in sevas
    ]


# ═══════════════════════════════════════════════════════════
# ADMIN — ADD SEVA
# ═══════════════════════════════════════════════════════════
# ════════════════════════════════════════════════════════════
# PUBLIC — GET ALL ACTIVE SEVAS (used by donation form dropdown)
# ════════════════════════════════════════════════════════════
@app.get("/sevas")
def list_sevas_public(db=Depends(get_db)):
    sevas = find_all(db[COL_SEVA], {"is_active": 1}, sort_field="seva_name")
    return [
        {
            "id":                      s.id,
            "seva_name":               s.seva_name,
            "seva_description":        s.seva_description,
            "default_amount_one_time": float(s.default_amount_one_time or 0),
            "default_amount_regular":  float(s.default_amount_regular or 0),
        }
        for s in sevas
    ]



@app.post("/admin/sevas")
def add_seva(data: SevaCreate, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    if find_one(db[COL_SEVA], {"seva_name": data.seva_name.strip()}):
        raise HTTPException(400, "Seva with this name already exists")

    new_id = get_next_id(COL_SEVA)
    seva   = insert_one(db[COL_SEVA],
                        seva_doc(data.seva_name.strip(), data.seva_description,
                                 data.default_amount_one_time, data.default_amount_regular,
                                 1 if data.is_active else 0),
                        new_id)
    return {"success": True, "seva_id": seva.id, "message": "Seva added"}


# ═══════════════════════════════════════════════════════════
# ADMIN — UPDATE SEVA
# ═══════════════════════════════════════════════════════════
@app.put("/admin/sevas/{seva_id}")
def update_seva(seva_id: int, data: SevaCreate, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    if not find_one(db[COL_SEVA], {"_id": seva_id}):
        raise HTTPException(404, "Seva not found")

    update_one(db[COL_SEVA], {"_id": seva_id}, {
        "seva_name":               data.seva_name.strip(),
        "seva_description":        data.seva_description,
        "default_amount_one_time": data.default_amount_one_time,
        "default_amount_regular":  data.default_amount_regular,
        "is_active":               1 if data.is_active else 0,
    })
    return {"success": True, "message": "Seva updated"}


# ═══════════════════════════════════════════════════════════
# ADMIN — DELETE SEVA
# ═══════════════════════════════════════════════════════════
@app.delete("/admin/sevas/{seva_id}")
def delete_seva(seva_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required")
    seva = find_one(db[COL_SEVA], {"_id": seva_id})
    if not seva:
        raise HTTPException(404, "Seva not found")
    if count_docs(db[COL_SEVA_DONATIONS], {"seva_id": seva_id}) > 0:
        raise HTTPException(400, "Cannot delete — this seva has existing donations. Deactivate it instead.")

    delete_one(db[COL_SEVA], {"_id": seva_id})
    return {"success": True, "message": f"Seva '{seva.seva_name}' deleted"}


# ═══════════════════════════════════════════════════════════
# GEMINI IMAGE HELPER
# Primary: Gemini 2.5 Flash Image (free tier — 500/day, 10 RPM)
# Fallback: Pollinations.ai (no key needed, unlimited but slower)
# Set GEMINI_API_KEY in .env to enable Gemini.
# Get free key → https://aistudio.google.com/apikey
# ═══════════════════════════════════════════════════════════
def _build_seva_image_prompt(seva_name: str) -> str:
    return (
        f"Generate a beautiful digital painting image of {seva_name} Hindu temple puja ritual. "
        "Sacred ceremony with golden oil lamps, fresh flowers, priest in traditional attire, "
        "devotional offerings, warm golden light, vibrant colours, traditional Indian art style, "
        "divine atmosphere. Photorealistic painting, no text."
    )

def _fetch_image_gemini(prompt: str) -> tuple:
    """
    Call Gemini image generation API.
    Returns (image_bytes, mime_type) or raises RuntimeError.
    Free tier: 500 images/day, 10 RPM — no credit card needed.
    Model: gemini-2.0-flash-exp-image-generation  (generateContent endpoint)
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")
    _log = logging.getLogger("gemini_img")
    url  = _GEMINI_IMG_URL.format(model=GEMINI_IMAGE_MODEL, key=GEMINI_API_KEY)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    _log.info("Gemini POST  model=%s  prompt_len=%d", GEMINI_IMAGE_MODEL, len(prompt))
    resp = http_requests.post(url, json=payload, timeout=90)

    # Log non-200 responses in full so misconfiguration is obvious
    if resp.status_code != 200:
        try:
            err_body = resp.json()
        except Exception:
            err_body = resp.text[:500]
        _log.error("Gemini HTTP %d — body: %s", resp.status_code, err_body)
        if resp.status_code == 429:
            # Parse the suggested retry delay and check for unrecoverable daily-quota=0
            retry_delay    = 20       # safe default (seconds)
            daily_zero     = False
            try:
                details = (err_body if isinstance(err_body, dict) else {}).get(
                    "error", {}).get("details", [])
                for detail in details:
                    if "RetryInfo" in detail.get("@type", ""):
                        delay_str  = detail.get("retryDelay", "20s")
                        retry_delay = int(delay_str.rstrip("s")) + 3  # +3 s safety buffer
                    if "QuotaFailure" in detail.get("@type", ""):
                        for v in detail.get("violations", []):
                            if ("PerDay" in v.get("quotaId", "") and
                                    "free_tier" in v.get("quotaMetric", "")):
                                daily_zero = True
            except Exception:
                pass
            if daily_zero:
                _log.warning(
                    "Gemini 429: free-tier daily quota=0 for this model — "
                    "enable billing at https://aistudio.google.com → Pollinations fallback."
                )
                raise RuntimeError(
                    "Gemini daily quota exhausted (limit=0, free tier). "
                    "Enable billing or Pollinations fallback will be used."
                )
            _log.info("Gemini 429 rate-limit — sleeping %ds before retry.", retry_delay)
            time.sleep(retry_delay)
            raise RuntimeError(f"Gemini rate limit (429) — waited {retry_delay}s")
        if resp.status_code == 400:
            raise RuntimeError(f"Gemini 400 Bad Request — check model name or prompt: {err_body}")
        if resp.status_code == 403:
            raise RuntimeError(f"Gemini 403 Forbidden — check API key permissions: {err_body}")
        resp.raise_for_status()

    data = resp.json()

    # Log the full response structure at DEBUG level for diagnosis
    candidates = data.get("candidates", [])
    _log.info("Gemini response  candidates=%d  keys=%s", len(candidates), list(data.keys()))

    if not candidates:
        # Surface promptFeedback if Gemini blocked the request (safety filter)
        feedback = data.get("promptFeedback", {})
        block_reason = feedback.get("blockReason", "unknown")
        _log.error("Gemini returned 0 candidates. promptFeedback: %s", feedback)
        raise RuntimeError(f"Gemini blocked the request — blockReason={block_reason}")

    parts = candidates[0].get("content", {}).get("parts", [])
    _log.info("Gemini candidate[0]  parts=%d  finish=%s",
              len(parts), candidates[0].get("finishReason", "?"))

    for part in parts:
        if part.get("inlineData"):
            mime  = part["inlineData"].get("mimeType", "image/jpeg")
            b64   = part["inlineData"]["data"]
            _log.info("Gemini image ✅  mime=%s  bytes=%d", mime, len(b64) * 3 // 4)
            return base64.b64decode(b64), mime
        elif part.get("text"):
            # Model returned text instead of an image — log it for diagnosis
            _log.warning("Gemini returned TEXT instead of image: %s", part["text"][:200])

    raise RuntimeError(
        f"Gemini response had {len(parts)} part(s) but none contained inlineData. "
        f"finishReason={candidates[0].get('finishReason','?')} — "
        "Check that GEMINI_IMAGE_MODEL=gemini-2.5-flash-image"
    )


def _fetch_image_pollinations(prompt: str, seed: int = 0) -> tuple:
    """Fallback: Pollinations.ai (free, no key, slower)."""
    from urllib.parse import quote as _uq
    img_url = (
        "https://image.pollinations.ai/prompt/" + _uq(prompt)
        + f"?width=700&height=320&nologo=true&seed={seed}&model=flux"
    )
    resp = http_requests.get(img_url, timeout=60)
    resp.raise_for_status()
    ct   = resp.headers.get("Content-Type", "image/jpeg")
    mime = ("image/png" if "png" in ct else "image/webp" if "webp" in ct else "image/jpeg")
    return resp.content, mime


def _fetch_seva_image(seva_name: str, seed: int = 0) -> tuple:
    """
    Try Gemini first (if API key set), then Pollinations as fallback.
    Returns (image_bytes, mime_type).
    """
    _log    = logging.getLogger("seva_img_fetch")
    prompt  = _build_seva_image_prompt(seva_name)
    if GEMINI_API_KEY:
        for attempt in range(1, 3):
            try:
                _log.info("Gemini attempt %d for seva='%s'", attempt, seva_name)
                return _fetch_image_gemini(prompt)
            except RuntimeError as exc:
                msg = str(exc)
                _log.warning("Gemini attempt %d failed: %s — %s",
                             attempt, type(exc).__name__, msg)
                # Daily quota=0 (free tier, billing not enabled):
                # retrying won't help — bail immediately to Pollinations.
                if "daily quota exhausted" in msg.lower() or "limit=0" in msg:
                    _log.warning(
                        "Gemini daily quota=0 — skipping further attempts, "
                        "using Pollinations. Enable billing to restore Gemini images."
                    )
                    break
            except Exception as exc:
                _log.warning("Gemini attempt %d failed: %s — %s",
                             attempt, type(exc).__name__, exc)
        _log.warning("Gemini exhausted for '%s' → falling back to Pollinations", seva_name)
    # Pollinations fallback
    for attempt in range(1, 4):
        try:
            _log.info("Pollinations attempt %d for seva='%s'", attempt, seva_name)
            return _fetch_image_pollinations(prompt, seed=seed)
        except Exception as exc:
            _log.warning("Pollinations attempt %d failed: %s", attempt, exc)
    raise RuntimeError(f"All image sources failed for seva='{seva_name}'")


# ═══════════════════════════════════════════════════════════
# SEVA PREVIEW IMAGE PROXY  (used by the live dropdown in Step 3)
# ═══════════════════════════════════════════════════════════
@app.get("/seva-preview-image")
def seva_preview_image(
    seva_name: str = Query(..., description="Seva name for the AI prompt"),
    seed:      int = Query(0,   description="Seva ID used as seed for deterministic image"),
):
    from fastapi.responses import Response as _Resp
    _log = logging.getLogger("seva_preview")
    _log.info("seva_preview  seva='%s'  seed=%d  source=%s",
              seva_name, seed, "gemini" if GEMINI_API_KEY else "pollinations")
    try:
        img_bytes, mime = _fetch_seva_image(seva_name, seed=seed)
        return _Resp(
            content=img_bytes,
            media_type=mime,
            headers={"Cache-Control": "public, max-age=86400", "X-Seva-Name": seva_name},
        )
    except Exception as exc:
        _log.error("seva_preview ❌ all sources failed for '%s': %s", seva_name, exc)
        raise HTTPException(502, detail="Image generation failed — please try again")

def _bg_generate_seva_image(seva_donation_id: int) -> None:
    """Background task: generate & store seva image using Gemini (primary) or Pollinations (fallback)."""
    _log = logging.getLogger("seva_image")
    db   = db_instance
    try:
        sd = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
        if not sd:
            _log.error("▶ seva_image BG donation=%d not found", seva_donation_id); return
        if sd.seva_image:
            _log.info("▶ seva_image BG donation=%d — already cached, skip", seva_donation_id); return

        # Reuse sibling image with the same seva_id (saves API quota)
        sibling_doc = db[COL_SEVA_DONATIONS].find_one({
            "seva_id":    sd.seva_id,
            "seva_image": {"$ne": None},
            "_id":        {"$ne": seva_donation_id},
        })
        if sibling_doc:
            sibling = Row(sibling_doc)
            update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id}, {"seva_image": sibling.seva_image})
            _log.info("▶ seva_image BG donation=%d seva_id=%d → ✅ REUSED sibling=%d",
                      seva_donation_id, sd.seva_id, sibling.id)
            return

        seva_obj  = find_one(db[COL_SEVA], {"_id": sd.seva_id})
        seva_name = seva_obj.seva_name if seva_obj else "Hindu Temple Seva"

        _log.info("▶ seva_image BG START  donation=%d  seva='%s'  source=%s",
                  seva_donation_id, seva_name, "gemini" if GEMINI_API_KEY else "pollinations")
        try:
            img_bytes, mime = _fetch_seva_image(seva_name, seed=sd.seva_id)
            b64     = base64.b64encode(img_bytes).decode()
            size_kb = round(len(img_bytes) / 1024, 1)
            update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id},
                       {"seva_image": f"data:{mime};base64,{b64}"})
            _log.info("▶ seva_image BG ✅ SUCCESS  donation=%d  mime=%s  size=%s KB",
                      seva_donation_id, mime, size_kb)
        except Exception as exc:
            _log.error("▶ seva_image BG ❌ ALL SOURCES FAILED  donation=%d  error=%s",
                       seva_donation_id, exc)
    except Exception as outer:
        _log.error("▶ seva_image BG unexpected error donation=%d: %s", seva_donation_id, outer)


# ═══════════════════════════════════════════════════════════
# CREATE SEVA DONATION
# ═══════════════════════════════════════════════════════════
@app.post("/seva-donations")
def create_seva_donation(data: SevaDonationCreate, background_tasks: BackgroundTasks, db=Depends(get_db)):
    if not find_one(db[COL_DONORS], {"_id": data.donor_id}):
        raise HTTPException(404, "Donor not found")
    if not find_one(db[COL_SEVA], {"_id": data.seva_id}):
        raise HTTPException(404, "Seva not found")
    if find_one(db[COL_SEVA_DONATIONS], {"receipt_no": data.receipt_no.strip()}):
        raise HTTPException(400, f"Receipt number '{data.receipt_no}' already exists")

    try:
        don_id = get_next_id(COL_SEVA_DONATIONS)
        seva_don = insert_one(db[COL_SEVA_DONATIONS],
                              seva_donation_doc(data.donor_id, data.seva_id,
                                               data.seva_type.value, data.donation_amount,
                                               data.transaction_id, data.receipt_no.strip()),
                              don_id)

        sp_dict  = _build_seva_person_dict(seva_don.id, data.seva_person, db)
        sp_id    = get_next_id(COL_SEVA_PERSONS)
        seva_person = insert_one(db[COL_SEVA_PERSONS], sp_dict, sp_id)

        for rel in data.seva_person.relations:
            rel_id = get_next_id(COL_SEVA_PERSON_RELATIONS)
            insert_one(db[COL_SEVA_PERSON_RELATIONS],
                       seva_person_relation_doc(seva_person.id, **_sp_relation_fields(rel)),
                       rel_id)

        background_tasks.add_task(_bg_generate_seva_image, seva_don.id)
        return {"success": True, "receipt_no": data.receipt_no.strip(),
                "seva_donation_id": seva_don.id,
                "message": "Seva donation recorded successfully"}

    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# SEND BOOKING CONFIRMATION EMAIL
# ═══════════════════════════════════════════════════════════
@app.post("/seva-donations/{seva_donation_id}/send-confirmation")
def send_booking_confirmation_email(seva_donation_id: int, db=Depends(get_db)):
    if not (SMTP_USER and SMTP_PASSWORD):
        return {"success": False, "message": "SMTP not configured"}

    sd = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd:
        raise HTTPException(404, "Seva donation not found")

    donor = find_one(db[COL_DONORS], {"_id": sd.donor_id})
    if not donor or not donor.email:
        return {"success": False, "message": "Donor email not available"}

    seva_obj  = find_one(db[COL_SEVA], {"_id": sd.seva_id})
    seva_name = seva_obj.seva_name if seva_obj else "—"
    sp        = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
    sp_name   = " ".join(filter(None, [sp.first_name, sp.middle_name, sp.last_name])) if sp else "—"

    seva_date = str(sd.created_at)[:10]; seva_date_label = ""
    if sp:
        if sp.seva_english_date:
            try:
                from datetime import date as _dt
                d = _dt.fromisoformat(str(sp.seva_english_date))
                seva_date = d.strftime("%d %b %Y")
            except Exception:
                seva_date = str(sp.seva_english_date)
            if sp.seva_calendar_type == "Hindu":
                parts = []
                if sp.seva_purnima_name_id:
                    pn = find_one(db[COL_PURNIMA_NAMES], {"_id": sp.seva_purnima_name_id})
                    if pn: parts.append(pn.name)
                    kt = find_one(db[COL_KRISHNA_PAKSHA_TITHIS], {"_id": sp.seva_krishna_tithi_id})
                    if kt: parts.append(kt.tithi_name + " (Krishna Paksha)")
                elif sp.seva_amavasya_name_id:
                    an = find_one(db[COL_AMAVASYA_NAMES], {"_id": sp.seva_amavasya_name_id})
                    if an: parts.append(an.name)
                    st = find_one(db[COL_SHUKLA_PAKSHA_TITHIS], {"_id": sp.seva_shukla_tithi_id})
                    if st: parts.append(st.tithi_name + " (Shukla Paksha)")
                if parts: seva_date_label = " — ".join(parts)
        elif sp.seva_hindu_date:
            seva_date = sp.seva_hindu_date

    donor_name  = " ".join(filter(None, [donor.first_name, donor.middle_name, donor.last_name]))
    addr_parts  = [donor.address_line1, donor.address_line2, donor.address_city,
                   donor.address_state, donor.address_pincode]
    addr        = ", ".join(filter(None, addr_parts)) or "—"
    map_url     = ""
    if donor.latitude and donor.longitude:
        map_url = f"https://www.openstreetmap.org/?mlat={donor.latitude}&mlon={donor.longitude}&zoom=17"

    if map_url:
        qr_src   = f"https://api.qrserver.com/v1/create-qr-code/?size=120x120&color=3B1F0B&bgcolor=ffffff&qzone=1&data={map_url}"
        qr_block = f"""<td style="vertical-align:top;padding-left:16px;text-align:center;width:90px;">
          <img src="{qr_src}" width="90" height="90" alt="Map QR"
               style="display:block;border:1px solid #e0c870;border-radius:4px;">
          <p style="margin:4px 0 0;font-size:9px;color:#8B5E3C;line-height:1.4;">📍 Scan to open<br>donor location</p>
        </td>"""
    else:
        qr_block = """<td style="vertical-align:top;padding-left:16px;width:90px;"></td>"""

    def row(label, value):
        return f"""<tr>
          <td style="padding:4px 0;font-size:11px;font-weight:600;color:#8B5E3C;width:80px;vertical-align:top;">{label}</td>
          <td style="padding:4px 0;font-size:11px;color:#3B1F0B;">{value}</td>
        </tr>"""

    map_row = row("Map:", f'<a href="{map_url}" style="color:#1a73e8;font-size:10px;word-break:break-all;">{map_url}</a>') if map_url else ""

    html = f"""<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Seva Booking Confirmation — {sd.receipt_no}</title></head>
<body style="margin:0;padding:0;background:#FDF6EC;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6EC;padding:28px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="max-width:480px;background:#fff;border-radius:14px;box-shadow:0 4px 20px rgba(59,31,11,.13);overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#3B1F0B 0%,#7B3F1A 55%,#E8821A 100%);padding:24px 28px 18px;text-align:center;">
    <div style="font-size:34px;margin-bottom:6px;">🙏</div>
    <h1 style="margin:0;color:#F5C842;font-size:19px;font-weight:700;">Jagannath Temple</h1>
    <p style="margin:5px 0 0;color:rgba(255,255,255,.85);font-size:12px;">Seva Booking Confirmation</p>
  </td></tr>
  <tr><td style="padding:22px 28px 8px;">
    <p style="margin:0;font-size:14px;color:#3B1F0B;">Dear <strong>{donor_name}</strong>,</p>
    <p style="margin:8px 0 0;font-size:13px;color:#5C3D2E;line-height:1.65;">
      Your seva booking has been recorded successfully. May Lord Jagannath bless you and your family. 🌸
    </p>
  </td></tr>
  <tr><td style="padding:12px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fff;border:1.5px solid #3B1F0B;border-radius:7px;padding:10px 12px;">
      <tr><td style="vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-bottom:2px solid #E8821A;padding-bottom:6px;margin-bottom:6px;">
          <tr>
            <td style="font-size:12px;font-weight:700;color:#3B1F0B;">🛕 Jagannath Temple</td>
            <td align="right"><span style="background:#E8821A;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:9px;">{sd.seva_type}</span></td>
          </tr>
        </table>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#E8821A;">{seva_name}</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          {row("Seva Date:", f'{seva_date}<br><span style="font-size:10px;color:#8B5E3C;">{seva_date_label}</span>' if seva_date_label else seva_date)}
          <tr><td colspan="2" style="padding:3px 0;"><hr style="border:none;border-top:1px dashed #e0c870;margin:0;"></td></tr>
          {row("Donor:", f"<strong>{donor_name}</strong>")}
          {row("Mobile:", donor.whatsapp_number or "—")}
          {row("Seva Person:", sp_name)}
          <tr><td colspan="2" style="padding:3px 0;"><hr style="border:none;border-top:1px dashed #e0c870;margin:0;"></td></tr>
          {row("Address:", addr)}
          {map_row}
        </table>
        <p style="margin:8px 0 0;font-size:10px;color:#aaa;">
          Receipt: <strong style="color:#3B1F0B;">{sd.receipt_no}</strong>
          {("&nbsp;|&nbsp; Txn: " + sd.transaction_id) if sd.transaction_id else ""}
        </p>
      </td>
      {qr_block}
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px 28px;">
    <p style="margin:0;font-size:12px;color:#8B5E3C;line-height:1.7;border-top:1px solid #F0D9B0;padding-top:16px;">
      Please keep this email as your booking reference. For any queries, contact temple administration with receipt
      <strong style="color:#E8821A;">{sd.receipt_no}</strong>.
    </p>
    <p style="margin:14px 0 0;font-size:13px;color:#3B1F0B;text-align:center;font-weight:600;">🪔 Jai Jagannath 🪔</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>"""

    try:
        _send_smtp_email(donor.email, f"Seva Booking Confirmed — Receipt {sd.receipt_no}", html)
        return {"success": True, "message": f"Confirmation sent to {donor.email}"}
    except Exception as e:
        print(f"[BookingEmail] Failed to send to {donor.email}: {e}")
        return {"success": False, "message": str(e)}


# ═══════════════════════════════════════════════════════════
# WHATSAPP HELPER
# ═══════════════════════════════════════════════════════════
def _send_whatsapp_template(to_number: str, template_name: str, language_code: str, components: list) -> dict:
    if not WA_API_KEY or not WA_PHONE_NUMBER_ID:
        raise RuntimeError("WhatsApp not configured — set WA_API_KEY and WA_PHONE_NUMBER_ID in .env")
    clean = to_number.strip().lstrip("+").replace(" ", "").replace("-", "")
    url   = f"{WA_API_BASE}/{WA_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp", "to": clean, "type": "template",
        "template": {"name": template_name, "language": {"code": language_code}, "components": components},
    }
    headers = {"Content-Type": "application/json", "apikey": WA_API_KEY}
    resp = http_requests.post(url, json=payload, headers=headers, timeout=20)
    try:
        resp_json = resp.json()
    except Exception:
        resp_json = {"raw": resp.text}
    logging.getLogger("whatsapp").info("WA → %s  HTTP %s  %s", clean, resp.status_code, resp_json)
    if not resp.ok:
        err = (resp_json.get("error", {}).get("message") or resp_json.get("message") or str(resp_json)[:200])
        raise RuntimeError(f"WhatsApp API {resp.status_code}: {err}")
    return resp_json


@app.post("/seva-donations/{seva_donation_id}/send-whatsapp")
def send_booking_whatsapp(seva_donation_id: int, db=Depends(get_db)):
    if not (WA_API_KEY and WA_PHONE_NUMBER_ID and WA_TEMPLATE_NAME):
        return {"success": False, "message": "WhatsApp not configured — check WA_* keys in .env"}

    sd = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd: raise HTTPException(404, "Seva donation not found")

    donor = find_one(db[COL_DONORS], {"_id": sd.donor_id})
    if not donor or not donor.whatsapp_number:
        return {"success": False, "message": "Donor WhatsApp number not available"}

    seva_obj   = find_one(db[COL_SEVA], {"_id": sd.seva_id})
    seva_name  = seva_obj.seva_name if seva_obj else "Seva"
    sp         = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
    sp_name    = " ".join(filter(None, [sp.first_name, sp.middle_name, sp.last_name])) if sp else "—"
    donor_name = " ".join(filter(None, [donor.first_name, donor.middle_name, donor.last_name]))
    amount_str = f"Rs. {float(sd.donation_amount):.2f}"

    components = [{
        "type": "body",
        "parameters": [
            {"type": "text", "text": donor_name},
            {"type": "text", "text": seva_name},
            {"type": "text", "text": sd.seva_type},
            {"type": "text", "text": amount_str},
            {"type": "text", "text": sp_name},
            {"type": "text", "text": sd.receipt_no},
        ],
    }]

    try:
        result = _send_whatsapp_template(donor.whatsapp_number, WA_TEMPLATE_NAME, "en", components)
        return {"success": True, "message": f"WhatsApp sent to {donor.whatsapp_number}", "api_response": result}
    except Exception as exc:
        logging.getLogger("whatsapp").error("WA send failed: %s", exc)
        return {"success": False, "message": str(exc)}


# ═══════════════════════════════════════════════════════════
# UPDATE SEVA DONATION
# ═══════════════════════════════════════════════════════════
@app.put("/seva-donations/{seva_donation_id}")
def update_seva_donation(seva_donation_id: int, data: SevaDonationUpdate, db=Depends(get_db)):
    seva_don = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not seva_don: raise HTTPException(404, "Seva donation not found")
    if not find_one(db[COL_SEVA], {"_id": data.seva_id}): raise HTTPException(404, "Seva not found")

    dup = find_one(db[COL_SEVA_DONATIONS], {"receipt_no": data.receipt_no.strip()})
    if dup and dup.id != seva_donation_id:
        raise HTTPException(400, f"Receipt number '{data.receipt_no}' already in use")

    try:
        update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id}, {
            "seva_id":         data.seva_id,
            "seva_type":       data.seva_type.value,
            "donation_amount": float(data.donation_amount),
            "transaction_id":  data.transaction_id,
            "receipt_no":      data.receipt_no.strip(),
        })

        # Replace seva_person
        old_sp = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": seva_donation_id})
        if old_sp:
            delete_many(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": old_sp.id})
            delete_one(db[COL_SEVA_PERSONS], {"_id": old_sp.id})

        sp_dict = _build_seva_person_dict(seva_donation_id, data.seva_person, db)
        sp_id   = get_next_id(COL_SEVA_PERSONS)
        new_sp  = insert_one(db[COL_SEVA_PERSONS], sp_dict, sp_id)

        for rel in data.seva_person.relations:
            rel_id = get_next_id(COL_SEVA_PERSON_RELATIONS)
            insert_one(db[COL_SEVA_PERSON_RELATIONS],
                       seva_person_relation_doc(new_sp.id, **_sp_relation_fields(rel)),
                       rel_id)

        return {"success": True, "receipt_no": data.receipt_no.strip(),
                "seva_donation_id": seva_donation_id,
                "message": "Seva donation updated successfully"}

    except DuplicateKeyError as e:
        raise HTTPException(400, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# DELETE SEVA DONATION
# ═══════════════════════════════════════════════════════════
@app.delete("/seva-donations/{seva_donation_id}")
def delete_seva_donation(seva_donation_id: int, whatsapp_number: str, db=Depends(get_db)):
    seva_don = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not seva_don: raise HTTPException(404, "Seva donation not found")
    donor = find_one(db[COL_DONORS], {"_id": seva_don.donor_id})
    if not donor or donor.whatsapp_number != whatsapp_number:
        raise HTTPException(403, "You are not authorized to delete this seva booking")
    try:
        sp = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": seva_donation_id})
        if sp:
            delete_many(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id})
            delete_one(db[COL_SEVA_PERSONS], {"_id": sp.id})
        delete_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
        return {"success": True, "message": "Seva donation deleted successfully"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# GET RECEIPT BY RECEIPT NUMBER
# ═══════════════════════════════════════════════════════════
@app.get("/receipt/{receipt_no}")
def get_receipt(receipt_no: str, db=Depends(get_db)):
    sd = find_one(db[COL_SEVA_DONATIONS], {"receipt_no": receipt_no.strip()})
    if not sd: raise HTTPException(404, f"Receipt '{receipt_no}' not found")

    donor    = find_one(db[COL_DONORS], {"_id": sd.donor_id})
    seva_obj = find_one(db[COL_SEVA],   {"_id": sd.seva_id})
    sp       = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})

    seva_person_data = None
    if sp:
        gotra_obj     = find_one(db[COL_GOTRA],    {"_id": sp.gotra_id})
        birthstar_obj = find_one(db[COL_BIRTHSTAR], {"_id": sp.birthstar_id})
        zodiac_obj    = find_one(db[COL_ZODIAC],    {"_id": sp.zodiac_id})
        relations_data = []
        for rel in find_all(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id}):
            rel_gotra     = find_one(db[COL_GOTRA],    {"_id": rel.gotra_id})
            rel_birthstar = find_one(db[COL_BIRTHSTAR], {"_id": rel.birthstar_id})
            rel_zodiac    = find_one(db[COL_ZODIAC],    {"_id": rel.zodiac_id})
            relations_data.append({
                "relation_type":  rel.relation_type,
                "first_name":     rel.first_name,
                "middle_name":    rel.middle_name,
                "last_name":      rel.last_name,
                "gender":         rel.gender,
                "gotra_name":     rel_gotra.gotra_name if rel_gotra else "",
                "birthstar_name": rel_birthstar.birthstar_name if rel_birthstar else "",
                "zodiac_name":    rel_zodiac.zodiac_name if rel_zodiac else "",
                "birthdate":      rel.birthdate,
            })
        seva_person_data = {
            "first_name":            sp.first_name,
            "middle_name":           sp.middle_name,
            "last_name":             sp.last_name,
            "gotra_name":            gotra_obj.gotra_name if gotra_obj else "",
            "birthstar_name":        birthstar_obj.birthstar_name if birthstar_obj else "",
            "zodiac_name":           zodiac_obj.zodiac_name if zodiac_obj else "",
            "seva_calendar_type":    sp.seva_calendar_type,
            "seva_english_date":     sp.seva_english_date,
            "seva_hindu_date":       sp.seva_hindu_date,
            "relations":             relations_data,
        }

    return {
        "receipt_no":       sd.receipt_no,
        "seva_donation_id": sd.id,
        "seva_name":        seva_obj.seva_name if seva_obj else "",
        "seva_type":        sd.seva_type,
        "donation_amount":  float(sd.donation_amount),
        "transaction_id":   sd.transaction_id,
        "created_at":       str(sd.created_at),
        "seva_image":       sd.seva_image,
        "donor": {
            "id":              donor.id if donor else None,
            "first_name":      donor.first_name if donor else "",
            "middle_name":     donor.middle_name if donor else "",
            "last_name":       donor.last_name if donor else "",
            "whatsapp_number": donor.whatsapp_number if donor else "",
            "email":           donor.email if donor else "",
            "address_line1":   donor.address_line1 if donor else "",
            "address_line2":   donor.address_line2 if donor else "",
            "address_city":    donor.address_city if donor else "",
            "address_state":   donor.address_state if donor else "",
            "address_pincode": donor.address_pincode if donor else "",
        } if donor else None,
        "seva_person": seva_person_data,
    }


# ═══════════════════════════════════════════════════════════
# EMAIL OTP VERIFICATION
# ═══════════════════════════════════════════════════════════
def _send_smtp_email(to_email: str, subject: str, html_body: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        raise RuntimeError("SMTP_USER and SMTP_PASSWORD must be set in .env")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Jagannath Temple <{SMTP_FROM}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html_body, "html"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo(); server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())


@app.post("/email/send-otp")
def send_otp(data: OtpRequest):
    otp    = str(random.randint(100000, 999999))
    expiry = time.time() + OTP_EXPIRY_SECONDS
    _otp_store[data.email.lower()] = {"otp": otp, "expires": expiry}
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                border:1px solid #e0c870;border-radius:12px;padding:32px;">
        <h2 style="color:#8B5E3C;margin:0 0 8px;">🛕 Jagannath Temple</h2>
        <p style="color:#555;margin:0 0 24px;font-size:14px;">Admin Setup — Email Verification</p>
        <p style="font-size:15px;color:#333;">Your One-Time Password (OTP) is:</p>
        <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                    color:#7B4FA6;text-align:center;padding:16px 0;">{otp}</div>
        <p style="font-size:13px;color:#888;margin-top:16px;">
            This OTP is valid for <strong>5 minutes</strong>.<br>Do not share it with anyone.
        </p>
    </div>
    """
    try:
        _send_smtp_email(data.email, "Your OTP — Jagannath Temple Admin Setup", html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    return {"success": True, "message": f"OTP sent to {data.email}"}


@app.post("/email/verify-otp")
def verify_otp(data: OtpVerify):
    email_lower = data.email.lower()
    record = _otp_store.get(email_lower)
    if not record:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    if time.time() > record["expires"]:
        del _otp_store[email_lower]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if record["otp"] != data.otp.strip():
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")
    del _otp_store[email_lower]
    _verified_emails.add(email_lower)
    return {"success": True, "message": "Email verified successfully"}


# ═══════════════════════════════════════════════════════════
# PHONE OTP — MessageWall SMS Integration
# ═══════════════════════════════════════════════════════════
def _send_sms_otp(phone_number: str, otp: str) -> None:
    if not MESSAGEWALL_API_KEY:
        raise RuntimeError("MESSAGEWALL_API_KEY is not configured in .env.")
    MESSAGEWALL_ERRORS = {
        "101": "Invalid API user.", "102": "Invalid Sender ID.", "103": "Invalid mobile number.",
        "104": "Invalid Route.", "105": "Invalid message body.", "106": "Message blocked as spam.",
        "107": "Promotional route blocked.", "108": "Insufficient credits.",
        "109": "Promotional route restricted.", "110": "Invalid DLT Template ID.",
        "111": "Invalid schedule time.",
    }
    number_digits = phone_number.lstrip("+")
    message = (f"Dear user, Your OTP login verification {otp} "
               f"This OTP is valid for 5 minutes Thank you. VECTRA")
    params  = {"key": MESSAGEWALL_API_KEY, "route": MESSAGEWALL_ROUTE,
               "sender": MESSAGEWALL_SENDER_ID, "number": number_digits,
               "sms": message, "templateid": MESSAGEWALL_TEMPLATE_ID}
    try:
        resp = http_requests.get(MESSAGEWALL_API_URL, params=params, timeout=15)
        body = resp.text.strip()
        print(f"[MessageWall] HTTP {resp.status_code} | raw response: {body!r}")
        resp.raise_for_status()
        if body in MESSAGEWALL_ERRORS:
            raise RuntimeError(f"SMS failed (code {body}): {MESSAGEWALL_ERRORS[body]}")
        if body.upper().startswith(("ERROR", "FAIL", "INVALID", "REJECTED", "BLOCKED")):
            raise RuntimeError(f"MessageWall rejected the request: {body}")
        print(f"[MessageWall] SMS sent successfully. Message ID: {body}")
    except http_requests.RequestException as e:
        raise RuntimeError(f"SMS gateway unreachable: {str(e)}")


@app.post("/phone/send-otp")
def phone_send_otp(data: PhoneOtpRequest):
    phone = data.phone_number.strip()
    if not phone:
        raise HTTPException(400, "Phone number is required.")
    otp    = str(random.randint(100000, 999999))
    expiry = time.time() + OTP_EXPIRY_SECONDS
    _phone_otp_store[phone] = {"otp": otp, "expires": expiry}
    try:
        _send_sms_otp(phone, otp)
    except RuntimeError as e:
        _phone_otp_store.pop(phone, None)
        raise HTTPException(status_code=500, detail=str(e))
    masked = phone[:3] + "****" + phone[-3:] if len(phone) > 6 else "****"
    return {"success": True, "masked_phone": masked, "message": f"OTP sent to {masked}. Valid for 5 minutes."}


@app.post("/phone/verify-otp")
def phone_verify_otp(data: PhoneOtpVerify):
    phone  = data.phone_number.strip()
    record = _phone_otp_store.get(phone)
    if not record:
        raise HTTPException(400, "No OTP found for this number. Please request a new OTP.")
    if time.time() > record["expires"]:
        _phone_otp_store.pop(phone, None)
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if record["otp"] != data.otp.strip():
        raise HTTPException(400, "Incorrect OTP. Please try again.")
    _phone_otp_store.pop(phone, None)
    _verified_phones.add(phone)
    return {"success": True, "message": "Phone number verified successfully."}


# ═══════════════════════════════════════════════════════════
# ADMIN — CHANGE ANY USER'S PASSWORD (OTP-verified)
# ═══════════════════════════════════════════════════════════
@app.post("/admin/change-password/send-otp")
def admin_change_pw_send_otp(data: AdminChangePwOtpRequest, db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": data.admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required.")
    if not admin.email:
        raise HTTPException(400, "No email address is registered for the admin account.")
    if not (SMTP_USER and SMTP_PASSWORD):
        raise HTTPException(503, "Email service is not configured on this server.")

    target = find_one(db[COL_USERS], {"username": data.target_username.strip()})
    if not target:
        raise HTTPException(404, f"User '{data.target_username}' not found.")

    otp    = str(random.randint(100000, 999999))
    expiry = time.time() + OTP_EXPIRY_SECONDS
    _otp_store[f"adminpw:{data.admin_username}:{data.target_username}"] = {"otp": otp, "expires": expiry}

    parts  = admin.email.split("@")
    masked = parts[0][0] + "*" * max(3, len(parts[0]) - 1) + "@" + parts[1]

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                border:1px solid #e0c870;border-radius:12px;padding:32px;">
        <h2 style="color:#8B5E3C;margin:0 0 8px;">🛕 Jagannath Temple</h2>
        <p style="color:#555;margin:0 0 24px;font-size:14px;">Admin — Password Change Authorisation</p>
        <p style="font-size:15px;color:#333;">Hello <strong>{admin.username}</strong>,</p>
        <p style="font-size:14px;color:#555;">
            You are about to change the password for account: <strong>{data.target_username}</strong>
        </p>
        <p style="font-size:14px;color:#555;">Your One-Time Password (OTP) to authorise this action:</p>
        <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                    color:#7B4FA6;text-align:center;padding:16px 0;">{otp}</div>
        <p style="font-size:13px;color:#888;margin-top:16px;">
            Valid for <strong>5 minutes</strong>. Do not share this OTP with anyone.
        </p>
    </div>
    """
    try:
        _send_smtp_email(admin.email, "Password Change OTP — Jagannath Temple", html)
    except Exception as e:
        raise HTTPException(500, f"Failed to send OTP email: {str(e)}")
    return {"success": True, "masked_email": masked, "message": f"OTP sent to {masked}"}


@app.post("/admin/change-password/set")
def admin_change_pw_set(data: AdminChangePwSet, db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": data.admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required.")

    key    = f"adminpw:{data.admin_username}:{data.target_username}"
    record = _otp_store.get(key)
    if not record:
        raise HTTPException(400, "No OTP found. Please request a new one.")
    if time.time() > record["expires"]:
        del _otp_store[key]
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if record["otp"] != data.otp.strip():
        raise HTTPException(400, "Incorrect OTP. Please try again.")

    target = find_one(db[COL_USERS], {"username": data.target_username.strip()})
    if not target:
        raise HTTPException(404, f"User '{data.target_username}' not found.")

    update_one(db[COL_USERS], {"username": data.target_username.strip()},
               {"hashed_password": pwd_context.hash(data.new_password)})
    del _otp_store[key]
    return {"success": True, "message": f"Password for '{data.target_username}' updated successfully."}


# ═══════════════════════════════════════════════════════════
# FORGOT PASSWORD
# ═══════════════════════════════════════════════════════════
@app.post("/auth/forgot-password")
def forgot_password_send(data: ForgotRequest, db=Depends(get_db)):
    username = data.username.strip()
    user = find_one(db[COL_USERS], {"username": username})
    if not user:
        raise HTTPException(404, "No account found for this username.")
    if not (SMTP_USER and SMTP_PASSWORD):
        raise HTTPException(503, "Email service is not configured on this server.")

    admin = find_one(db[COL_USERS], {"username": ADMIN_DEFAULT_USERNAME})
    if not admin or not admin.email:
        raise HTTPException(400, "No administrator email is configured.")

    otp    = str(random.randint(100000, 999999))
    expiry = time.time() + OTP_EXPIRY_SECONDS
    _otp_store[f"forgot:{username}"] = {"otp": otp, "expires": expiry}

    parts  = admin.email.split("@")
    masked = parts[0][0] + "*" * max(3, len(parts[0]) - 1) + "@" + parts[1]

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                border:1px solid #e0c870;border-radius:12px;padding:32px;">
        <h2 style="color:#8B5E3C;margin:0 0 8px;">🛕 Jagannath Temple</h2>
        <p style="color:#555;margin:0 0 24px;font-size:14px;">Password Reset Request</p>
        <p style="font-size:15px;color:#333;">Hello <strong>{admin.username}</strong>,</p>
        <p style="font-size:14px;color:#555;">
            A password reset has been requested for account: <strong>{user.username}</strong>
        </p>
        <p style="font-size:14px;color:#555;">OTP to authorise this reset:</p>
        <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                    color:#7B4FA6;text-align:center;padding:16px 0;">{otp}</div>
        <p style="font-size:13px;color:#888;margin-top:16px;">Valid for 5 minutes.</p>
    </div>
    """
    try:
        _send_smtp_email(admin.email, "Password Reset OTP — Jagannath Temple", html)
    except Exception as e:
        raise HTTPException(500, f"Failed to send OTP email: {str(e)}")
    return {"success": True, "masked_email": masked, "message": f"OTP sent to admin email {masked}"}


@app.post("/auth/forgot-password/verify")
def forgot_password_verify(data: ForgotVerify, db=Depends(get_db)):
    username = data.username.strip()
    key      = f"forgot:{username}"
    record   = _otp_store.get(key)
    if not record:
        raise HTTPException(400, "No OTP found. Please request a new one.")
    if time.time() > record["expires"]:
        del _otp_store[key]
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if record["otp"] != data.otp.strip():
        raise HTTPException(400, "Incorrect OTP. Please try again.")
    del _otp_store[key]
    _verified_emails.add(f"forgot_verified:{username}")
    return {"success": True, "message": "OTP verified. Please set your new password."}


@app.post("/auth/forgot-password/set-password")
def forgot_password_set(data: ForgotSetPassword, db=Depends(get_db)):
    username     = data.username.strip()
    verified_key = f"forgot_verified:{username}"
    if verified_key not in _verified_emails:
        raise HTTPException(400, "OTP not verified. Please complete OTP verification first.")
    user = find_one(db[COL_USERS], {"username": username})
    if not user:
        raise HTTPException(404, "User not found.")
    update_one(db[COL_USERS], {"username": username},
               {"hashed_password": pwd_context.hash(data.new_password)})
    _verified_emails.discard(verified_key)
    return {"success": True, "message": "Password updated successfully. Please login with your new password."}


# ═══════════════════════════════════════════════════════════
# HINDU CALENDAR ENDPOINTS
# ═══════════════════════════════════════════════════════════
@app.get("/hindu-calendar/purnima-names", response_model=list[PurnimaNameOut])
def get_purnima_names(db=Depends(get_db)):
    return [{"id": r.id, "name": r.name}
            for r in find_all(db[COL_PURNIMA_NAMES], sort_field="display_order")]

@app.get("/hindu-calendar/amavasya-names", response_model=list[AmavasyanNameOut])
def get_amavasya_names(db=Depends(get_db)):
    return [{"id": r.id, "name": r.name}
            for r in find_all(db[COL_AMAVASYA_NAMES], sort_field="display_order")]

@app.get("/hindu-calendar/krishna-paksha-tithis", response_model=list[KrishnaPakshaTithiOut])
def get_krishna_paksha_tithis(db=Depends(get_db)):
    return [{"id": r.id, "tithi_name": r.tithi_name, "tithi_number": r.tithi_number}
            for r in find_all(db[COL_KRISHNA_PAKSHA_TITHIS], sort_field="tithi_number")]

@app.get("/hindu-calendar/shukla-paksha-tithis", response_model=list[ShuklaPakshaTithiOut])
def get_shukla_paksha_tithis(db=Depends(get_db)):
    return [{"id": r.id, "tithi_name": r.tithi_name, "tithi_number": r.tithi_number}
            for r in find_all(db[COL_SHUKLA_PAKSHA_TITHIS], sort_field="tithi_number")]


# ═══════════════════════════════════════════════════════════
# HINDU CALENDAR CONVERSION ENGINE  (v13.0)
# ═══════════════════════════════════════════════════════════
_PURNIMA_APPROX: dict = {
    1:  (4,  6), 2:  (5,  5), 3:  (6,  3), 4:  (7,  3),
    5:  (8,  1), 6:  (8, 19), 7:  (9, 17), 8:  (10,16),
    9:  (11,15), 10: (12,14), 11: (1, 13), 12: (2, 12), 13: (3, 13),
}
_AMAVASYA_APPROX: dict = {
    1:  (3, 21), 2:  (4, 20), 3:  (5, 19), 4:  (6, 18),
    5:  (7, 17), 6:  (8,  4), 7:  (9,  2), 8:  (10, 2),
    9:  (11, 1), 10: (11,30), 11: (12,30), 12: (1, 18), 13: (2, 17),
}


def _find_nearest_full_moon(approx) -> "date":
    try:
        import ephem
        from datetime import date as _date
        d    = ephem.Date(approx.strftime("%Y/%m/%d"))
        prev = ephem.Date(ephem.previous_full_moon(d)).datetime().date()
        nxt  = ephem.Date(ephem.next_full_moon(d)).datetime().date()
        return prev if abs((prev - approx).days) <= abs((nxt - approx).days) else nxt
    except Exception:
        return approx


def _find_nearest_new_moon(approx) -> "date":
    try:
        import ephem
        from datetime import date as _date
        d    = ephem.Date(approx.strftime("%Y/%m/%d"))
        prev = ephem.Date(ephem.previous_new_moon(d)).datetime().date()
        nxt  = ephem.Date(ephem.next_new_moon(d)).datetime().date()
        return prev if abs((prev - approx).days) <= abs((nxt - approx).days) else nxt
    except Exception:
        return approx


def _get_purnima_date(month_order: int, year: int):
    from datetime import date as _date
    mm, dd = _PURNIMA_APPROX.get(month_order, (4, 6))
    try:    approx = _date(year, mm, dd)
    except ValueError: approx = _date(year, mm, 28)
    return _find_nearest_full_moon(approx)


def _get_amavasya_date(month_order: int, year: int):
    from datetime import date as _date
    mm, dd = _AMAVASYA_APPROX.get(month_order, (3, 21))
    try:    approx = _date(year, mm, dd)
    except ValueError: approx = _date(year, mm, 28)
    return _find_nearest_new_moon(approx)


def _compute_hindu_english_date(db, purnima_name_id, krishna_tithi_id,
                                 amavasya_name_id, shukla_tithi_id,
                                 year: int, month=None):
    from datetime import timedelta, date as _date

    def _anchor(display_order: int, is_purnima: bool):
        if month:
            try: return _date(year, month, 15)
            except ValueError: pass
        return (_get_purnima_date(display_order, year)
                if is_purnima else _get_amavasya_date(display_order, year))

    try:
        if purnima_name_id and krishna_tithi_id:
            purnima = find_one(db[COL_PURNIMA_NAMES],          {"_id": purnima_name_id})
            tithi   = find_one(db[COL_KRISHNA_PAKSHA_TITHIS],   {"_id": krishna_tithi_id})
            if not purnima or not tithi: return None
            base = _find_nearest_full_moon(_anchor(purnima.display_order, True))
            return base + timedelta(days=tithi.tithi_number)
        elif amavasya_name_id and shukla_tithi_id:
            amavasya = find_one(db[COL_AMAVASYA_NAMES],         {"_id": amavasya_name_id})
            tithi    = find_one(db[COL_SHUKLA_PAKSHA_TITHIS],   {"_id": shukla_tithi_id})
            if not amavasya or not tithi: return None
            base = _find_nearest_new_moon(_anchor(amavasya.display_order, False))
            return base + timedelta(days=tithi.tithi_number)
    except Exception as exc:
        logging.getLogger("hindu_cal").error("Hindu date conversion failed: %s", exc)
    return None


def _fmt_date_display(d) -> str:
    try:    return d.strftime("%A, %-d %B %Y")
    except ValueError: return d.strftime("%A, %#d %B %Y")


@app.get("/hindu-calendar/convert")
def hindu_calendar_convert(
    purnima_name_id:  Optional[int] = Query(None),
    krishna_tithi_id: Optional[int] = Query(None),
    amavasya_name_id: Optional[int] = Query(None),
    shukla_tithi_id:  Optional[int] = Query(None),
    year:             int            = Query(...),
    month:            Optional[int]  = Query(None),
    db=Depends(get_db),
):
    from datetime import timedelta, date as _date

    def _anchor_purnima(display_order: int):
        if month:
            try: return _date(year, month, 15)
            except ValueError: pass
        return _get_purnima_date(display_order, year)

    def _anchor_amavasya(display_order: int):
        if month:
            try: return _date(year, month, 15)
            except ValueError: pass
        return _get_amavasya_date(display_order, year)

    if purnima_name_id and krishna_tithi_id:
        purnima = find_one(db[COL_PURNIMA_NAMES],         {"_id": purnima_name_id})
        tithi   = find_one(db[COL_KRISHNA_PAKSHA_TITHIS], {"_id": krishna_tithi_id})
        if purnima and tithi:
            base_date    = _find_nearest_full_moon(_anchor_purnima(purnima.display_order))
            english_date = base_date + timedelta(days=tithi.tithi_number)
            return {"english_date": str(english_date), "display": _fmt_date_display(english_date),
                    "base_date": str(base_date),
                    "base_label": f"{purnima.name} falls on {base_date.strftime('%d %b %Y')}",
                    "tithi_label": f"{tithi.tithi_name} (Krishna Paksha) = +{tithi.tithi_number} day(s)"}

    elif amavasya_name_id and shukla_tithi_id:
        amavasya = find_one(db[COL_AMAVASYA_NAMES],       {"_id": amavasya_name_id})
        tithi    = find_one(db[COL_SHUKLA_PAKSHA_TITHIS], {"_id": shukla_tithi_id})
        if amavasya and tithi:
            base_date    = _find_nearest_new_moon(_anchor_amavasya(amavasya.display_order))
            english_date = base_date + timedelta(days=tithi.tithi_number)
            return {"english_date": str(english_date), "display": _fmt_date_display(english_date),
                    "base_date": str(base_date),
                    "base_label": f"{amavasya.name} falls on {base_date.strftime('%d %b %Y')}",
                    "tithi_label": f"{tithi.tithi_name} (Shukla Paksha) = +{tithi.tithi_number} day(s)"}

    return {"english_date": None, "display": None, "base_date": None, "base_label": None, "tithi_label": None}


# ═══════════════════════════════════════════════════════════
# MASTER DATA ENDPOINTS
# ═══════════════════════════════════════════════════════════
@app.get("/zodiac")
def get_zodiac(db=Depends(get_db)):
    return [{"id": z.id, "zodiac_name": z.zodiac_name}
            for z in find_all(db[COL_ZODIAC], sort_field="zodiac_order")]


@app.get("/birthstar")
def get_birthstar(zodiac_id: Optional[int] = Query(default=None), db=Depends(get_db)):
    q: dict = {}
    if zodiac_id is not None:
        if not find_one(db[COL_ZODIAC], {"_id": zodiac_id}):
            raise HTTPException(404, f"Zodiac with id={zodiac_id} not found")
        q["zodiac_id"] = zodiac_id
    return [
        {"id": b.id, "birthstar_name": b.birthstar_name, "star_order": b.star_order, "zodiac_id": b.zodiac_id}
        for b in find_all(db[COL_BIRTHSTAR], q, sort_field="star_order")
    ]


@app.get("/gotra")
def get_gotra(db=Depends(get_db)):
    return [{"id": g.id, "gotra_name": g.gotra_name}
            for g in find_all(db[COL_GOTRA], sort_field="gotra_name")]


@app.post("/gotra/add")
def add_gotra(gotra_name: str = Body(..., embed=True), db=Depends(get_db)):
    gotra_name = gotra_name.strip()
    if not gotra_name:
        raise HTTPException(400, "Gotra name cannot be empty")
    existing = find_one(db[COL_GOTRA], {"gotra_name": gotra_name})
    if existing:
        return {"id": existing.id, "gotra_name": existing.gotra_name, "already_exists": True}
    new_id  = get_next_id(COL_GOTRA)
    new_g   = insert_one(db[COL_GOTRA], {"gotra_name": gotra_name}, new_id)
    return {"id": new_g.id, "gotra_name": new_g.gotra_name, "already_exists": False}


@app.delete("/gotra/{gotra_id}")
def delete_gotra(gotra_id: int, db=Depends(get_db)):
    gotra = find_one(db[COL_GOTRA], {"_id": gotra_id})
    if not gotra:
        raise HTTPException(404, "Gotra not found")
    if (count_docs(db[COL_SEVA_PERSONS], {"gotra_id": gotra_id}) +
        count_docs(db[COL_SEVA_PERSON_RELATIONS], {"gotra_id": gotra_id})) > 0:
        raise HTTPException(400, "Cannot delete — this gotra is used by existing records")
    delete_one(db[COL_GOTRA], {"_id": gotra_id})
    return {"success": True, "message": f"Gotra '{gotra.gotra_name}' deleted"}


@app.get("/relation-types")
def get_relation_types():
    return ["Husband", "Wife", "Son", "Daughter", "Grandson", "Granddaughter", "Other"]


# ═══════════════════════════════════════════════════════════
# ADMIN — SEVA DONATION REPORT
# ═══════════════════════════════════════════════════════════
@app.get("/admin/reports/seva-donations")
def admin_seva_donations_report(
    admin_username: str           = Query(...),
    from_date:      str           = Query(...),
    to_date:        str           = Query(...),
    seva_id:        Optional[int] = Query(None),
    db=Depends(get_db),
):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required.")
    from datetime import date as _date
    try:
        from_dt = _date.fromisoformat(from_date)
        to_dt   = _date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    if from_dt > to_dt:
        raise HTTPException(400, "from_date must be on or before to_date.")

    # Use proper datetime objects so MongoDB can compare against stored datetime values
    from datetime import datetime as _datetime
    from_dt_start = _datetime(from_dt.year, from_dt.month, from_dt.day, 0,  0,  0)
    to_dt_end     = _datetime(to_dt.year,   to_dt.month,   to_dt.day,  23, 59, 59)
    q: dict = {"created_at": {"$gte": from_dt_start, "$lte": to_dt_end}}
    if seva_id:
        q["seva_id"] = seva_id

    donations = list(db[COL_SEVA_DONATIONS].find(q).sort("created_at", DESCENDING))
    results   = []
    for _sd in donations:
        sd    = Row(_sd)
        donor = find_one(db[COL_DONORS], {"_id": sd.donor_id})
        seva_obj = find_one(db[COL_SEVA], {"_id": sd.seva_id})
        sp    = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
        seva_date  = str(sd.created_at)[:10]
        if sp and sp.seva_english_date: seva_date = str(sp.seva_english_date)
        elif sp and sp.seva_hindu_date: seva_date = sp.seva_hindu_date
        sp_name    = " ".join(filter(None, [sp.first_name, sp.middle_name, sp.last_name])) if sp else ""
        donor_name = " ".join(filter(None, [donor.first_name, donor.middle_name, donor.last_name])) if donor else ""
        hindu_purnima_name = hindu_amavasya_name = hindu_krishna_tithi = hindu_shukla_tithi = None
        if sp and sp.seva_calendar_type == "Hindu":
            if sp.seva_purnima_name_id:
                pn = find_one(db[COL_PURNIMA_NAMES], {"_id": sp.seva_purnima_name_id})
                if pn: hindu_purnima_name = pn.name
            if sp.seva_amavasya_name_id:
                an = find_one(db[COL_AMAVASYA_NAMES], {"_id": sp.seva_amavasya_name_id})
                if an: hindu_amavasya_name = an.name
            if sp.seva_krishna_tithi_id:
                kt = find_one(db[COL_KRISHNA_PAKSHA_TITHIS], {"_id": sp.seva_krishna_tithi_id})
                if kt: hindu_krishna_tithi = kt.tithi_name
            if sp.seva_shukla_tithi_id:
                st = find_one(db[COL_SHUKLA_PAKSHA_TITHIS], {"_id": sp.seva_shukla_tithi_id})
                if st: hindu_shukla_tithi = st.tithi_name
        results.append({
            "id":                  sd.id,
            "seva_name":           seva_obj.seva_name if seva_obj else "",
            "seva_type":           sd.seva_type,
            "donor_name":          donor_name,
            "whatsapp_number":     donor.whatsapp_number if donor else "",
            "email":               donor.email if donor else "",
            "address_line1":       donor.address_line1 if donor else "",
            "address_line2":       donor.address_line2 if donor else "",
            "address_city":        donor.address_city if donor else "",
            "address_state":       donor.address_state if donor else "",
            "address_pincode":     donor.address_pincode if donor else "",
            "latitude":            float(donor.latitude)  if donor and donor.latitude  else None,
            "longitude":           float(donor.longitude) if donor and donor.longitude else None,
            "seva_person_name":    sp_name,
            "seva_date":           seva_date,
            "seva_calendar_type":  sp.seva_calendar_type if sp else None,
            "hindu_purnima_name":  hindu_purnima_name,
            "hindu_amavasya_name": hindu_amavasya_name,
            "hindu_krishna_tithi": hindu_krishna_tithi,
            "hindu_shukla_tithi":  hindu_shukla_tithi,
            "donation_amount":     float(sd.donation_amount),
            "receipt_no":          sd.receipt_no,
            "transaction_id":      sd.transaction_id or "",
            "created_at":          str(sd.created_at)[:10],
        })
    return {"from_date": from_date, "to_date": to_date, "seva_id": seva_id, "total": len(results), "records": results}


# ═══════════════════════════════════════════════════════════
# ADMIN — DONOR SEVA LABELS
# ═══════════════════════════════════════════════════════════
@app.get("/admin/donors/{donor_id}/seva-labels")
def get_donor_seva_labels(donor_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required.")
    donor = find_one(db[COL_DONORS], {"_id": donor_id})
    if not donor:
        raise HTTPException(404, "Donor not found.")

    donor_name = " ".join(filter(None, [donor.first_name, donor.middle_name, donor.last_name]))
    results = []
    for sd in find_all(db[COL_SEVA_DONATIONS], {"donor_id": donor_id}):
        seva_obj = find_one(db[COL_SEVA], {"_id": sd.seva_id})
        sp       = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": sd.id})
        seva_date = str(sd.created_at)[:10]
        if sp and sp.seva_english_date: seva_date = str(sp.seva_english_date)
        elif sp and sp.seva_hindu_date: seva_date = sp.seva_hindu_date
        sp_name = " ".join(filter(None, [sp.first_name, sp.middle_name, sp.last_name])) if sp else ""
        hindu_purnima_name = hindu_amavasya_name = hindu_krishna_tithi = hindu_shukla_tithi = None
        if sp and sp.seva_calendar_type == "Hindu":
            if sp.seva_purnima_name_id:
                pn = find_one(db[COL_PURNIMA_NAMES], {"_id": sp.seva_purnima_name_id})
                if pn: hindu_purnima_name = pn.name
            if sp.seva_amavasya_name_id:
                an = find_one(db[COL_AMAVASYA_NAMES], {"_id": sp.seva_amavasya_name_id})
                if an: hindu_amavasya_name = an.name
            if sp.seva_krishna_tithi_id:
                kt = find_one(db[COL_KRISHNA_PAKSHA_TITHIS], {"_id": sp.seva_krishna_tithi_id})
                if kt: hindu_krishna_tithi = kt.tithi_name
            if sp.seva_shukla_tithi_id:
                st = find_one(db[COL_SHUKLA_PAKSHA_TITHIS], {"_id": sp.seva_shukla_tithi_id})
                if st: hindu_shukla_tithi = st.tithi_name
        results.append({
            "id":                  sd.id,
            "seva_name":           seva_obj.seva_name if seva_obj else "",
            "seva_type":           sd.seva_type,
            "donor_name":          donor_name,
            "whatsapp_number":     donor.whatsapp_number or "",
            "email":               donor.email or "",
            "address_line1":       donor.address_line1 or "",
            "address_line2":       donor.address_line2 or "",
            "address_city":        donor.address_city or "",
            "address_state":       donor.address_state or "",
            "address_pincode":     donor.address_pincode or "",
            "latitude":            float(donor.latitude)  if donor.latitude  else None,
            "longitude":           float(donor.longitude) if donor.longitude else None,
            "seva_person_name":    sp_name,
            "seva_date":           seva_date,
            "seva_calendar_type":  sp.seva_calendar_type if sp else None,
            "hindu_purnima_name":  hindu_purnima_name,
            "hindu_amavasya_name": hindu_amavasya_name,
            "hindu_krishna_tithi": hindu_krishna_tithi,
            "hindu_shukla_tithi":  hindu_shukla_tithi,
            "donation_amount":     float(sd.donation_amount),
            "receipt_no":          sd.receipt_no,
            "transaction_id":      sd.transaction_id or "",
            "created_at":          str(sd.created_at)[:10],
        })
    return {"donor_id": donor_id, "donor_name": donor_name, "total": len(results), "records": results}


# ═══════════════════════════════════════════════════════════
# ADMIN — DELETE INDIVIDUAL SEVA DONATION
# ═══════════════════════════════════════════════════════════
@app.delete("/admin/seva-donations/{seva_donation_id}")
def admin_delete_seva_donation(seva_donation_id: int, admin_username: str = Query(...), db=Depends(get_db)):
    admin = find_one(db[COL_USERS], {"username": admin_username.strip()})
    if not admin or not admin.is_admin:
        raise HTTPException(403, "Admin access required.")
    seva_don = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not seva_don:
        raise HTTPException(404, "Seva donation not found.")
    seva_obj  = find_one(db[COL_SEVA], {"_id": seva_don.seva_id})
    seva_name = seva_obj.seva_name if seva_obj else ""
    try:
        sp = find_one(db[COL_SEVA_PERSONS], {"seva_donation_id": seva_donation_id})
        if sp:
            delete_many(db[COL_SEVA_PERSON_RELATIONS], {"seva_person_id": sp.id})
            delete_one(db[COL_SEVA_PERSONS], {"_id": sp.id})
        delete_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
        return {"success": True, "message": f"'{seva_name}' (ID {seva_donation_id}) deleted."}
    except Exception as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════
# SEVA IMAGE — GENERATE & STORE  (Gemini primary / Pollinations fallback)
# ═══════════════════════════════════════════════════════════
@app.post("/seva-donations/{seva_donation_id}/generate-seva-image")
def generate_seva_image(seva_donation_id: int, db=Depends(get_db)):
    _log = logging.getLogger("seva_image")
    sd   = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd:
        raise HTTPException(404, "Seva donation not found")

    if sd.seva_image:
        _log.info("▶ seva_image donation=%d → ✅ CACHED", seva_donation_id)
        return {"success": True, "seva_image": sd.seva_image, "cached": True}

    sibling_doc = db[COL_SEVA_DONATIONS].find_one({
        "seva_id":    sd.seva_id,
        "seva_image": {"$ne": None},
    })
    if sibling_doc:
        sibling = Row(sibling_doc)
        update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id}, {"seva_image": sibling.seva_image})
        _log.info("▶ seva_image donation=%d → ✅ REUSED from sibling=%d", seva_donation_id, sibling.id)
        return {"success": True, "seva_image": sibling.seva_image, "cached": True}

    seva_obj  = find_one(db[COL_SEVA], {"_id": sd.seva_id})
    seva_name = seva_obj.seva_name if seva_obj else "Hindu Temple Seva"

    _log.info("▶ seva_image GENERATE  donation=%d  seva='%s'  source=%s",
              seva_donation_id, seva_name, "gemini" if GEMINI_API_KEY else "pollinations")
    try:
        img_bytes, mime = _fetch_seva_image(seva_name, seed=sd.seva_id)
        b64      = base64.b64encode(img_bytes).decode()
        data_uri = f"data:{mime};base64,{b64}"
        size_kb  = round(len(img_bytes) / 1024, 1)
        update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id}, {"seva_image": data_uri})
        _log.info("▶ seva_image GENERATE ✅  donation=%d  mime=%s  size=%s KB", seva_donation_id, mime, size_kb)
        return {"success": True, "seva_image": data_uri, "cached": False}
    except Exception as exc:
        _log.error("▶ seva_image GENERATE ❌  donation=%d  error=%s", seva_donation_id, exc)
        return {"success": False, "message": str(exc)}


@app.get("/seva-donations/{seva_donation_id}/seva-image-status")
def get_seva_image_status(seva_donation_id: int, db=Depends(get_db)):
    sd = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd: raise HTTPException(404, "Seva donation not found")
    return {"ready": sd.seva_image is not None, "seva_image": sd.seva_image}


@app.post("/seva-donations/{seva_donation_id}/regenerate-seva-image")
def regenerate_seva_image(seva_donation_id: int, db=Depends(get_db)):
    """
    Force-generate a brand-new AI image for this donation, bypassing sibling cache.
    Always calls Gemini (primary) or Pollinations (fallback) with a fresh random seed.
    Overwrites any previously stored image so the user always gets a novel result.
    """
    _log = logging.getLogger("seva_image")
    sd   = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd:
        raise HTTPException(404, "Seva donation not found")

    seva_obj  = find_one(db[COL_SEVA], {"_id": sd.seva_id})
    seva_name = seva_obj.seva_name if seva_obj else "Hindu Temple Seva"

    import random as _random
    fresh_seed = _random.randint(0, 999_999)

    _log.info("▶ regenerate_seva_image donation=%d seva='%s' seed=%d source=%s",
              seva_donation_id, seva_name, fresh_seed,
              "gemini" if GEMINI_API_KEY else "pollinations")
    try:
        img_bytes, mime = _fetch_seva_image(seva_name, seed=fresh_seed)
        b64      = base64.b64encode(img_bytes).decode()
        data_uri = f"data:{mime};base64,{b64}"
        size_kb  = round(len(img_bytes) / 1024, 1)
        update_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id}, {"seva_image": data_uri})
        _log.info("▶ regenerate_seva_image ✅ donation=%d mime=%s size=%s KB",
                  seva_donation_id, mime, size_kb)
        return {"success": True, "seva_image": data_uri}
    except Exception as exc:
        _log.error("▶ regenerate_seva_image ❌ donation=%d error=%s", seva_donation_id, exc)
        return {"success": False, "message": str(exc)}



    sd = find_one(db[COL_SEVA_DONATIONS], {"_id": seva_donation_id})
    if not sd: raise HTTPException(404, "Seva donation not found")
    if not sd.seva_image:
        return {"success": False, "seva_image": None, "message": "No image stored yet"}
    return {"success": True, "seva_image": sd.seva_image}


# ═══════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ═══════════════════════════════════════════════════════════
def _donor_fields(data: DonorCreate) -> dict:
    return dict(
        first_name           = data.first_name,
        middle_name          = data.middle_name,
        last_name            = data.last_name,
        gender               = data.gender.value,
        whatsapp_number      = data.whatsapp_number,
        email                = str(data.email),
        address_line1        = data.address_line1,
        address_line2        = data.address_line2,
        address_city         = data.address_city,
        address_state        = data.address_state,
        address_pincode      = data.address_pincode,
        profession           = data.profession.value if data.profession else None,
        designation          = data.designation,
        institution          = data.institution if (data.profession and data.profession.value == "Work") else None,
        birthdate            = str(data.birthdate) if data.birthdate else None,
        wedding_date         = str(data.wedding_date) if data.wedding_date else None,
        booked_calendar_type = data.booked_calendar_type.value,
        booked_english_date  = str(data.booked_english_date) if data.booked_english_date else None,
        booked_hindu_date    = data.booked_hindu_date,
        photo                = data.photo,
        latitude             = data.latitude,
        longitude            = data.longitude,
    )


def _sp_relation_fields(rel) -> dict:
    return dict(
        relation_type = rel.relation_type,
        first_name    = rel.first_name,
        middle_name   = rel.middle_name,
        last_name     = rel.last_name,
        gender        = rel.gender.value,
        zodiac_id     = rel.zodiac_id,
        birthstar_id  = rel.birthstar_id,
        gotra_id      = rel.gotra_id,
        birthdate     = str(rel.birthdate) if rel.birthdate else None,
        email         = rel.email,
        phone         = rel.phone,
        profession    = rel.profession.value if rel.profession else None,
        designation   = rel.designation,
        institution   = rel.institution if (rel.profession and rel.profession.value == "Work") else None,
    )


def _build_seva_person_dict(seva_donation_id: int, sp, db=None) -> dict:
    """Build a seva_person document dict from the schema object."""
    from datetime import date as _date

    computed_english_date = sp.seva_english_date

    if sp.seva_calendar_type.value == "Hindu" and db is not None and sp.seva_year:
        converted = _compute_hindu_english_date(
            db,
            sp.seva_purnima_name_id, sp.seva_krishna_tithi_id,
            sp.seva_amavasya_name_id, sp.seva_shukla_tithi_id,
            sp.seva_year,
        )
        if converted:
            computed_english_date = converted

    return seva_person_doc(
        seva_donation_id       = seva_donation_id,
        first_name             = sp.first_name,
        middle_name            = sp.middle_name,
        last_name              = sp.last_name,
        gotra_id               = sp.gotra_id,
        birthstar_id           = sp.birthstar_id,
        zodiac_id              = sp.zodiac_id,
        seva_calendar_type     = sp.seva_calendar_type.value,
        seva_english_date      = computed_english_date,
        seva_hindu_date        = sp.seva_hindu_date,
        seva_purnima_name_id   = sp.seva_purnima_name_id,
        seva_krishna_tithi_id  = sp.seva_krishna_tithi_id,
        seva_amavasya_name_id  = sp.seva_amavasya_name_id,
        seva_shukla_tithi_id   = sp.seva_shukla_tithi_id,
    )


def _donor_to_dict(donor: Row) -> dict:
    return {
        "id":                   donor.id,
        "first_name":           donor.first_name,
        "middle_name":          donor.middle_name,
        "last_name":            donor.last_name,
        "gender":               donor.gender,
        "whatsapp_number":      donor.whatsapp_number,
        "email":                donor.email,
        "address_line1":        donor.address_line1,
        "address_line2":        donor.address_line2,
        "address_city":         donor.address_city,
        "address_state":        donor.address_state,
        "address_pincode":      donor.address_pincode,
        "profession":           donor.profession,
        "designation":          donor.designation,
        "institution":          donor.institution,
        "birthdate":            donor.birthdate,
        "wedding_date":         donor.wedding_date,
        "booked_calendar_type": donor.booked_calendar_type,
        "booked_english_date":  donor.booked_english_date,
        "booked_hindu_date":    donor.booked_hindu_date,
        "photo":                donor.photo,
        "latitude":             float(donor.latitude)  if donor.latitude  else None,
        "longitude":            float(donor.longitude) if donor.longitude else None,
    }