from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import List, Optional
from datetime import date
from enum import Enum

# ═══════════════════════════════════════════════════════════
# ENUMS
# ═══════════════════════════════════════════════════════════
class GenderEnum(str, Enum):
    Male   = "Male"
    Female = "Female"

class CalendarTypeEnum(str, Enum):
    English = "English"
    Hindu   = "Hindu"

class ProfessionEnum(str, Enum):
    Work    = "Work"
    Student = "Student"

class SevaTypeEnum(str, Enum):
    OneTime = "One Time"
    Regular = "Regular"

# PaymentStatusEnum removed in v10.0

STANDARD_RELATION_TYPES = [
    "Husband", "Wife", "Son", "Daughter",
    "Grandson", "Granddaughter", "Other",
]

ADMIN_DEFAULT_USERNAME = "Administrator"


# ═══════════════════════════════════════════════════════════
# AUTH — ADMIN FIRST-TIME SETUP
# ═══════════════════════════════════════════════════════════
class AdminSetupSchema(BaseModel):
    """
    One-time bootstrap to create the first Administrator account.
    Username is always 'Administrator'.
    Email + phone are optional (required only when SMTP is configured).
    OTP check is enforced server-side only when SMTP is available.
    """
    password:         str
    confirm_password: str
    email:            Optional[EmailStr] = None
    phone_number:     Optional[str]      = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @model_validator(mode="after")
    def passwords_must_match(self) -> "AdminSetupSchema":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ═══════════════════════════════════════════════════════════
# AUTH — ADMIN SETUP PHONE OTP
# ═══════════════════════════════════════════════════════════
class SetupPhoneOtpRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def phone_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Phone number is required")
        return v


class SetupPhoneOtpVerify(BaseModel):
    phone_number: str
    otp:          str

    @field_validator("otp")
    @classmethod
    def otp_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits")
        return v


# ═══════════════════════════════════════════════════════════
# AUTH — NORMAL USER SIGNUP (self-registration)
# ═══════════════════════════════════════════════════════════
class UserSignupSchema(BaseModel):
    """Normal user self-registration: username + phone + password."""
    username:         str
    phone_number:     str
    password:         str
    confirm_password: str

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v

    @field_validator("phone_number")
    @classmethod
    def phone_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Phone number is required")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @model_validator(mode="after")
    def passwords_must_match(self) -> "UserSignupSchema":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ═══════════════════════════════════════════════════════════
# AUTH — LOGIN
# ═══════════════════════════════════════════════════════════
class AdminLoginSchema(BaseModel):
    """Used for login (admin and all users)."""
    username: str
    password: str


# ═══════════════════════════════════════════════════════════
# ADMIN — CREATE / UPDATE USER
# ═══════════════════════════════════════════════════════════
class UserCreateByAdmin(BaseModel):
    """Schema for admin creating a new user account."""
    username:         str
    password:         str
    confirm_password: str
    is_admin:         bool  = False
    role_name:        Optional[str] = None   # e.g. "Cashier", "Priest", "Staff"
    email:            Optional[EmailStr] = None
    phone_number:     Optional[str]      = None

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @model_validator(mode="after")
    def passwords_must_match(self) -> "UserCreateByAdmin":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class UserOut(BaseModel):
    id:           int
    username:     str
    is_admin:     int
    email:        Optional[str] = None
    phone_number: Optional[str] = None
    role_name:    Optional[str] = None
    created_at:   Optional[str] = None
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
# ROLES — CRUD
# ═══════════════════════════════════════════════════════════
class RoleCreate(BaseModel):
    role_name: str

    @field_validator("role_name")
    @classmethod
    def role_name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Role name cannot be empty")
        if len(v) > 100:
            raise ValueError("Role name must be 100 characters or fewer")
        return v


# ═══════════════════════════════════════════════════════════
# EMAIL OTP VERIFICATION
# ═══════════════════════════════════════════════════════════
class OtpRequest(BaseModel):
    email: EmailStr


class OtpVerify(BaseModel):
    email: EmailStr
    otp:   str

    @field_validator("otp")
    @classmethod
    def otp_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits")
        return v


# ═══════════════════════════════════════════════════════════
# PHONE OTP — MessageWall SMS Verification
# ═══════════════════════════════════════════════════════════
class PhoneOtpRequest(BaseModel):
    """Send OTP to a phone number via MessageWall SMS."""
    phone_number: str   # full number with country code, e.g. "+919876543210"

    @field_validator("phone_number")
    @classmethod
    def phone_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Phone number is required")
        return v


