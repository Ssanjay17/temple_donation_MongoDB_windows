from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "temple_donation")

# ─────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.server_info()  # will throw if MongoDB not running
    db = client[DB_NAME]
    print(f"✅ Connected to MongoDB — Database: {DB_NAME}")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    exit()

# ─────────────────────────────────────────
# COUNTERS
# ─────────────────────────────────────────
db.counters.delete_many({})
db.counters.insert_many([
  { "_id": "zodiac",                "seq": 12 },
  { "_id": "birthstar",             "seq": 27 },
  { "_id": "gotra",                 "seq": 15 },
  { "_id": "seva",                  "seq": 15 },
  { "_id": "purnima_names",         "seq": 13 },
  { "_id": "amavasya_names",        "seq": 13 },
  { "_id": "krishna_paksha_tithis", "seq": 14 },
  { "_id": "shukla_paksha_tithis",  "seq": 14 },
  { "_id": "users",                 "seq": 0  },
  { "_id": "user_roles",            "seq": 0  },
  { "_id": "donors",                "seq": 0  },
  { "_id": "seva_donations",        "seq": 0  },
  { "_id": "seva_persons",          "seq": 0  },
  { "_id": "seva_person_relations", "seq": 0  }
])

# ─────────────────────────────────────────
# ZODIAC — 12 Rashis
# ─────────────────────────────────────────
db.zodiac.delete_many({})
db.zodiac.insert_many([
  { "_id": 1,  "zodiac_name": "Mesha (Aries)",        "zodiac_order": 1  },
  { "_id": 2,  "zodiac_name": "Vrishabha (Taurus)",   "zodiac_order": 2  },
  { "_id": 3,  "zodiac_name": "Mithuna (Gemini)",     "zodiac_order": 3  },
  { "_id": 4,  "zodiac_name": "Karka (Cancer)",       "zodiac_order": 4  },
  { "_id": 5,  "zodiac_name": "Simha (Leo)",          "zodiac_order": 5  },
  { "_id": 6,  "zodiac_name": "Kanya (Virgo)",        "zodiac_order": 6  },
  { "_id": 7,  "zodiac_name": "Tula (Libra)",         "zodiac_order": 7  },
  { "_id": 8,  "zodiac_name": "Vrishchika (Scorpio)", "zodiac_order": 8  },
  { "_id": 9,  "zodiac_name": "Dhanu (Sagittarius)",  "zodiac_order": 9  },
  { "_id": 10, "zodiac_name": "Makara (Capricorn)",   "zodiac_order": 10 },
  { "_id": 11, "zodiac_name": "Kumbha (Aquarius)",    "zodiac_order": 11 },
  { "_id": 12, "zodiac_name": "Meena (Pisces)",       "zodiac_order": 12 }
])

