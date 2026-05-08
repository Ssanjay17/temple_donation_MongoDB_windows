"""
seed_faq.py — Populate the faq_items collection with
temple-donation-form help questions.

Run once:
    python seed_faq.py
"""

import os
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "temple_donation")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db     = client[DB_NAME]

# ── Auto-increment helper (mirrors database.py) ─────────────────────────
def get_next_id(collection_name: str) -> int:
    result = db["counters"].find_one_and_update(
        {"_id": collection_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return result["seq"]

# ── FAQ seed data ────────────────────────────────────────────────────────
FAQ_ITEMS = [
    {
        "question": "What is First Name, Middle Name and Last Name?",
        "answer": (
            "• First Name is your given/personal name (e.g. Ramesh).\n"
            "• Middle Name is optional — usually your father's name or initials (e.g. Kumar).\n"
            "• Last Name is your family/surname (e.g. Sharma).\n"
            "All three together form your full legal name as it will appear on the receipt."
        ),
        "keywords": ["first", "middle", "last", "name", "surname", "given"],
    },
    {
        "question": "What is a WhatsApp number and why is it needed?",
        "answer": (
            "Your WhatsApp number is the mobile number registered with WhatsApp. "
            "We use it to send you:\n"
            "• Booking confirmation and receipt\n"
            "• Seva schedule reminders\n"
            "• Temple announcements\n"
            "Enter the number with country code, e.g. +91 98765 43210."
        ),
        "keywords": ["whatsapp", "mobile", "phone", "contact", "number", "sms"],
    },
    {
        "question": "What is Zodiac (Rashi)?",
        "answer": (
            "Zodiac (Rashi) is your birth zodiac sign based on the position of the Moon "
            "at the time of your birth according to the Hindu lunar calendar.\n"
            "Examples: Mesha (Aries), Vrishabha (Taurus), Mithuna (Gemini)…\n"
            "Your parents, family priest, or horoscope document can confirm your Rashi."
        ),
        "keywords": ["zodiac", "rashi", "sign", "moon", "birth", "astrology", "horoscope"],
    },
    {
        "question": "What is Birthstar (Nakshatra / Janma Nakshatra)?",
        "answer": (
            "Birthstar (Nakshatra) is the lunar mansion in which the Moon was placed at "
            "your time of birth. There are 27 nakshatras (e.g. Ashwini, Bharani, Kritika…). "
            "It is used in pooja and seva rituals for personalised blessings. "
            "You can find it on your birth chart or ask your family priest."
        ),
        "keywords": ["birthstar", "nakshatra", "star", "janma", "birth", "lunar", "constellation"],
    },
    {
        "question": "What is Gotra?",
        "answer": (
            "Gotra is your patrilineal lineage — the name of the ancient Vedic sage (Rishi) "
            "from whom your family descends. "
            "Examples: Kashyapa, Bharadwaja, Vasishtha, Gautama, Atri…\n"
            "If you don't know your Gotra, you may use 'Kashyapa' (the default for unknown lineage) "
            "or ask an elder in your family."
        ),
        "keywords": ["gotra", "lineage", "family", "sage", "rishi", "clan", "kula"],
    },
    {
        "question": "What is Seva?",
        "answer": (
            "Seva (सेवा) means divine service or ritual offering performed at the temple on your behalf. "
            "Examples include Abhishekam, Archana, Sahasranama, Homam, etc. "
            "Each seva has a specific purpose (health, prosperity, removal of obstacles). "
            "Select the seva you wish to book from the dropdown list."
        ),
        "keywords": ["seva", "service", "ritual", "puja", "pooja", "offering", "abhishekam", "archana"],
    },
    {
        "question": "What is the Calendar Type (English vs Hindu)?",
        "answer": (
            "You can choose the date for your seva in either calendar:\n"
            "• English (Gregorian): standard DD-MM-YYYY date.\n"
            "• Hindu Calendar: based on Purnima (full moon), Amavasya (new moon), "
            "Tithi (lunar day), and the Hindu year (Samvat).\n"
            "Select the format you are comfortable with."
        ),
        "keywords": ["calendar", "date", "english", "hindu", "gregorian", "purnima", "amavasya", "tithi"],
    },
    {
        "question": "What is Purnima and Amavasya?",
        "answer": (
            "• Purnima (पूर्णिमा) is the Full Moon day — considered highly auspicious for sevas.\n"
            "• Amavasya (अमावस्या) is the New Moon day — important for ancestor rituals (Pitru Tarpan).\n"
            "These are special dates in the Hindu lunar calendar used when booking seva "
            "under the Hindu calendar option."
        ),
        "keywords": ["purnima", "full moon", "amavasya", "new moon", "lunar", "tithi"],
    },
    {
        "question": "What is Shukla Paksha and Krishna Paksha Tithi?",
        "answer": (
            "The Hindu lunar month is divided into two fortnights (Paksha):\n"
            "• Shukla Paksha: the bright/waxing fortnight (new moon → full moon), Tithis 1–15.\n"
            "• Krishna Paksha: the dark/waning fortnight (full moon → new moon), Tithis 1–15.\n"
            "Each Tithi is a lunar day. Select the correct Paksha and Tithi when scheduling "
            "a seva using the Hindu calendar."
        ),
        "keywords": ["shukla", "krishna", "paksha", "tithi", "fortnight", "lunar", "day"],
    },
    {
        "question": "What is the Donation Amount / Seva Amount?",
        "answer": (
            "The seva amount is the donation you make for the chosen seva. "
            "Each seva type has a minimum suggested amount displayed when you select it. "
            "You may donate more but not less than the minimum. "
            "The amount will be printed on your receipt."
        ),
        "keywords": ["donation", "amount", "money", "fee", "cost", "seva amount", "payment", "receipt"],
    },
    {
        "question": "What is the Receipt Number?",
        "answer": (
            "The receipt number is a unique reference ID automatically generated after your "
            "donation is saved. It appears on your printed or WhatsApp receipt. "
            "Keep it safe — you can use it to look up your booking later."
        ),
        "keywords": ["receipt", "number", "booking", "id", "reference", "confirmation"],
    },
    {
        "question": "What details are needed for the Seva Person (Yajaman)?",
        "answer": (
            "The Seva Person (Yajaman) is the individual for whom the seva is being performed. "
            "Required fields:\n"
            "• Full name (First / Middle / Last)\n"
            "• Gotra\n"
            "• Nakshatra (Birthstar)\n"
            "• Zodiac (Rashi)\n"
            "• Seva date\n"
            "Additional family members can be added under Relations (spouse, children, parents)."
        ),
        "keywords": ["seva person", "yajaman", "person", "who", "relation", "family", "member"],
    },
    {
        "question": "What is Birthdate and Wedding Date?",
        "answer": (
            "• Birthdate: your date of birth in DD-MM-YYYY format. Used for personalised "
            "blessings and birthday seva reminders.\n"
            "• Wedding Date: your marriage anniversary (optional). Used for anniversary seva "
            "reminders and special blessings.\n"
            "Both fields are optional but recommended for personalised service."
        ),
        "keywords": ["birthdate", "birthday", "wedding", "anniversary", "date", "born"],
    },
    {
        "question": "What is Profession and Designation?",
        "answer": (
            "• Profession: your occupational category — Student, Work (employed), Business, "
            "Homemaker, Retired, etc.\n"
            "• Designation: your specific job title (e.g. Software Engineer, Doctor).\n"
            "• Institution: the organisation or school you work/study at (shown when Work/Student is selected).\n"
            "These help the temple personalise communications."
        ),
        "keywords": ["profession", "designation", "job", "work", "occupation", "student", "business"],
    },
    {
        "question": "What is the Address field?",
        "answer": (
            "The address fields capture your postal address:\n"
            "• Address Line 1: house/flat number and street name.\n"
            "• Address Line 2: area or locality (optional).\n"
            "• City: your town or city.\n"
            "• State: your state or province.\n"
            "• Pincode: 6-digit postal code.\n"
            "This is used for correspondence and tax receipts."
        ),
        "keywords": ["address", "city", "state", "pincode", "locality", "street", "location", "postal"],
    },
    {
        "question": "How do I upload a Photo?",
        "answer": (
            "Click the camera icon or the photo upload button in the donor form. "
            "You can upload a JPG or PNG image up to 2 MB. "
            "The photo is used for identification on your donor profile. "
            "It is optional — you may skip it if you prefer."
        ),
        "keywords": ["photo", "image", "upload", "picture", "camera", "selfie"],
    },
    {
        "question": "What is the Location / Map field?",
        "answer": (
            "The location field captures your geographical coordinates (latitude & longitude) "
            "to help the temple understand donor reach. "
            "Click 'Use my Location' to auto-detect, or drag the pin on the map. "
            "This is entirely optional."
        ),
        "keywords": ["location", "map", "latitude", "longitude", "gps", "coordinates"],
    },
    {
        "question": "What is Gender?",
        "answer": (
            "Select your gender from the dropdown: Male, Female, or Other. "
            "This is used for addressing you correctly in communications and for "
            "certain gender-specific ritual requirements."
        ),
        "keywords": ["gender", "male", "female", "sex"],
    },
    {
        "question": "What is Email and why is it needed?",
        "answer": (
            "Your email address is used to:\n"
            "• Send a digital copy of your donation receipt.\n"
            "• Send OTP for verification (if email OTP is enabled).\n"
            "• Temple newsletters and event notifications.\n"
            "It is strongly recommended but optional. Use a valid address you check regularly."
        ),
        "keywords": ["email", "mail", "address", "otp", "verification", "confirmation"],
    },
    {
        "question": "What is OTP verification?",
        "answer": (
            "OTP (One-Time Password) is a 6-digit code sent to your mobile number or email "
            "to verify that you own it. "
            "Enter the code within 5 minutes of receiving it. "
            "If you did not receive it, click 'Resend OTP'."
        ),
        "keywords": ["otp", "one time password", "verification", "code", "verify", "sms"],
    },
]

# ── Insert ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    existing = db["faq_items"].count_documents({})
    if existing > 0:
        print(f"ℹ  {existing} FAQ items already exist. Skipping seed to avoid duplicates.")
        print("   To re-seed, first run: db.faq_items.drop() in the mongo shell.")
    else:
        for item in FAQ_ITEMS:
            fid = get_next_id("faq_items")
            db["faq_items"].insert_one({
                "_id":        fid,
                "question":   item["question"],
                "answer":     item["answer"],
                "keywords":   item["keywords"],
                "created_at": datetime.utcnow().isoformat(),
            })
            print(f"  ✅  [{fid:02d}] {item['question'][:60]}…")
        print(f"\n🎉  {len(FAQ_ITEMS)} FAQ items seeded successfully.")