class PhoneOtpVerify(BaseModel):
    """Verify the OTP entered by the user."""
    phone_number: str
    otp:          str

    @field_validator("otp")
    @classmethod
    def otp_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits")
        return v


# ═══════════════════════════════════════════════════════════
# ADMIN — CHANGE ANY USER'S PASSWORD (OTP-verified)
# ═══════════════════════════════════════════════════════════
class AdminChangePwOtpRequest(BaseModel):
    admin_username:  str
    target_username: str   # user whose password is being changed


class AdminChangePwSet(BaseModel):
    admin_username:   str
    target_username:  str
    otp:              str
    new_password:     str
    confirm_password: str

    @field_validator("otp")
    @classmethod
    def otp_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits")
        return v

    @model_validator(mode="after")
    def passwords_must_match(self) -> "AdminChangePwSet":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ═══════════════════════════════════════════════════════════
# FORGOT PASSWORD
# ═══════════════════════════════════════════════════════════
class ForgotRequest(BaseModel):
    username: str


class ForgotVerify(BaseModel):
    username: str
    otp:      str

    @field_validator("otp")
    @classmethod
    def otp_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits")
        return v


class ForgotSetPassword(BaseModel):
    username:         str
    new_password:     str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("New password must be at least 6 characters")
        return v

    @model_validator(mode="after")
    def passwords_must_match(self) -> "ForgotSetPassword":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ═══════════════════════════════════════════════════════════
# MASTER DATA — RESPONSE SCHEMAS
# ═══════════════════════════════════════════════════════════
class ZodiacOut(BaseModel):
    id:          int
    zodiac_name: str
    model_config = {"from_attributes": True}


class BirthstarOut(BaseModel):
    id:             int
    birthstar_name: str
    star_order:     int
    zodiac_id:      int
    model_config = {"from_attributes": True}


class GotraOut(BaseModel):
    id:         int
    gotra_name: str
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
# DONOR CREATE / UPDATE
# ═══════════════════════════════════════════════════════════
class DonorCreate(BaseModel):
    first_name:      str
    middle_name:     Optional[str] = None
    last_name:       str
    gender:          GenderEnum
    whatsapp_number: str
    email:           EmailStr

    address_line1:   Optional[str] = None
    address_line2:   Optional[str] = None
    address_city:    Optional[str] = None
    address_state:   Optional[str] = None
    address_pincode: Optional[str] = None

    profession:  Optional[ProfessionEnum] = None
    designation: Optional[str] = None
    institution: Optional[str] = None

    @model_validator(mode="after")
    def clear_institution_unless_work(self) -> "DonorCreate":
        if self.profession != ProfessionEnum.Work:
            self.institution = None
        return self

    birthdate:    Optional[date] = None
    wedding_date: Optional[date] = None

    booked_calendar_type: CalendarTypeEnum = CalendarTypeEnum.English
    booked_english_date:  Optional[date]   = None
    booked_hindu_date:    Optional[str]    = None

    # Profile photo: base64 data URI (e.g. "data:image/jpeg;base64,...")
    # or a special token like "avatar:male" / "avatar:female" to indicate chosen avatar
    photo: Optional[str] = None

    # GPS coordinates from Leaflet/Nominatim (set by frontend geocoding)
    latitude:  Optional[float] = None
    longitude: Optional[float] = None



# ═══════════════════════════════════════════════════════════
# SEVA PERSON RELATION
# ═══════════════════════════════════════════════════════════
class SevaPersonRelationSchema(BaseModel):
    relation_type: str
    first_name:    str
    middle_name:   Optional[str] = None
    last_name:     str
    gender:        GenderEnum
    zodiac_id:     int
    birthstar_id:  int
    gotra_id:      int
    birthdate:     Optional[date] = None
    email:         Optional[str]  = None
    phone:         Optional[str]  = None
    profession:    Optional[ProfessionEnum] = None
    designation:   Optional[str]  = None
    institution:   Optional[str]  = None

    @field_validator("relation_type")
    @classmethod
    def relation_type_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("relation_type cannot be empty")
        if len(v) > 100:
            raise ValueError("relation_type must be 100 characters or fewer")
        return v

    @model_validator(mode="after")
    def clear_relation_institution_unless_work(self) -> "SevaPersonRelationSchema":
        if self.profession != ProfessionEnum.Work:
            self.institution = None
        return self

    @field_validator("birthstar_id")
    @classmethod
    def birthstar_must_be_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("birthstar_id must be a positive integer")
        return v

    @field_validator("zodiac_id")
    @classmethod
    def zodiac_must_be_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("zodiac_id must be a positive integer")
        return v

    @field_validator("gotra_id")
    @classmethod
    def gotra_must_be_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("gotra_id must be a positive integer")
        return v