# ─────────────────────────────────────────
# BIRTHSTAR — 27 Nakshatras
# ─────────────────────────────────────────
db.birthstar.delete_many({})
db.birthstar.insert_many([
  { "_id": 1,  "birthstar_name": "Ashwini",           "star_order": 1,  "zodiac_id": 1  },
  { "_id": 2,  "birthstar_name": "Bharani",            "star_order": 2,  "zodiac_id": 1  },
  { "_id": 3,  "birthstar_name": "Krittika",           "star_order": 3,  "zodiac_id": 2  },
  { "_id": 4,  "birthstar_name": "Rohini",             "star_order": 4,  "zodiac_id": 2  },
  { "_id": 5,  "birthstar_name": "Mrigashira",         "star_order": 5,  "zodiac_id": 3  },
  { "_id": 6,  "birthstar_name": "Ardra",              "star_order": 6,  "zodiac_id": 3  },
  { "_id": 7,  "birthstar_name": "Punarvasu",          "star_order": 7,  "zodiac_id": 4  },
  { "_id": 8,  "birthstar_name": "Pushya",             "star_order": 8,  "zodiac_id": 4  },
  { "_id": 9,  "birthstar_name": "Ashlesha",           "star_order": 9,  "zodiac_id": 4  },
  { "_id": 10, "birthstar_name": "Magha",              "star_order": 10, "zodiac_id": 5  },
  { "_id": 11, "birthstar_name": "Purva Phalguni",     "star_order": 11, "zodiac_id": 5  },
  { "_id": 12, "birthstar_name": "Uttara Phalguni",    "star_order": 12, "zodiac_id": 6  },
  { "_id": 13, "birthstar_name": "Hasta",              "star_order": 13, "zodiac_id": 6  },
  { "_id": 14, "birthstar_name": "Chitra",             "star_order": 14, "zodiac_id": 7  },
  { "_id": 15, "birthstar_name": "Swati",              "star_order": 15, "zodiac_id": 7  },
  { "_id": 16, "birthstar_name": "Vishakha",           "star_order": 16, "zodiac_id": 8  },
  { "_id": 17, "birthstar_name": "Anuradha",           "star_order": 17, "zodiac_id": 8  },
  { "_id": 18, "birthstar_name": "Jyeshtha",           "star_order": 18, "zodiac_id": 8  },
  { "_id": 19, "birthstar_name": "Mula",               "star_order": 19, "zodiac_id": 9  },
  { "_id": 20, "birthstar_name": "Purva Ashadha",      "star_order": 20, "zodiac_id": 9  },
  { "_id": 21, "birthstar_name": "Uttara Ashadha",     "star_order": 21, "zodiac_id": 10 },
  { "_id": 22, "birthstar_name": "Shravana",           "star_order": 22, "zodiac_id": 10 },
  { "_id": 23, "birthstar_name": "Dhanishtha",         "star_order": 23, "zodiac_id": 11 },
  { "_id": 24, "birthstar_name": "Shatabhisha",        "star_order": 24, "zodiac_id": 11 },
  { "_id": 25, "birthstar_name": "Purva Bhadrapada",   "star_order": 25, "zodiac_id": 12 },
  { "_id": 26, "birthstar_name": "Uttara Bhadrapada",  "star_order": 26, "zodiac_id": 12 },
  { "_id": 27, "birthstar_name": "Revati",             "star_order": 27, "zodiac_id": 12 }
])

# ─────────────────────────────────────────
# GOTRA — 15 common Gotras
# ─────────────────────────────────────────
db.gotra.delete_many({})
db.gotra.insert_many([
  { "_id": 1,  "gotra_name": "Kashyapa"    },
  { "_id": 2,  "gotra_name": "Bharadwaja"  },
  { "_id": 3,  "gotra_name": "Vasishtha"   },
  { "_id": 4,  "gotra_name": "Vishwamitra" },
  { "_id": 5,  "gotra_name": "Atri"        },
  { "_id": 6,  "gotra_name": "Gautama"     },
  { "_id": 7,  "gotra_name": "Jamadagni"   },
  { "_id": 8,  "gotra_name": "Agastya"     },
  { "_id": 9,  "gotra_name": "Kaundinya"   },
  { "_id": 10, "gotra_name": "Sandilya"    },
  { "_id": 11, "gotra_name": "Parasara"    },
  { "_id": 12, "gotra_name": "Harita"      },
  { "_id": 13, "gotra_name": "Vatsa"       },
  { "_id": 14, "gotra_name": "Dhananjaya"  },
  { "_id": 15, "gotra_name": "Mudgala"     }
])

# ─────────────────────────────────────────
# SEVA — 15 Temple Sevas
# ─────────────────────────────────────────
db.seva.delete_many({})
db.seva.insert_many([
  { "_id": 1,  "seva_name": "Abadha Seva",         "seva_description": "Daily food offering to Lord Jagannath",             "default_amount_one_time": 500.00,  "default_amount_regular": 300.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 2,  "seva_name": "Mangala Arati",        "seva_description": "Early morning lamp offering to the Lord",           "default_amount_one_time": 1100.00, "default_amount_regular": 700.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 3,  "seva_name": "Mailam Seva",          "seva_description": "Ritual cleaning and dressing of the deity",         "default_amount_one_time": 750.00,  "default_amount_regular": 500.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 4,  "seva_name": "Sahasra Nama Archana", "seva_description": "Chanting of 1000 divine names with flowers",        "default_amount_one_time": 500.00,  "default_amount_regular": 300.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 5,  "seva_name": "Ekadashi Abhishekam",  "seva_description": "Sacred bath offering on Ekadashi day",              "default_amount_one_time": 2100.00, "default_amount_regular": 1100.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 6,  "seva_name": "Kalyanotsavam",        "seva_description": "Divine wedding ceremony of the Lord",               "default_amount_one_time": 5100.00, "default_amount_regular": 2100.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 7,  "seva_name": "Navagraha Pooja",      "seva_description": "Planetary worship for peace and prosperity",        "default_amount_one_time": 1100.00, "default_amount_regular": 700.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 8,  "seva_name": "Annadanam",            "seva_description": "Sacred food distribution to devotees",              "default_amount_one_time": 3100.00, "default_amount_regular": 1500.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 9,  "seva_name": "Rudrabhishekam",       "seva_description": "Vedic ritual bath with sacred items",               "default_amount_one_time": 2100.00, "default_amount_regular": 1100.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 10, "seva_name": "Pushpanjali",          "seva_description": "Flower offering with devotional prayers",           "default_amount_one_time": 300.00,  "default_amount_regular": 200.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 11, "seva_name": "Deeparadhana",         "seva_description": "Evening lamp waving ritual before the deity",       "default_amount_one_time": 500.00,  "default_amount_regular": 300.00,  "is_active": 1, "created_at": datetime.now() },
  { "_id": 12, "seva_name": "Satyanarayana Pooja",  "seva_description": "Lord Vishnu worship for blessings and wishes",      "default_amount_one_time": 1500.00, "default_amount_regular": 1000.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 13, "seva_name": "Ganapathi Homam",      "seva_description": "Fire ritual invoking Lord Ganesha",                 "default_amount_one_time": 3100.00, "default_amount_regular": 2100.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 14, "seva_name": "Sudarshana Homam",     "seva_description": "Protective fire ritual with Sudarshana invocation", "default_amount_one_time": 5100.00, "default_amount_regular": 3100.00, "is_active": 1, "created_at": datetime.now() },
  { "_id": 15, "seva_name": "Vasthu Pooja",         "seva_description": "House purification and Vastu blessing ceremony",    "default_amount_one_time": 2100.00, "default_amount_regular": 1500.00, "is_active": 1, "created_at": datetime.now() }
])

# ─────────────────────────────────────────
# PURNIMA NAMES — 13 Hindu months
# ─────────────────────────────────────────
db.purnima_names.delete_many({})
db.purnima_names.insert_many([
  { "_id": 1,  "name": "Chaitra Purnima",       "display_order": 1  },
  { "_id": 2,  "name": "Vaishakha Purnima",     "display_order": 2  },
  { "_id": 3,  "name": "Jyeshtha Purnima",      "display_order": 3  },
  { "_id": 4,  "name": "Ashadha Purnima",       "display_order": 4  },
  { "_id": 5,  "name": "Adhik Ashadha Purnima", "display_order": 5  },
  { "_id": 6,  "name": "Shravana Purnima",      "display_order": 6  },
  { "_id": 7,  "name": "Bhadrapada Purnima",    "display_order": 7  },
  { "_id": 8,  "name": "Ashwin Purnima",        "display_order": 8  },
  { "_id": 9,  "name": "Kartika Purnima",       "display_order": 9  },
  { "_id": 10, "name": "Margashirsha Purnima",  "display_order": 10 },
  { "_id": 11, "name": "Pausha Purnima",        "display_order": 11 },
  { "_id": 12, "name": "Magha Purnima",         "display_order": 12 },
  { "_id": 13, "name": "Phalguna Purnima",      "display_order": 13 }
])

# ─────────────────────────────────────────
# AMAVASYA NAMES — 13 Hindu months
# ─────────────────────────────────────────
db.amavasya_names.delete_many({})
db.amavasya_names.insert_many([
  { "_id": 1,  "name": "Chaitra Amavasya",       "display_order": 1  },
  { "_id": 2,  "name": "Vaishakha Amavasya",     "display_order": 2  },
  { "_id": 3,  "name": "Jyeshtha Amavasya",      "display_order": 3  },
  { "_id": 4,  "name": "Ashadha Amavasya",       "display_order": 4  },
  { "_id": 5,  "name": "Adhik Ashadha Amavasya", "display_order": 5  },
  { "_id": 6,  "name": "Shravana Amavasya",      "display_order": 6  },
  { "_id": 7,  "name": "Bhadrapada Amavasya",    "display_order": 7  },
  { "_id": 8,  "name": "Ashwin Amavasya",        "display_order": 8  },
  { "_id": 9,  "name": "Kartika Amavasya",       "display_order": 9  },
  { "_id": 10, "name": "Margashirsha Amavasya",  "display_order": 10 },
  { "_id": 11, "name": "Pausha Amavasya",        "display_order": 11 },
  { "_id": 12, "name": "Magha Amavasya",         "display_order": 12 },
  { "_id": 13, "name": "Phalguna Amavasya",      "display_order": 13 }
])