# ═══════════════════════════════════════════════════════════
# SEVA PERSON
# FIX #6: Removed redundant `relation_count` field.
#         The server derives the count from len(relations) directly.
# ═══════════════════════════════════════════════════════════
class SevaPersonSchema(BaseModel):
    first_name:   str
    middle_name:  Optional[str] = None
    last_name:    str
    gotra_id:     int
    birthstar_id: int
    zodiac_id:    int

    seva_calendar_type: CalendarTypeEnum = CalendarTypeEnum.English
    seva_english_date:  Optional[date]   = None
    seva_hindu_date:    Optional[str]    = None

    seva_purnima_name_id:  Optional[int] = None
    seva_krishna_tithi_id: Optional[int] = None
    seva_amavasya_name_id: Optional[int] = None
    seva_shukla_tithi_id:  Optional[int] = None

    # Year used for Hindu→English date conversion (required when calendar_type=Hindu)
    seva_year:  Optional[int] = None   # e.g. 2026

    relations: List[SevaPersonRelationSchema] = []


# ═══════════════════════════════════════════════════════════
# SEVA DONATION CREATE  (Steps 3+4 — new booking)
# ═══════════════════════════════════════════════════════════
class SevaDonationCreate(BaseModel):
    donor_id:        int
    seva_id:         int
    seva_type:       SevaTypeEnum
    donation_amount: float
    receipt_no:      str
    transaction_id:  Optional[str] = None
    # payment_status removed in v10.0
    seva_person:     SevaPersonSchema


# ═══════════════════════════════════════════════════════════
# SEVA DONATION UPDATE  (v10.0 — edit existing booking)
# Note: donor_id is NOT editable after creation.
# ═══════════════════════════════════════════════════════════
class SevaDonationUpdate(BaseModel):
    seva_id:         int
    seva_type:       SevaTypeEnum
    donation_amount: float
    receipt_no:      str
    transaction_id:  Optional[str] = None
    seva_person:     SevaPersonSchema


# ═══════════════════════════════════════════════════════════
# SEVA ADMIN CREATE / UPDATE
# ═══════════════════════════════════════════════════════════
class SevaCreate(BaseModel):
    seva_name:               str
    seva_description:        Optional[str] = None
    default_amount_one_time: float = 0.00
    default_amount_regular:  float = 0.00
    is_active:               bool  = True


# ═══════════════════════════════════════════════════════════
# HINDU CALENDAR — RESPONSE SCHEMAS  v9.0
# ═══════════════════════════════════════════════════════════
class PurnimaNameOut(BaseModel):
    id:   int
    name: str
    model_config = {"from_attributes": True}

class AmavasyanNameOut(BaseModel):
    id:   int
    name: str
    model_config = {"from_attributes": True}

class KrishnaPakshaTithiOut(BaseModel):
    id:           int
    tithi_name:   str
    tithi_number: int
    model_config = {"from_attributes": True}

class ShuklaPakshaTithiOut(BaseModel):
    id:           int
    tithi_name:   str
    tithi_number: int
    model_config = {"from_attributes": True}

# ═══════════════════════════════════════════════════════════
# CREATE DONOR FULL  (POST /create-donor-full)
# Combined donor + optional donation in one request.
# ═══════════════════════════════════════════════════════════
class CreateDonorFullDonation(BaseModel):
    donation_reason: str
    donation_amount: float
    status:          str = "Pending"


class CreateDonorFullRequest(BaseModel):
    # ── Donor fields ──
    first_name:      str
    middle_name:     Optional[str] = None
    last_name:       str
    gender:          GenderEnum
    whatsapp_number: str
    email:           EmailStr
    zodiac_id:       int
    birthstar_id:    int
    birth_calendar_type: CalendarTypeEnum = CalendarTypeEnum.English
    birth_english_date:  Optional[date]   = None
    birth_hindu_date:    Optional[str]    = None
    relation_count:  int  = 0
    relations:       List = []
    # ── Optional donation ──
    donation: Optional[CreateDonorFullDonation] = None