# ─────────────────────────────────────────
# KRISHNA PAKSHA TITHIS — 14 tithis
# ─────────────────────────────────────────
db.krishna_paksha_tithis.delete_many({})
db.krishna_paksha_tithis.insert_many([
  { "_id": 1,  "tithi_name": "Pratipada",   "tithi_number": 1  },
  { "_id": 2,  "tithi_name": "Dwitiya",     "tithi_number": 2  },
  { "_id": 3,  "tithi_name": "Tritiya",     "tithi_number": 3  },
  { "_id": 4,  "tithi_name": "Chaturthi",   "tithi_number": 4  },
  { "_id": 5,  "tithi_name": "Panchami",    "tithi_number": 5  },
  { "_id": 6,  "tithi_name": "Shashthi",    "tithi_number": 6  },
  { "_id": 7,  "tithi_name": "Saptami",     "tithi_number": 7  },
  { "_id": 8,  "tithi_name": "Ashtami",     "tithi_number": 8  },
  { "_id": 9,  "tithi_name": "Navami",      "tithi_number": 9  },
  { "_id": 10, "tithi_name": "Dashami",     "tithi_number": 10 },
  { "_id": 11, "tithi_name": "Ekadashi",    "tithi_number": 11 },
  { "_id": 12, "tithi_name": "Dwadashi",    "tithi_number": 12 },
  { "_id": 13, "tithi_name": "Trayodashi",  "tithi_number": 13 },
  { "_id": 14, "tithi_name": "Chaturdashi", "tithi_number": 14 }
])

# ─────────────────────────────────────────
# SHUKLA PAKSHA TITHIS — 14 tithis
# ─────────────────────────────────────────
db.shukla_paksha_tithis.delete_many({})
db.shukla_paksha_tithis.insert_many([
  { "_id": 1,  "tithi_name": "Pratipada",   "tithi_number": 1  },
  { "_id": 2,  "tithi_name": "Dwitiya",     "tithi_number": 2  },
  { "_id": 3,  "tithi_name": "Tritiya",     "tithi_number": 3  },
  { "_id": 4,  "tithi_name": "Chaturthi",   "tithi_number": 4  },
  { "_id": 5,  "tithi_name": "Panchami",    "tithi_number": 5  },
  { "_id": 6,  "tithi_name": "Shashthi",    "tithi_number": 6  },
  { "_id": 7,  "tithi_name": "Saptami",     "tithi_number": 7  },
  { "_id": 8,  "tithi_name": "Ashtami",     "tithi_number": 8  },
  { "_id": 9,  "tithi_name": "Navami",      "tithi_number": 9  },
  { "_id": 10, "tithi_name": "Dashami",     "tithi_number": 10 },
  { "_id": 11, "tithi_name": "Ekadashi",    "tithi_number": 11 },
  { "_id": 12, "tithi_name": "Dwadashi",    "tithi_number": 12 },
  { "_id": 13, "tithi_name": "Trayodashi",  "tithi_number": 13 },
  { "_id": 14, "tithi_name": "Chaturdashi", "tithi_number": 14 }
])

# ─────────────────────────────────────────
# VERIFY ALL COUNTS
# ─────────────────────────────────────────
print("✅ zodiac:                ", db.zodiac.count_documents({}))
print("✅ birthstar:             ", db.birthstar.count_documents({}))
print("✅ gotra:                 ", db.gotra.count_documents({}))
print("✅ seva:                  ", db.seva.count_documents({}))
print("✅ purnima_names:         ", db.purnima_names.count_documents({}))
print("✅ amavasya_names:        ", db.amavasya_names.count_documents({}))
print("✅ krishna_paksha_tithis: ", db.krishna_paksha_tithis.count_documents({}))
print("✅ shukla_paksha_tithis:  ", db.shukla_paksha_tithis.count_documents({}))
print("✅ counters:              ", db.counters.count_documents({}))
print("")
print("🛕 All seed data inserted successfully!")