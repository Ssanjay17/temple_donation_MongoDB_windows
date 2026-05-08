/* ============================================================
   JAGANNATH TEMPLE DONATION SYSTEM — app.js  v12.0
   4-Step: Verify → Donor → Seva → Seva Person
   + Previous Seva Bookings (edit existing)
   + Admin Login/Signup + Admin Panel (Seva + Gotra + Donors)
   ============================================================ */

// ── Map: pure vanilla JS tile map — no CDN needed.

'use strict';

/* ════════════════════════════════════════════════════════════
   1. CONFIG
════════════════════════════════════════════════════════════ */
const API_BASE = "";

/* ════════════════════════════════════════════════════════════
   2. GLOBAL STATE
════════════════════════════════════════════════════════════ */
let _zodiacList    = [];
let _birthstarList = [];
let _gotraList     = [];
let _sevaList      = [];
let _currentStep   = 1;
let _donorId       = null;
let _donorPhone    = "";

let _pendingEmailAddr      = null;   // donor email to send confirmation to
let _pendingEmailDonId     = null;   // seva_donation_id awaiting email confirmation

// WhatsApp confirmation state — populated after booking, consumed by _promptWAConfirmation()
let _pendingWAPhone        = null;   // donor whatsapp number
let _pendingWADonId        = null;   // seva_donation_id awaiting WA confirmation
let _sprIndex      = 0;


// Donor flow mode: "new" = create new donor+booking, "new_booking" = existing donor new booking, "update_only" = update donor details only
let _donorMode = "new";
let _editingSevaDonationId = null;   // set in update_only mode
let _updateSevaData        = null;   // cached latest seva booking for pre-fill
let _sevaListCache         = [];     // cache for seva overlay — avoids JSON-in-onclick issues

let _adminLoggedIn = false;
let _adminUsername = "";
let _userIsAdmin   = false;   // true = admin, false = staff/normal
let _userRoleName  = "";      // e.g. "Administrator", "Cashier", "Priest"

// Email OTP state
let _emailVerified = false;
let _emailSkipped  = false;
let _otpEmail      = "";
let _resendTimer   = null;

// Phone OTP state (Step 1 SMS verification)
let _phoneVerified        = false;  // true once OTP is confirmed
let _phoneOtpResendTimer  = null;   // countdown interval handle

// Last booking result (Step 5 success screen)
let _lastBooking   = null;

// Map GPS state (read by buildDonorPayload)
let _mapLat = null;
let _mapLng = null;

// Hindu calendar
let _purnimaNames            = [];
let _amavasyanNames          = [];
let _krishnaTithis           = [];
let _shuklaTithis            = [];
let _computedHinduEnglishDate = null;  // last converted Gregorian date (string "YYYY-MM-DD")
let _hinduPreviewTimer        = null;  // debounce handle for live preview fetch

// Debounce timer for donor search
let _donorSearchTimer = null;



/* ================================================
   SESSION PERSISTENCE
   Saves state to sessionStorage so a browser
   refresh restores the user to the same step.
   Cleared automatically when the tab is closed.
================================================ */
const SESSION_KEY = 'jt_session';

function _saveSession() {
    try {
        const s = {
            step:                  _currentStep,
            donorId:               _donorId,
            donorPhone:            _donorPhone,
            donorMode:             _donorMode,
            editingSevaDonationId: _editingSevaDonationId,
            adminLoggedIn:         _adminLoggedIn,
            adminUsername:         _adminUsername,
            userIsAdmin:           _userIsAdmin,
            userRoleName:          _userRoleName,
            phoneVerified:         _phoneVerified,
            emailVerified:         _emailVerified,
            lastBooking:           _lastBooking,
            mapLat:                _mapLat,
            mapLng:                _mapLng,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch(e) { /* storage unavailable */ }
}

function _loadSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

function _clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
}

/* ════════════════════════════════════════════════════════════
   3. STATIC DATA
════════════════════════════════════════════════════════════ */
const COUNTRIES = [
    // ── Popular / Top ──────────────────────────────────────
    {name:"India",                         code:"IN", dial:"+91",   digits:{min:10,max:10}},
    {name:"USA",                           code:"US", dial:"+1",    digits:{min:10,max:10}},
    {name:"UK",                            code:"GB", dial:"+44",   digits:{min:9, max:10}},
    {name:"UAE",                           code:"AE", dial:"+971",  digits:{min:9, max:9}},
    {name:"Singapore",                     code:"SG", dial:"+65",   digits:{min:8, max:8}},
    {name:"Australia",                     code:"AU", dial:"+61",   digits:{min:9, max:9}},
    {name:"Canada",                        code:"CA", dial:"+1",    digits:{min:10,max:10}},
    {name:"Germany",                       code:"DE", dial:"+49",   digits:{min:10,max:11}},
    {name:"France",                        code:"FR", dial:"+33",   digits:{min:9, max:9}},
    {name:"Saudi Arabia",                  code:"SA", dial:"+966",  digits:{min:9, max:9}},
    {name:"Kuwait",                        code:"KW", dial:"+965",  digits:{min:8, max:8}},
    {name:"Qatar",                         code:"QA", dial:"+974",  digits:{min:8, max:8}},
    {name:"Malaysia",                      code:"MY", dial:"+60",   digits:{min:9, max:10}},
    {name:"Sri Lanka",                     code:"LK", dial:"+94",   digits:{min:9, max:9}},
    {name:"Nepal",                         code:"NP", dial:"+977",  digits:{min:10,max:10}},
    // ── A ──────────────────────────────────────────────────
    {name:"Afghanistan",                   code:"AF", dial:"+93",   digits:{min:9, max:9}},
    {name:"Albania",                       code:"AL", dial:"+355",  digits:{min:9, max:9}},
    {name:"Algeria",                       code:"DZ", dial:"+213",  digits:{min:9, max:9}},
    {name:"Andorra",                       code:"AD", dial:"+376",  digits:{min:6, max:8}},
    {name:"Angola",                        code:"AO", dial:"+244",  digits:{min:9, max:9}},
    {name:"Antigua and Barbuda",           code:"AG", dial:"+1268", digits:{min:7, max:7}},
    {name:"Argentina",                     code:"AR", dial:"+54",   digits:{min:10,max:10}},
    {name:"Armenia",                       code:"AM", dial:"+374",  digits:{min:8, max:8}},
    {name:"Austria",                       code:"AT", dial:"+43",   digits:{min:10,max:11}},
    {name:"Azerbaijan",                    code:"AZ", dial:"+994",  digits:{min:9, max:9}},
    // ── B ──────────────────────────────────────────────────
    {name:"Bahamas",                       code:"BS", dial:"+1242", digits:{min:7, max:7}},
    {name:"Bahrain",                       code:"BH", dial:"+973",  digits:{min:8, max:8}},
    {name:"Bangladesh",                    code:"BD", dial:"+880",  digits:{min:10,max:10}},
    {name:"Barbados",                      code:"BB", dial:"+1246", digits:{min:7, max:7}},
    {name:"Belarus",                       code:"BY", dial:"+375",  digits:{min:9, max:9}},
    {name:"Belgium",                       code:"BE", dial:"+32",   digits:{min:9, max:9}},
    {name:"Belize",                        code:"BZ", dial:"+501",  digits:{min:7, max:7}},
    {name:"Benin",                         code:"BJ", dial:"+229",  digits:{min:8, max:8}},
    {name:"Bhutan",                        code:"BT", dial:"+975",  digits:{min:8, max:8}},
    {name:"Bolivia",                       code:"BO", dial:"+591",  digits:{min:8, max:8}},
    {name:"Bosnia and Herzegovina",        code:"BA", dial:"+387",  digits:{min:8, max:9}},
    {name:"Botswana",                      code:"BW", dial:"+267",  digits:{min:8, max:8}},
    {name:"Brazil",                        code:"BR", dial:"+55",   digits:{min:10,max:11}},
    {name:"Brunei",                        code:"BN", dial:"+673",  digits:{min:7, max:7}},
    {name:"Bulgaria",                      code:"BG", dial:"+359",  digits:{min:8, max:9}},
    {name:"Burkina Faso",                  code:"BF", dial:"+226",  digits:{min:8, max:8}},
    {name:"Burundi",                       code:"BI", dial:"+257",  digits:{min:8, max:8}},
    // ── C ──────────────────────────────────────────────────
    {name:"Cambodia",                      code:"KH", dial:"+855",  digits:{min:8, max:9}},
    {name:"Cameroon",                      code:"CM", dial:"+237",  digits:{min:9, max:9}},
    {name:"Cape Verde",                    code:"CV", dial:"+238",  digits:{min:7, max:7}},
    {name:"Central African Republic",      code:"CF", dial:"+236",  digits:{min:8, max:8}},
    {name:"Chad",                          code:"TD", dial:"+235",  digits:{min:8, max:8}},
    {name:"Chile",                         code:"CL", dial:"+56",   digits:{min:9, max:9}},
    {name:"China",                         code:"CN", dial:"+86",   digits:{min:11,max:11}},
    {name:"Colombia",                      code:"CO", dial:"+57",   digits:{min:10,max:10}},
    {name:"Comoros",                       code:"KM", dial:"+269",  digits:{min:7, max:7}},
    {name:"Congo",                         code:"CG", dial:"+242",  digits:{min:9, max:9}},
    {name:"Costa Rica",                    code:"CR", dial:"+506",  digits:{min:8, max:8}},
    {name:"Croatia",                       code:"HR", dial:"+385",  digits:{min:8, max:9}},
    {name:"Cuba",                          code:"CU", dial:"+53",   digits:{min:8, max:8}},
    {name:"Cyprus",                        code:"CY", dial:"+357",  digits:{min:8, max:8}},
    {name:"Czech Republic",                code:"CZ", dial:"+420",  digits:{min:9, max:9}},
    // ── D ──────────────────────────────────────────────────
    {name:"DR Congo",                      code:"CD", dial:"+243",  digits:{min:9, max:9}},
    {name:"Denmark",                       code:"DK", dial:"+45",   digits:{min:8, max:8}},
    {name:"Djibouti",                      code:"DJ", dial:"+253",  digits:{min:8, max:8}},
    {name:"Dominican Republic",            code:"DO", dial:"+1809", digits:{min:7, max:7}},
    // ── E ──────────────────────────────────────────────────
    {name:"Ecuador",                       code:"EC", dial:"+593",  digits:{min:9, max:9}},
    {name:"Egypt",                         code:"EG", dial:"+20",   digits:{min:10,max:10}},
    {name:"El Salvador",                   code:"SV", dial:"+503",  digits:{min:8, max:8}},
    {name:"Equatorial Guinea",             code:"GQ", dial:"+240",  digits:{min:9, max:9}},
    {name:"Eritrea",                       code:"ER", dial:"+291",  digits:{min:7, max:7}},
    {name:"Estonia",                       code:"EE", dial:"+372",  digits:{min:7, max:8}},
    {name:"Eswatini",                      code:"SZ", dial:"+268",  digits:{min:8, max:8}},
    {name:"Ethiopia",                      code:"ET", dial:"+251",  digits:{min:9, max:9}},
    // ── F ──────────────────────────────────────────────────
    {name:"Fiji",                          code:"FJ", dial:"+679",  digits:{min:7, max:7}},
    {name:"Finland",                       code:"FI", dial:"+358",  digits:{min:9, max:10}},
    // ── G ──────────────────────────────────────────────────
    {name:"Gabon",                         code:"GA", dial:"+241",  digits:{min:8, max:8}},
    {name:"Gambia",                        code:"GM", dial:"+220",  digits:{min:7, max:7}},
    {name:"Georgia",                       code:"GE", dial:"+995",  digits:{min:9, max:9}},
    {name:"Ghana",                         code:"GH", dial:"+233",  digits:{min:9, max:9}},
    {name:"Greece",                        code:"GR", dial:"+30",   digits:{min:10,max:10}},
    {name:"Grenada",                       code:"GD", dial:"+1473", digits:{min:7, max:7}},
    {name:"Guatemala",                     code:"GT", dial:"+502",  digits:{min:8, max:8}},
    {name:"Guinea",                        code:"GN", dial:"+224",  digits:{min:9, max:9}},
    {name:"Guinea-Bissau",                 code:"GW", dial:"+245",  digits:{min:7, max:7}},
    {name:"Guyana",                        code:"GY", dial:"+592",  digits:{min:7, max:7}},
    // ── H ──────────────────────────────────────────────────
    {name:"Haiti",                         code:"HT", dial:"+509",  digits:{min:8, max:8}},
    {name:"Honduras",                      code:"HN", dial:"+504",  digits:{min:8, max:8}},
    {name:"Hungary",                       code:"HU", dial:"+36",   digits:{min:9, max:9}},
    // ── I ──────────────────────────────────────────────────
    {name:"Iceland",                       code:"IS", dial:"+354",  digits:{min:7, max:7}},
    {name:"Indonesia",                     code:"ID", dial:"+62",   digits:{min:9, max:12}},
    {name:"Iran",                          code:"IR", dial:"+98",   digits:{min:10,max:10}},
    {name:"Iraq",                          code:"IQ", dial:"+964",  digits:{min:10,max:10}},
    {name:"Ireland",                       code:"IE", dial:"+353",  digits:{min:9, max:9}},
    {name:"Israel",                        code:"IL", dial:"+972",  digits:{min:9, max:9}},
    {name:"Italy",                         code:"IT", dial:"+39",   digits:{min:9, max:10}},
    {name:"Ivory Coast",                   code:"CI", dial:"+225",  digits:{min:8, max:10}},
    // ── J ──────────────────────────────────────────────────
    {name:"Jamaica",                       code:"JM", dial:"+1876", digits:{min:7, max:7}},
    {name:"Japan",                         code:"JP", dial:"+81",   digits:{min:10,max:11}},
    {name:"Jordan",                        code:"JO", dial:"+962",  digits:{min:9, max:9}},
    // ── K ──────────────────────────────────────────────────
    {name:"Kazakhstan",                    code:"KZ", dial:"+7",    digits:{min:10,max:10}},
    {name:"Kenya",                         code:"KE", dial:"+254",  digits:{min:9, max:9}},
    {name:"Kiribati",                      code:"KI", dial:"+686",  digits:{min:5, max:5}},
    {name:"Kyrgyzstan",                    code:"KG", dial:"+996",  digits:{min:9, max:9}},
    // ── L ──────────────────────────────────────────────────
    {name:"Laos",                          code:"LA", dial:"+856",  digits:{min:8, max:9}},
    {name:"Latvia",                        code:"LV", dial:"+371",  digits:{min:8, max:8}},
    {name:"Lebanon",                       code:"LB", dial:"+961",  digits:{min:7, max:8}},
    {name:"Lesotho",                       code:"LS", dial:"+266",  digits:{min:8, max:8}},
    {name:"Liberia",                       code:"LR", dial:"+231",  digits:{min:7, max:8}},
    {name:"Libya",                         code:"LY", dial:"+218",  digits:{min:9, max:9}},
    {name:"Liechtenstein",                 code:"LI", dial:"+423",  digits:{min:7, max:7}},
    {name:"Lithuania",                     code:"LT", dial:"+370",  digits:{min:8, max:8}},
    {name:"Luxembourg",                    code:"LU", dial:"+352",  digits:{min:9, max:9}},
    // ── M ──────────────────────────────────────────────────
    {name:"Madagascar",                    code:"MG", dial:"+261",  digits:{min:9, max:9}},
    {name:"Malawi",                        code:"MW", dial:"+265",  digits:{min:9, max:9}},
    {name:"Maldives",                      code:"MV", dial:"+960",  digits:{min:7, max:7}},
    {name:"Mali",                          code:"ML", dial:"+223",  digits:{min:8, max:8}},
    {name:"Malta",                         code:"MT", dial:"+356",  digits:{min:8, max:8}},
    {name:"Marshall Islands",              code:"MH", dial:"+692",  digits:{min:7, max:7}},
    {name:"Mauritania",                    code:"MR", dial:"+222",  digits:{min:8, max:8}},
    {name:"Mauritius",                     code:"MU", dial:"+230",  digits:{min:7, max:8}},
    {name:"Mexico",                        code:"MX", dial:"+52",   digits:{min:10,max:10}},
    {name:"Micronesia",                    code:"FM", dial:"+691",  digits:{min:7, max:7}},
    {name:"Moldova",                       code:"MD", dial:"+373",  digits:{min:8, max:8}},
    {name:"Monaco",                        code:"MC", dial:"+377",  digits:{min:8, max:9}},
    {name:"Mongolia",                      code:"MN", dial:"+976",  digits:{min:8, max:8}},
    {name:"Montenegro",                    code:"ME", dial:"+382",  digits:{min:8, max:8}},
    {name:"Morocco",                       code:"MA", dial:"+212",  digits:{min:9, max:9}},
    {name:"Mozambique",                    code:"MZ", dial:"+258",  digits:{min:9, max:9}},
    {name:"Myanmar",                       code:"MM", dial:"+95",   digits:{min:8, max:10}},
    // ── N ──────────────────────────────────────────────────
    {name:"Namibia",                       code:"NA", dial:"+264",  digits:{min:9, max:9}},
    {name:"Nauru",                         code:"NR", dial:"+674",  digits:{min:7, max:7}},
    {name:"Netherlands",                   code:"NL", dial:"+31",   digits:{min:9, max:9}},
    {name:"New Zealand",                   code:"NZ", dial:"+64",   digits:{min:8, max:10}},
    {name:"Nicaragua",                     code:"NI", dial:"+505",  digits:{min:8, max:8}},
    {name:"Niger",                         code:"NE", dial:"+227",  digits:{min:8, max:8}},
    {name:"Nigeria",                       code:"NG", dial:"+234",  digits:{min:10,max:10}},
    {name:"North Korea",                   code:"KP", dial:"+850",  digits:{min:8, max:10}},
    {name:"North Macedonia",               code:"MK", dial:"+389",  digits:{min:8, max:8}},
    {name:"Norway",                        code:"NO", dial:"+47",   digits:{min:8, max:8}},
    // ── O ──────────────────────────────────────────────────
    {name:"Oman",                          code:"OM", dial:"+968",  digits:{min:8, max:8}},
    // ── P ──────────────────────────────────────────────────
    {name:"Pakistan",                      code:"PK", dial:"+92",   digits:{min:10,max:10}},
    {name:"Palau",                         code:"PW", dial:"+680",  digits:{min:7, max:7}},
    {name:"Palestine",                     code:"PS", dial:"+970",  digits:{min:9, max:9}},
    {name:"Panama",                        code:"PA", dial:"+507",  digits:{min:8, max:8}},
    {name:"Papua New Guinea",              code:"PG", dial:"+675",  digits:{min:8, max:8}},
    {name:"Paraguay",                      code:"PY", dial:"+595",  digits:{min:9, max:9}},
    {name:"Peru",                          code:"PE", dial:"+51",   digits:{min:9, max:9}},
    {name:"Philippines",                   code:"PH", dial:"+63",   digits:{min:10,max:10}},
    {name:"Poland",                        code:"PL", dial:"+48",   digits:{min:9, max:9}},
    {name:"Portugal",                      code:"PT", dial:"+351",  digits:{min:9, max:9}},
    // ── R ──────────────────────────────────────────────────
    {name:"Romania",                       code:"RO", dial:"+40",   digits:{min:9, max:9}},
    {name:"Russia",                        code:"RU", dial:"+7",    digits:{min:10,max:10}},
    {name:"Rwanda",                        code:"RW", dial:"+250",  digits:{min:9, max:9}},
    // ── S ──────────────────────────────────────────────────
    {name:"Saint Kitts and Nevis",         code:"KN", dial:"+1869", digits:{min:7, max:7}},
    {name:"Saint Lucia",                   code:"LC", dial:"+1758", digits:{min:7, max:7}},
    {name:"Saint Vincent and Grenadines",  code:"VC", dial:"+1784", digits:{min:7, max:7}},
    {name:"Samoa",                         code:"WS", dial:"+685",  digits:{min:5, max:7}},
    {name:"San Marino",                    code:"SM", dial:"+378",  digits:{min:8, max:10}},
    {name:"São Tomé and Príncipe",         code:"ST", dial:"+239",  digits:{min:7, max:7}},
    {name:"Senegal",                       code:"SN", dial:"+221",  digits:{min:9, max:9}},
    {name:"Serbia",                        code:"RS", dial:"+381",  digits:{min:8, max:9}},
    {name:"Seychelles",                    code:"SC", dial:"+248",  digits:{min:7, max:7}},
    {name:"Sierra Leone",                  code:"SL", dial:"+232",  digits:{min:8, max:8}},
    {name:"Slovakia",                      code:"SK", dial:"+421",  digits:{min:9, max:9}},
    {name:"Slovenia",                      code:"SI", dial:"+386",  digits:{min:8, max:8}},
    {name:"Solomon Islands",               code:"SB", dial:"+677",  digits:{min:7, max:7}},
    {name:"Somalia",                       code:"SO", dial:"+252",  digits:{min:7, max:8}},
    {name:"South Africa",                  code:"ZA", dial:"+27",   digits:{min:9, max:9}},
    {name:"South Korea",                   code:"KR", dial:"+82",   digits:{min:9, max:10}},
    {name:"South Sudan",                   code:"SS", dial:"+211",  digits:{min:9, max:9}},
    {name:"Spain",                         code:"ES", dial:"+34",   digits:{min:9, max:9}},
    {name:"Sudan",                         code:"SD", dial:"+249",  digits:{min:9, max:9}},
    {name:"Suriname",                      code:"SR", dial:"+597",  digits:{min:7, max:7}},
    {name:"Sweden",                        code:"SE", dial:"+46",   digits:{min:9, max:9}},
    {name:"Switzerland",                   code:"CH", dial:"+41",   digits:{min:9, max:9}},
    {name:"Syria",                         code:"SY", dial:"+963",  digits:{min:9, max:9}},
    // ── T ──────────────────────────────────────────────────
    {name:"Taiwan",                        code:"TW", dial:"+886",  digits:{min:9, max:9}},
    {name:"Tajikistan",                    code:"TJ", dial:"+992",  digits:{min:9, max:9}},
    {name:"Tanzania",                      code:"TZ", dial:"+255",  digits:{min:9, max:9}},
    {name:"Thailand",                      code:"TH", dial:"+66",   digits:{min:9, max:9}},
    {name:"Timor-Leste",                   code:"TL", dial:"+670",  digits:{min:8, max:8}},
    {name:"Togo",                          code:"TG", dial:"+228",  digits:{min:8, max:8}},
    {name:"Tonga",                         code:"TO", dial:"+676",  digits:{min:5, max:7}},
    {name:"Trinidad and Tobago",           code:"TT", dial:"+1868", digits:{min:7, max:7}},
    {name:"Tunisia",                       code:"TN", dial:"+216",  digits:{min:8, max:8}},
    {name:"Turkey",                        code:"TR", dial:"+90",   digits:{min:10,max:10}},
    {name:"Turkmenistan",                  code:"TM", dial:"+993",  digits:{min:8, max:8}},
    {name:"Tuvalu",                        code:"TV", dial:"+688",  digits:{min:5, max:6}},
    // ── U ──────────────────────────────────────────────────
    {name:"Uganda",                        code:"UG", dial:"+256",  digits:{min:9, max:9}},
    {name:"Ukraine",                       code:"UA", dial:"+380",  digits:{min:9, max:9}},
    {name:"Uruguay",                       code:"UY", dial:"+598",  digits:{min:8, max:9}},
    {name:"Uzbekistan",                    code:"UZ", dial:"+998",  digits:{min:9, max:9}},
    // ── V ──────────────────────────────────────────────────
    {name:"Vanuatu",                       code:"VU", dial:"+678",  digits:{min:7, max:7}},
    {name:"Venezuela",                     code:"VE", dial:"+58",   digits:{min:10,max:10}},
    {name:"Vietnam",                       code:"VN", dial:"+84",   digits:{min:9, max:10}},
    // ── Y ──────────────────────────────────────────────────
    {name:"Yemen",                         code:"YE", dial:"+967",  digits:{min:9, max:9}},
    // ── Z ──────────────────────────────────────────────────
    {name:"Zambia",                        code:"ZM", dial:"+260",  digits:{min:9, max:9}},
    {name:"Zimbabwe",                      code:"ZW", dial:"+263",  digits:{min:9, max:9}},
    // ── Other ──────────────────────────────────────────────
    {name:"Other",                         code:"XX", dial:"+",     digits:{min:5, max:15}},
];

/* ════════════════════════════════════════
   PHONE HINT SYSTEM — fully self-contained
   Each country select onchange calls:
   onPhoneCountryChange(selectEl, dialId, hintId)
════════════════════════════════════════ */

/* Returns a hint string for a given dial code value */
function getPhoneDigitHint(dialCode) {
    if (!dialCode || dialCode === "+") return "ⓘ Enter 7–15 digits";
    // Exact match first
    let c = COUNTRIES.find(x => x.dial === dialCode);
    // Fallback: longest prefix (e.g. "+1" matches "+1268" — prefer longer)
    if (!c) {
        const sorted = [...COUNTRIES].sort((a,b) => b.dial.length - a.dial.length);
        c = sorted.find(x => x.dial !== "+" && dialCode.startsWith(x.dial));
    }
    if (!c || !c.digits) return "ⓘ Enter 7–15 digits";
    const {min, max} = c.digits;
    if (min === max) return `ⓘ Enter exactly ${min} digits for ${c.name}`;
    return `ⓘ Enter ${min}–${max} digits for ${c.name}`;
}

/* Called directly by onchange on each phone country <select> */
function onPhoneCountryChange(selectEl, dialId, hintId) {
    if (!selectEl) return;
    const dialVal = selectEl.value || "+91";
    // Update dial tag
    const dialEl = document.getElementById(dialId);
    if (dialEl) dialEl.textContent = dialVal;
    // Update hint span
    const hintEl = document.getElementById(hintId);
    if (hintEl) {
        hintEl.textContent = getPhoneDigitHint(dialVal);
        hintEl.style.display = "block";
    }
}

/* Populate a country <select> and trigger initial hint */
function populateCountrySelect(selectId, dialId, hintId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    COUNTRIES.forEach(c => {
        const o = document.createElement("option");
        o.value = c.dial;
        o.textContent = `${c.name} (${c.dial})`;
        if (c.code === "IN") o.selected = true;
        sel.appendChild(o);
    });
    // Store ids for the onchange handler
    sel.dataset.dialId = dialId || "";
    sel.dataset.hintId = hintId || "";
    // Fire initial update
    onPhoneCountryChange(sel, dialId, hintId);
}

/* Legacy alias — kept for any remaining inline onchange="updatePhoneDialCode(...)" calls */
function updatePhoneDialCode(selectId, dialId, hintId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const rDial = dialId || sel.dataset.dialId;
    const rHint = hintId || sel.dataset.hintId;
    onPhoneCountryChange(sel, rDial, rHint);
}

/* Country-specific phone digit validation */
function validatePhoneDigitsByDial(numValue, dialCode) {
    let c = COUNTRIES.find(x => x.dial === dialCode);
    if (!c) {
        const sorted = [...COUNTRIES].sort((a,b) => b.dial.length - a.dial.length);
        c = sorted.find(x => x.dial !== "+" && dialCode.startsWith(x.dial));
    }
    let min = 7, max = 15;
    if (c?.digits) { min = c.digits.min; max = c.digits.max; }
    const regex = new RegExp(`^\\d{${min},${max}}$`);
    if (!regex.test(numValue)) {
        const hint = min === max ? `exactly ${min}` : `${min}–${max}`;
        return { valid: false, msg: `⚠ Enter ${hint} digits for ${c?.name || "this country"}.` };
    }
    return { valid: true };
}

const STATE_PINCODE_PREFIXES = {
    "Andhra Pradesh":["50","51","52","53"],"Arunachal Pradesh":["79"],"Assam":["78"],
    "Bihar":["80","81","82","83","84","85"],"Chhattisgarh":["49"],"Goa":["40"],
    "Gujarat":["36","37","38","39"],"Haryana":["12","13"],"Himachal Pradesh":["17"],
    "Jharkhand":["81","82","83","84","85"],"Karnataka":["56","57","58","59"],
    "Kerala":["67","68","69"],"Madhya Pradesh":["45","46","47","48"],
    "Maharashtra":["40","41","42","43","44"],"Manipur":["79"],"Meghalaya":["79"],
    "Mizoram":["79"],"Nagaland":["79"],"Odisha":["75","76","77"],
    "Punjab":["14","15","16"],"Rajasthan":["30","31","32","33","34"],"Sikkim":["73"],
    "Tamil Nadu":["60","61","62","63","64"],"Telangana":["50"],
    "Tripura":["79"],"Uttar Pradesh":["20","21","22","23","24","25","26","27","28"],
    "Uttarakhand":["24","25","26"],"West Bengal":["70","71","72","73","74"],
    "Andaman and Nicobar Islands":["74"],"Chandigarh":["16"],
    "Dadra and Nagar Haveli and Daman and Diu":["36","39"],"Delhi":["11"],
    "Jammu and Kashmir":["18","19"],"Ladakh":["19"],"Lakshadweep":["68"],
    "Puducherry":["60","53"],
};

const INDIA_STATES = {
    "Andhra Pradesh":["Visakhapatnam","Vijayawada","Guntur","Nellore","Kurnool","Tirupati","Kakinada","Rajahmundry","Eluru","Anantapur","Kadapa","Srikakulam","Vizianagaram"],
    "Arunachal Pradesh":["Itanagar","Tawang","Ziro","Pasighat","Bomdila","Naharlagun"],
    "Assam":["Guwahati","Dibrugarh","Jorhat","Silchar","Tezpur","Nagaon","Tinsukia","Kamrup","Barpeta","Cachar"],
    "Bihar":["Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga","Purnia","Arrah","Begusarai","Katihar","Munger"],
    "Chhattisgarh":["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Ambikapur"],
    "Goa":["Panaji","Margao","Vasco da Gama","Mapusa","Ponda","Bicholim","Calangute"],
    "Gujarat":["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar","Anand","Bharuch","Nadiad","Morbi","Mehsana"],
    "Haryana":["Faridabad","Gurgaon","Panipat","Ambala","Yamunanagar","Rohtak","Hisar","Karnal","Sonipat","Panchkula"],
    "Himachal Pradesh":["Shimla","Dharamsala","Manali","Solan","Kullu","Mandi","Palampur","Bilaspur"],
    "Jharkhand":["Ranchi","Jamshedpur","Dhanbad","Bokaro","Deoghar","Hazaribagh","Giridih","Ramgarh"],
    "Karnataka":["Bengaluru","Mysuru","Mangaluru","Hubballi","Dharwad","Belagavi","Kalaburagi","Davanagere","Shivamogga","Tumakuru","Udupi","Hassan","Vijayapura"],
    "Kerala":["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Kannur","Alappuzha","Palakkad","Malappuram","Idukki","Kottayam","Kasaragod","Wayanad","Pathanamthitta"],
    "Madhya Pradesh":["Bhopal","Indore","Gwalior","Jabalpur","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa","Murwara","Singrauli","Burhanpur"],
    "Maharashtra":["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Solapur","Thane","Kolhapur","Amravati","Nanded","Sangli","Latur","Jalgaon","Raigad"],
    "Manipur":["Imphal","Churachandpur","Kakching","Thoubal","Bishnupur","Senapati"],
    "Meghalaya":["Shillong","Tura","Jowai","Nongstoin","Baghmara"],
    "Mizoram":["Aizawl","Lunglei","Champhai","Serchhip","Kolasib"],
    "Nagaland":["Kohima","Dimapur","Mokokchung","Tuensang","Wokha","Zunheboto"],
    "Odisha":["Bhubaneswar","Cuttack","Rourkela","Brahmapur","Sambalpur","Puri","Balasore","Bhadrak","Baripada","Jharsuguda","Angul"],
    "Punjab":["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali","Hoshiarpur","Pathankot","Gurdaspur","Ferozepur"],
    "Rajasthan":["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Bhilwara","Alwar","Sikar","Sri Ganganagar","Tonk","Churu"],
    "Sikkim":["Gangtok","Namchi","Mangan","Gyalshing"],
    "Tamil Nadu":["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Vellore","Erode","Tiruppur","Dindigul","Thanjavur","Ranipet","Kancheepuram","Cuddalore","Nagercoil","Kumbakonam","Hosur","Sivakasi","Pudukkottai","Namakkal","Virudhunagar","Thoothukudi","Perambalur","Ariyalur","Krishnagiri","Dharmapuri"],
    "Telangana":["Hyderabad","Warangal","Nizamabad","Khammam","Karimnagar","Ramagundam","Mahbubnagar","Nalgonda","Adilabad","Suryapet"],
    "Tripura":["Agartala","Dharmanagar","Udaipur","Kailashahar","Belonia"],
    "Uttar Pradesh":["Lucknow","Kanpur","Ghaziabad","Agra","Meerut","Varanasi","Allahabad","Bareilly","Aligarh","Moradabad","Saharanpur","Gorakhpur","Noida","Firozabad","Mathura","Muzaffarnagar","Shahjahanpur"],
    "Uttarakhand":["Dehradun","Haridwar","Roorkee","Haldwani","Rudrapur","Kashipur","Rishikesh","Nainital","Almora","Mussoorie"],
    "West Bengal":["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda","Baharampur","Haldia","Kharagpur","Raiganj"],
    "Andaman and Nicobar Islands":["Port Blair","Diglipur","Car Nicobar"],
    "Chandigarh":["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu":["Daman","Diu","Silvassa"],
    "Delhi":["New Delhi","North Delhi","South Delhi","East Delhi","West Delhi","Dwarka","Rohini"],
    "Jammu and Kashmir":["Srinagar","Jammu","Anantnag","Baramulla","Sopore","Kathua","Udhampur","Poonch"],
    "Ladakh":["Leh","Kargil"],
    "Lakshadweep":["Kavaratti","Agatti","Minicoy"],
    "Puducherry":["Puducherry","Karaikal","Mahé","Yanam"],
};


/* ════════════════════════════════════════════════════════════
   4. INIT
════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async function () {
    populateCountrySelect("phone_country", "phone_dial_code", "phone_digits_hint");
    populateStateSelect();
    await loadMasterData();
    await loadSevas();
    await loadHinduCalendarData();
    markFieldGreen("payment_method");
    await _checkSetupStatus();

    // ── Restore session on page refresh ──
    const sess = _loadSession();
    if (sess) {
        if (sess.adminLoggedIn) {
            _adminLoggedIn = true;
            _adminUsername = sess.adminUsername || "";
            _userIsAdmin   = sess.userIsAdmin   || false;
            _userRoleName  = sess.userRoleName  || "";
        }
        _updateAdminHeaderUI();
        _donorId               = sess.donorId               || null;
        _donorPhone            = sess.donorPhone             || "";
        _donorMode             = sess.donorMode              || "new";
        _editingSevaDonationId = sess.editingSevaDonationId  || null;
        _phoneVerified         = sess.phoneVerified          || false;
        _emailVerified         = sess.emailVerified          || false;
        _lastBooking           = sess.lastBooking            || null;
        const step = sess.step || 1;
        // Re-fetch donor details to repopulate form fields
        if (_donorId && _donorPhone && step >= 2) {
            try {
                const r = await fetch(`${API_BASE}/check-phone?whatsapp_number=${encodeURIComponent(_donorPhone)}`);
                const d = await r.json();
                if (d.exists && d.donor) {
                    prefillDonorForm(d.donor);
                    const banner = document.getElementById("donor-found-banner");
                    if (banner) banner.style.display = "block";
                }
            } catch(e) { console.warn("Session restore: donor refetch failed", e); }
        }
        if (step === 5 && _lastBooking) { goToStep(5); }
        else { goToStep(step); }
    } else {
        _updateAdminHeaderUI();
        goToStep(1);
    }
});

function populateStateSelect() {
    const sel = document.getElementById("address_state");
    if (!sel) return;
    sel.innerHTML = `<option value="" disabled selected>— Select State —</option>`;
    Object.keys(INDIA_STATES).sort().forEach(state => {
        const o = document.createElement("option");
        o.value = state; o.textContent = state;
        sel.appendChild(o);
    });
}

async function loadMasterData() {
    try {
        const [z, b, g] = await Promise.all([
            fetch(`${API_BASE}/zodiac`).then(r => r.json()),
            fetch(`${API_BASE}/birthstar`).then(r => r.json()),
            fetch(`${API_BASE}/gotra`).then(r => r.json()),
        ]);
        _zodiacList = z; _birthstarList = b; _gotraList = g;
        populateSelect("sp_zodiac_id",    z, "id", "zodiac_name",    "Select Zodiac");
        populateSelect("sp_birthstar_id", b, "id", "birthstar_name", "Select Birth Star");
        populateGotraSelect("sp_gotra_id", g);
    } catch (e) { console.error("Master data load error:", e); }
}

async function loadSevas() {
    try {
        const sevas = await fetch(`${API_BASE}/sevas`).then(r => r.json());
        _sevaList = sevas;
        const sel = document.getElementById("seva_id");
        if (!sel) return;
        sel.innerHTML = `<option value="" disabled selected>— Select Seva —</option>`;
        sevas.forEach(s => {
            const o = document.createElement("option");
            o.value = s.id; o.textContent = s.seva_name;
            o.dataset.desc     = s.seva_description || "";
            o.dataset.one_time = s.default_amount_one_time;
            o.dataset.regular  = s.default_amount_regular;
            sel.appendChild(o);
        });
    } catch (e) { console.error("Seva load error:", e); }
}


/* ════════════════════════════════════════════════════════════
   5. CASCADING ZODIAC ↔ BIRTHSTAR
════════════════════════════════════════════════════════════ */
function onZodiacChange(zodiacSelectId, birthstarSelectId, selectedBirthstarId) {
    const zodiacId    = parseInt(document.getElementById(zodiacSelectId)?.value) || null;
    const birthstarEl = document.getElementById(birthstarSelectId);
    if (!birthstarEl) return;
    if (!zodiacId) {
        populateSelect(birthstarSelectId, _birthstarList, "id", "birthstar_name", "Select Birth Star");
        return;
    }
    const filtered = _birthstarList.filter(b => b.zodiac_id === zodiacId);
    birthstarEl.innerHTML = `<option value="" disabled ${!selectedBirthstarId?"selected":""}>— Select Birth Star —</option>`;
    filtered.forEach(b => {
        const o = document.createElement("option");
        o.value = b.id; o.textContent = b.birthstar_name;
        if (selectedBirthstarId && b.id == selectedBirthstarId) o.selected = true;
        birthstarEl.appendChild(o);
    });
    if (filtered.length === 0)
        birthstarEl.innerHTML = `<option value="" disabled selected>— No stars for this Zodiac —</option>`;
}

function onBirthstarChange(birthstarSelectId, zodiacSelectId) {
    const birthstarEl = document.getElementById(birthstarSelectId);
    const zodiacEl    = document.getElementById(zodiacSelectId);
    if (!birthstarEl || !zodiacEl) return;
    const birthstarId = parseInt(birthstarEl.value) || null;
    if (!birthstarId) return;
    const star = _birthstarList.find(b => b.id === birthstarId);
    if (!star) return;
    zodiacEl.value = String(star.zodiac_id);
    const filtered = _birthstarList.filter(b => b.zodiac_id === star.zodiac_id);
    birthstarEl.innerHTML = `<option value="" disabled>— Select Birth Star —</option>`;
    filtered.forEach(b => {
        const o = document.createElement("option");
        o.value = String(b.id); o.textContent = b.birthstar_name;
        if (b.id === birthstarId) o.selected = true;
        birthstarEl.appendChild(o);
    });
}

function onSevaPersonZodiacChange()    { onZodiacChange("sp_zodiac_id","sp_birthstar_id",null); clearFieldError("sp_zodiac_id","err_sp_zodiac_id"); clearFieldError("sp_birthstar_id","err_sp_birthstar_id"); }
function onSevaPersonBirthstarChange() { onBirthstarChange("sp_birthstar_id","sp_zodiac_id"); clearFieldError("sp_birthstar_id","err_sp_birthstar_id"); clearFieldError("sp_zodiac_id","err_sp_zodiac_id"); }
function onRelationZodiacChange(prefix,idx)    { onZodiacChange(`${prefix}zodiac_${idx}`,`${prefix}birthstar_${idx}`,null); }
function onRelationBirthstarChange(prefix,idx) { onBirthstarChange(`${prefix}birthstar_${idx}`,`${prefix}zodiac_${idx}`); }


/* ════════════════════════════════════════════════════════════
   6. STEP NAVIGATION
════════════════════════════════════════════════════════════ */
function goToStep(n) {
    document.querySelectorAll(".step-panel").forEach(p => p.classList.remove("active"));
    const panel = document.getElementById(`step-${n}`);
    if (panel) panel.classList.add("active");
    document.querySelectorAll(".p-step").forEach((s, i) => {
        s.classList.remove("active","done");
        if (n === 5) { s.classList.add("done"); }
        else {
            if (i + 1 < n)  s.classList.add("done");
            if (i + 1 === n) s.classList.add("active");
        }
    });
    _currentStep = n;
    _saveSession();  // persist step for page refresh
    if (n === 2) { setTimeout(_lazyInitMap, 80); } // init map when div is visible
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (n === 5) _renderSuccessStep();
}

function _renderSuccessStep() {
    const b = _lastBooking;
    if (!b) return;
    const el = document.getElementById("success-booking-details");
    if (!el) return;

    // Build the image section: show image+regen-btn if ready, spinner if pending, nothing if no donationId
    let imgHtml = "";
    if (b.seva_image) {
        imgHtml = _sevaImgWithRegenBtn(b.seva_image, b.seva_name, b.donationId);
    } else if (b.donationId && !b.isEdit) {
        // Image is being generated in background — show animated spinner
        imgHtml = `
        <div id="seva-img-placeholder" style="margin:14px 0 8px;text-align:center;">
            <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">🎨 Your Seva — AI Blessing Card</div>
            <div style="height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;
                        background:linear-gradient(135deg,#fdf6ec 0%,#fff9f0 100%);
                        border-radius:10px;border:2px dashed #e0c870;gap:8px;">
                <div style="font-size:28px;animation:spinLamp 1.8s linear infinite;">🪔</div>
                <div style="font-size:12px;color:#8B5E3C;font-weight:500;">Generating AI Blessing Card…</div>
                <div style="font-size:10px;color:#bbb;">This may take up to 30 seconds</div>
            </div>
        </div>`;
        // Start polling for the image (if not already polling)
        _startSevaImagePolling(b.donationId);
    }

    el.innerHTML = `
        ${imgHtml}
        <div class="success-detail-row"><span class="sdr-label">🧾 Receipt No</span><span class="sdr-value receipt-highlight">${b.receipt_no}</span></div>
        <div class="success-detail-row"><span class="sdr-label">🙏 Seva</span><span class="sdr-value">${b.seva_name}</span></div>
        <div class="success-detail-row"><span class="sdr-label">🔁 Type</span><span class="sdr-value">${b.seva_type}</span></div>
        <div class="success-detail-row"><span class="sdr-label">💰 Amount</span><span class="sdr-value">₹${parseFloat(b.amount).toFixed(2)}</span></div>
        <div class="success-detail-row"><span class="sdr-label">🧘 Seva Person</span><span class="sdr-value">${b.person_name}</span></div>
    `;
    const titleEl = document.getElementById("success-title");
    if (titleEl) titleEl.textContent = b.isEdit ? "Seva Booking Updated! 🙏" : "Seva Booked Successfully! 🙏";
    const subEl = document.getElementById("success-subtitle");
    if (subEl) subEl.textContent = b.isEdit
        ? "Your seva booking has been updated. May Lord Jagannath bless you."
        : "Your seva has been recorded. May Lord Jagannath bless you and your family.";
}

// ── Seva Image Polling ─────────────────────────────────────────────────────
// Polls GET /seva-donations/{id}/seva-image-status every 4 s until the
// background AI generation task completes, then swaps the spinner for the image.
let _sevaImagePollTimer = null;

function _startSevaImagePolling(donationId) {
    if (_sevaImagePollTimer) return; // already polling
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // FIX #2: 25 × 4 s = 100 s — covers backend max (2 × 45 s = 90 s)

    _sevaImagePollTimer = setInterval(async () => {
        attempts++;
        try {
            const res  = await fetch(`${API_BASE}/seva-donations/${donationId}/seva-image-status`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.ready && data.seva_image) {
                // Image is ready — save it, clear the timer, update the UI
                clearInterval(_sevaImagePollTimer);
                _sevaImagePollTimer = null;
                _lastBooking.seva_image = data.seva_image;

                // Replace spinner with the actual image + regenerate button
                const placeholder = document.getElementById("seva-img-placeholder");
                if (placeholder) {
                    placeholder.outerHTML = _sevaImgWithRegenBtn(
                        data.seva_image,
                        _lastBooking.seva_name || 'Seva',
                        _lastBooking.donationId
                    );
                } else {
                    // Step 5 might have been re-rendered; do a full re-render
                    const panel = document.getElementById("step-5");
                    if (panel && panel.classList.contains("active")) _renderSuccessStep();
                }
                console.log(`[seva-image] ✅ Polling success — image stored for donation ${donationId}`);
            }
        } catch (e) {
            console.warn("[seva-image] Poll error:", e.message);
        }
        if (attempts >= MAX_ATTEMPTS) {
            clearInterval(_sevaImagePollTimer);
            _sevaImagePollTimer = null;
            // Replace spinner with a gentle failure message
            const placeholder = document.getElementById("seva-img-placeholder");
            if (placeholder) {
                placeholder.innerHTML = `<div style="font-size:11px;color:#bbb;padding:10px 0;text-align:center;">
                    🎨 Blessing card will appear in your donation history once ready.</div>`;
            }
        }
    }, 4000);
}

// ── Helper: image + "Generate a new image" button HTML ────────────────────
// Used everywhere an AI seva image is displayed so the user can regenerate
// unlimited times until they are satisfied.
function _sevaImgWithRegenBtn(src, sevaName, donationId) {
    return `
        <div id="seva-img-wrap-${donationId}" style="text-align:center;margin:14px 0 8px;">
            <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">🎨 Your Seva — AI Blessing Card</div>
            <img src="${src}" alt="${sevaName || 'Seva'}"
                 style="width:100%;max-width:460px;border-radius:10px;border:2px solid #e0c870;
                        box-shadow:0 4px 16px rgba(139,94,60,.2);animation:fadeInSevaImg .6s ease;"
                 onerror="this.style.display='none'">
            <div style="margin-top:10px;">
                <button onclick="regenerateSevaImage(${donationId})"
                    title="Not satisfied? Get a completely new AI-generated image"
                    style="font-size:12px;padding:7px 20px;border-radius:20px;
                           border:1.5px dashed #e0c870;background:#FFFBF0;color:#8B5E3C;
                           cursor:pointer;font-family:inherit;font-weight:600;
                           transition:background .2s,box-shadow .2s;"
                    onmouseover="this.style.background='#FDF0D5';this.style.boxShadow='0 2px 8px rgba(139,94,60,.15)'"
                    onmouseout="this.style.background='#FFFBF0';this.style.boxShadow='none'">
                    🔄 Not satisfied? Generate a new image
                </button>
            </div>
        </div>`;
}

// ── Regenerate: POST /regenerate-seva-image (unlimited retries) ────────────
// Skips the cache entirely — Gemini always produces a fresh image with a new
// random seed. The button stays available after every regeneration so the
// user can click it as many times as needed.
window.regenerateSevaImage = async function(donationId) {
    // Find the container: success-step wrapper OR history wrapper
    let wrap = document.getElementById(`seva-img-wrap-${donationId}`)
            || document.getElementById('seva-img-placeholder');
    if (!wrap) return;

    const sevaName = (_lastBooking && _lastBooking.seva_name) || 'Seva';

    // Show spinner while Gemini generates a new image
    wrap.innerHTML = `
        <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">🎨 Your Seva — AI Blessing Card</div>
        <div style="height:130px;display:flex;flex-direction:column;align-items:center;
                    justify-content:center;background:linear-gradient(135deg,#fdf6ec,#fff9f0);
                    border-radius:10px;border:2px dashed #e0c870;gap:8px;">
            <div style="font-size:28px;animation:spinLamp 1.8s linear infinite;">🪔</div>
            <div style="font-size:12px;color:#8B5E3C;font-weight:500;">Generating a new AI Blessing Card…</div>
            <div style="font-size:10px;color:#bbb;">Using Gemini — may take up to 30 s</div>
        </div>`;
    wrap.id = `seva-img-wrap-${donationId}`; // keep ID stable

    try {
        const res  = await fetch(`${API_BASE}/seva-donations/${donationId}/regenerate-seva-image`,
                                 { method: 'POST' });
        const data = await res.json();

        if (data && data.seva_image) {
            // Update cached state so a page re-render keeps the new image
            if (_lastBooking) _lastBooking.seva_image = data.seva_image;
            // Render image + button so user can regenerate again
            wrap.outerHTML = _sevaImgWithRegenBtn(data.seva_image, sevaName, donationId);
            console.log(`[seva-image] ✅ REGENERATE SUCCESS  donation=${donationId}`);
        } else {
            // Backend returned success:false — show error + retry button
            wrap.innerHTML = `
                <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">🎨 Your Seva — AI Blessing Card</div>
                <div style="font-size:11px;color:#c0392b;padding:10px;text-align:center;
                            background:#fff5f5;border-radius:8px;border:1px solid #fcc;">
                    ❌ ${data && data.message ? data.message : 'Image generation failed — please try again.'}
                </div>
                <div style="margin-top:8px;text-align:center;">
                    <button onclick="regenerateSevaImage(${donationId})"
                        style="font-size:12px;padding:7px 20px;border-radius:20px;border:1.5px dashed #e0c870;
                               background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                        🔄 Try again
                    </button>
                </div>`;
            console.warn(`[seva-image] REGENERATE FAILED  donation=${donationId}:`, data && data.message);
        }
    } catch (err) {
        wrap.innerHTML = `
            <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">🎨 Your Seva — AI Blessing Card</div>
            <div style="font-size:11px;color:#c0392b;padding:10px;text-align:center;
                        background:#fff5f5;border-radius:8px;border:1px solid #fcc;">
                ❌ Network error — please check your connection.
            </div>
            <div style="margin-top:8px;text-align:center;">
                <button onclick="regenerateSevaImage(${donationId})"
                    style="font-size:12px;padding:7px 20px;border-radius:20px;border:1.5px dashed #e0c870;
                           background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                    🔄 Try again
                </button>
            </div>`;
        console.warn(`[seva-image] regenerate network error  donation=${donationId}:`, err.message || err);
    }
};

// ── FIX #3: On-demand image generation for existing seva donations ─────────
// Called from the "Generate Blessing Card" button in history & admin views.
// Replaces the button with a spinner, POSTs to generate-seva-image, then
// swaps in the real image (or a gentle error note on failure).
async function generateHistorySevaImage(donationId, btn) {
    const wrap = document.getElementById(`hist-img-wrap-${donationId}`);
    if (!wrap) return;

    // Show spinner while waiting
    wrap.innerHTML = `
        <div style="height:70px;display:flex;align-items:center;justify-content:center;gap:8px;
                    background:linear-gradient(135deg,#fdf6ec,#fff9f0);border-radius:8px;
                    border:2px dashed #e0c870;">
            <span style="font-size:22px;animation:spinLamp 1.8s linear infinite;">🪔</span>
            <span style="font-size:11px;color:#8B5E3C;font-weight:500;">Generating… (up to 30 s)</span>
        </div>`;

    try {
        const res = await fetch(`${API_BASE}/seva-donations/${donationId}/generate-seva-image`, { method: "POST" });
        const data = await res.json();

        if (data && data.seva_image) {
            // Success — swap in the real image with fade-in + a regenerate button
            wrap.innerHTML = `
                <img src="${data.seva_image}" alt="Seva Blessing Card"
                     style="width:100%;border-radius:8px;margin-bottom:6px;max-height:160px;object-fit:cover;
                            border:1px solid #e0c870;animation:fadeInSevaImg .5s ease;"
                     loading="lazy" onerror="this.style.display='none'">
                <div style="text-align:center;">
                    <button onclick="regenerateHistorySevaImage(${donationId})"
                        style="font-size:11px;padding:5px 14px;border-radius:20px;border:1.5px dashed #e0c870;
                               background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                        🔄 Generate a new image
                    </button>
                </div>`;
        } else {
            // Backend returned success=false
            wrap.innerHTML = `<div style="font-size:11px;color:#aaa;padding:6px 0;text-align:center;">
                🎨 Could not generate image — ${data && data.message ? data.message : "please try again later"}.</div>
                <div style="text-align:center;margin-top:4px;">
                    <button onclick="generateHistorySevaImage(${donationId},this)"
                        style="font-size:11px;padding:4px 12px;border-radius:20px;border:1.5px dashed #e0c870;
                               background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                        🔄 Retry
                    </button>
                </div>`;
        }
    } catch (err) {
        wrap.innerHTML = `<div style="font-size:11px;color:#aaa;padding:6px 0;text-align:center;">
            🎨 Network error — please try again.</div>
            <div style="text-align:center;margin-top:4px;">
                <button onclick="generateHistorySevaImage(${donationId},this)"
                    style="font-size:11px;padding:4px 12px;border-radius:20px;border:1.5px dashed #e0c870;
                           background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;margin-top:4px;">
                    🔄 Retry
                </button>
            </div>`;
        console.warn(`[seva-image] History generate failed for donation ${donationId}:`, err.message || err);
    }
}


// ── Regenerate from history / admin view ──────────────────────────────────
// Same as regenerateSevaImage() but targets the hist-img-wrap container
// used in the Previous Seva Bookings / admin donation history panels.
window.regenerateHistorySevaImage = async function(donationId) {
    const wrap = document.getElementById(`hist-img-wrap-${donationId}`);
    if (!wrap) return;

    wrap.innerHTML = `
        <div style="height:70px;display:flex;align-items:center;justify-content:center;gap:8px;
                    background:linear-gradient(135deg,#fdf6ec,#fff9f0);border-radius:8px;
                    border:2px dashed #e0c870;">
            <span style="font-size:22px;animation:spinLamp 1.8s linear infinite;">🪔</span>
            <span style="font-size:11px;color:#8B5E3C;font-weight:500;">Generating a new image… (up to 30 s)</span>
        </div>`;

    try {
        const res  = await fetch(`${API_BASE}/seva-donations/${donationId}/regenerate-seva-image`,
                                 { method: 'POST' });
        const data = await res.json();

        if (data && data.seva_image) {
            wrap.innerHTML = `
                <img src="${data.seva_image}" alt="Seva Blessing Card"
                     style="width:100%;border-radius:8px;margin-bottom:6px;max-height:160px;object-fit:cover;
                            border:1px solid #e0c870;animation:fadeInSevaImg .5s ease;"
                     loading="lazy" onerror="this.style.display='none'">
                <div style="text-align:center;">
                    <button onclick="regenerateHistorySevaImage(${donationId})"
                        style="font-size:11px;padding:5px 14px;border-radius:20px;border:1.5px dashed #e0c870;
                               background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                        🔄 Generate a new image
                    </button>
                </div>`;
            console.log(`[seva-image] ✅ HISTORY REGENERATE SUCCESS  donation=${donationId}`);
        } else {
            wrap.innerHTML = `
                <div style="font-size:11px;color:#c0392b;padding:8px;text-align:center;
                            background:#fff5f5;border-radius:8px;border:1px solid #fcc;">
                    ❌ ${data && data.message ? data.message : 'Image generation failed — please try again.'}
                </div>
                <div style="text-align:center;margin-top:6px;">
                    <button onclick="regenerateHistorySevaImage(${donationId})"
                        style="font-size:11px;padding:5px 14px;border-radius:20px;border:1.5px dashed #e0c870;
                               background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                        🔄 Try again
                    </button>
                </div>`;
        }
    } catch (err) {
        wrap.innerHTML = `
            <div style="font-size:11px;color:#c0392b;padding:8px;text-align:center;
                        background:#fff5f5;border-radius:8px;border:1px solid #fcc;">
                ❌ Network error — please check your connection.
            </div>
            <div style="text-align:center;margin-top:6px;">
                <button onclick="regenerateHistorySevaImage(${donationId})"
                    style="font-size:11px;padding:5px 14px;border-radius:20px;border:1.5px dashed #e0c870;
                           background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                    🔄 Try again
                </button>
            </div>`;
        console.warn(`[seva-image] regenerateHistorySevaImage error  donation=${donationId}:`, err.message || err);
    }
};


function validatePhoneField() {
    const val  = (document.getElementById("phone_number")?.value || "").trim();
    const dial = (document.getElementById("phone_dial_code")?.textContent || "+91").trim();
    if (!val) { showError("phone_number","err_phone","⚠ Phone number is required."); return false; }
    const result = validatePhoneDigitsByDial(val, dial);
    if (!result.valid) { showError("phone_number","err_phone", result.msg); return false; }
    clearError("phone_number","err_phone");
    return true;
}

/* ── Smart Continue: check DB first, OTP only for new donors ── */
async function sendPhoneOtp() {
    const resultEl = document.getElementById("phone-result");
    const btn      = document.getElementById("btn-send-phone-otp");

    // ── Login gate: staff/admin must be logged in ──
    if (!_adminLoggedIn) {
        if (resultEl) resultEl.innerHTML =
            `<div style="background:#FFF3CD;border:1.5px solid #E8821A;border-radius:8px;
                         padding:10px 14px;font-size:13px;color:#5C3D2E;margin-top:6px;">
                🔐 <strong>Staff login required.</strong> Please
                <a href="#" onclick="openAdminModal();return false;"
                   style="color:#E8821A;font-weight:700;text-decoration:underline;">
                   login here
                </a> before verifying a donor's phone number.
             </div>`;
        openAdminModal();
        return;
    }

    // Clear any previous result message
    if (resultEl) resultEl.innerHTML = "";

    if (!validatePhoneField()) return;

    const dial = (document.getElementById("phone_dial_code")?.textContent || "+91").trim();
    const num  = (document.getElementById("phone_number")?.value || "").trim();
    const full = dial + num;

    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }

    try {
        // ── Step 1: Check if phone already exists in DB ──
        const checkRes  = await fetch(`${API_BASE}/check-phone?whatsapp_number=${encodeURIComponent(full)}`);
        const checkData = await checkRes.json();

        if (!checkRes.ok) {
            if (btn) { btn.disabled = false; btn.textContent = "Continue →"; }
            if (resultEl) resultEl.innerHTML =
                `<span style="color:#c62828;">⚠ Cannot reach server. Please try again.</span>`;
            return;
        }

        if (checkData.exists && checkData.donor) {
            // ── EXISTING DONOR → skip OTP, go directly to Step 2 ──
            _donorPhone    = full;
            _donorId       = checkData.donor.id;
            _phoneVerified = true;   // treat as verified since they're already registered

            // Show verified banner briefly
            document.getElementById("phone-entry-section").style.display    = "none";
            document.getElementById("phone-verified-section").style.display = "block";
            const verifiedBanner = document.getElementById("phone-verified-section");
            if (verifiedBanner) {
                verifiedBanner.innerHTML = `
                    <div class="result-success" role="status" style="margin-bottom:18px;">
                        ✅ Registered donor found! Loading your details…
                    </div>`;
            }

            prefillDonorForm(checkData.donor);
            const banner = document.getElementById("donor-found-banner");
            if (banner) banner.style.display = "none";

            // Small delay so user sees the "found" message, then show choice screen
            setTimeout(() => {
                _showDonorChoiceScreen(checkData.donor);
            }, 600);

        } else {
            // ── NEW DONOR → show Yes/No verify prompt ──
            if (btn) { btn.disabled = false; btn.textContent = "Continue →"; }
            // Lock phone input while deciding
            const phoneInput2 = document.getElementById("phone_number");
            if (phoneInput2) phoneInput2.readOnly = true;
            const countrySel2 = document.getElementById("phone_country");
            if (countrySel2) countrySel2.disabled = true;
            document.getElementById("phone-entry-section").style.display = "none";
            const vp = document.getElementById("phone-verify-prompt");
            if (vp) {
                const n = document.getElementById("pvp-number");
                if (n) n.textContent = full;
                vp.style.display = "block";
            }
            window._pvpPhone = full;
        }

    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = "Continue →"; }
        if (resultEl) resultEl.innerHTML =
            `<span style="color:#c62828;">⚠ Cannot reach server. (${e.message})</span>`;
    }
}

/* ── Called when user types in OTP box ── */
function onPhoneOtpInput() {
    const val = (document.getElementById("phone_otp_input")?.value || "").replace(/\D/g, "");
    setVal("phone_otp_input", val);
    const verifyBtn = document.getElementById("btn-verify-phone-otp");
    if (verifyBtn) verifyBtn.disabled = val.length !== 6;
    // Clear previous error on edit
    const errEl = document.getElementById("err_phone_otp");
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
}

/* ── Verify OTP entered by user ── */
async function verifyPhoneOtp() {
    const otp = (document.getElementById("phone_otp_input")?.value || "").trim();
    if (otp.length !== 6) {
        const errEl = document.getElementById("err_phone_otp");
        if (errEl) { errEl.textContent = "⚠ Enter the 6-digit OTP."; errEl.style.display = "block"; }
        return;
    }

    const dial = (document.getElementById("phone_dial_code")?.textContent || "+91").trim();
    const num  = (document.getElementById("phone_number")?.value || "").trim();
    const full = dial + num;

    const verifyBtn = document.getElementById("btn-verify-phone-otp");
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verifying…"; }
    _setPhoneOtpStatus("", "");

    try {
        const res  = await fetch(`${API_BASE}/phone/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone_number: full, otp }),
        });
        const data = await res.json();

        if (!res.ok) {
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify OTP"; }
            _setPhoneOtpStatus(`⚠ ${data.detail || "Incorrect OTP. Try again."}`, "error");
            const inp = document.getElementById("phone_otp_input");
            if (inp) inp.style.borderColor = "#c62828";
            return;
        }

        // ── OTP verified ──
        _phoneVerified = true;
        if (_phoneOtpResendTimer) { clearInterval(_phoneOtpResendTimer); _phoneOtpResendTimer = null; }
        document.getElementById("phone-otp-section").style.display      = "none";
        document.getElementById("phone-entry-section").style.display    = "none";
        document.getElementById("phone-verified-section").style.display = "block";

        // Auto-proceed: look up donor and go to Step 2
        await _proceedAfterPhoneVerified(full);

    } catch (e) {
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify OTP"; }
        _setPhoneOtpStatus(`⚠ Cannot reach server. (${e.message})`, "error");
    }
}

/* ── Resend OTP ── */
async function resendPhoneOtp() {
    if (_phoneOtpResendTimer) { clearInterval(_phoneOtpResendTimer); _phoneOtpResendTimer = null; }
    const resendBtn = document.getElementById("btn-resend-phone-otp");
    if (resendBtn) resendBtn.style.display = "none";
    _setPhoneOtpStatus("", "");
    setVal("phone_otp_input", "");
    const verifyBtn = document.getElementById("btn-verify-phone-otp");
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verify OTP"; }

    const dial = (document.getElementById("phone_dial_code")?.textContent || "+91").trim();
    const num  = (document.getElementById("phone_number")?.value || "").trim();
    const full = dial + num;

    try {
        const res  = await fetch(`${API_BASE}/phone/send-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone_number: full }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            _setPhoneOtpStatus(`✉ New OTP sent to ${data.masked_phone || full}.`, "info");
            _startPhoneResendCountdown(30);
        } else {
            _setPhoneOtpStatus(`⚠ ${data.detail || "Failed to resend OTP."}`, "error");
        }
    } catch (e) {
        _setPhoneOtpStatus(`⚠ Cannot reach server. (${e.message})`, "error");
    }
}

/* ── Allow user to correct their phone number ── */
function resetPhoneEntry() {
    _phoneVerified = false;
    if (_phoneOtpResendTimer) { clearInterval(_phoneOtpResendTimer); _phoneOtpResendTimer = null; }
    const phoneInput = document.getElementById("phone_number");
    if (phoneInput) phoneInput.readOnly = false;
    const countrySel = document.getElementById("phone_country");
    if (countrySel) countrySel.disabled = false;
    // Hide verify prompt too
    const vp = document.getElementById("phone-verify-prompt");
    if (vp) vp.style.display = "none";
    document.getElementById("phone-entry-section").style.display    = "block";
    document.getElementById("phone-otp-section").style.display      = "none";
    document.getElementById("phone-verified-section").style.display = "none";
    const sendBtn = document.getElementById("btn-send-phone-otp");
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Continue →"; }
    const resultEl = document.getElementById("phone-result");
    if (resultEl) resultEl.innerHTML = "";
}

/* ── User chose YES → send OTP ── */
async function phoneVerifyYes() {
    const vp = document.getElementById("phone-verify-prompt");
    if (vp) vp.style.display = "none";
    const full = window._pvpPhone || "";
    if (!full) return;
    const resultEl = document.getElementById("phone-result");
    if (resultEl) resultEl.innerHTML = "";
    try {
        const otpRes  = await fetch(`${API_BASE}/phone/send-otp`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ phone_number: full })
        });
        const otpData = await otpRes.json();
        if (!otpRes.ok) {
            const pi = document.getElementById("phone_number"); if(pi) pi.readOnly=false;
            const cs = document.getElementById("phone_country"); if(cs) cs.disabled=false;
            document.getElementById("phone-entry-section").style.display = "block";
            if (resultEl) resultEl.innerHTML = `<span style="color:#c62828;">❌ ${otpData.detail||"Failed to send OTP."}</span>`;
            return;
        }
        const sd = document.getElementById("phone-sent-display"); if(sd) sd.textContent = otpData.masked_phone||full;
        document.getElementById("phone-otp-section").style.display = "block";
        setVal("phone_otp_input","");
        const vb = document.getElementById("btn-verify-phone-otp"); if(vb){vb.disabled=true;vb.textContent="Verify OTP";}
        _setPhoneOtpStatus(`✉ OTP sent to ${otpData.masked_phone||full}. Check your SMS.`,"info");
        _startPhoneResendCountdown(30);
    } catch(e) {
        if(resultEl) resultEl.innerHTML=`<span style="color:#c62828;">⚠ Cannot reach server. (${e.message})</span>`;
    }
}

/* ── User chose NO → skip OTP, proceed unverified ── */
async function phoneVerifyNo() {
    const vp = document.getElementById("phone-verify-prompt");
    if (vp) vp.style.display = "none";
    const full = window._pvpPhone || "";
    _donorPhone    = full;
    _phoneVerified = false;   // explicitly unverified
    document.getElementById("phone-verified-section").style.display = "block";
    const banner = document.getElementById("phone-verified-section");
    if (banner) banner.innerHTML = `<div class="result-success" role="status" style="margin-bottom:18px;background:#FFF8E7;border-color:#E8821A;color:#5C3D2E;">📋 Phone saved without verification. Proceeding to donor form…</div>`;
    await _proceedAfterPhoneVerified(full);
}

/* ── Show phone number + verified/unverified badge in Step 2 ── */
function _renderPhoneInStep2(phone, verified) {
    const wrap   = document.getElementById("step2-phone-display");
    if (!wrap) return;
    if (!phone) { wrap.style.display = "none"; return; }
    wrap.style.display = "block";
    const inpEl  = document.getElementById("step2-phone-input");
    const tagEl  = document.getElementById("step2-phone-tag");
    if (inpEl) {
        inpEl.value = phone;
        // Border colour reflects verification status
        inpEl.style.borderColor = verified ? "#a5d6a7" : "rgba(232,130,26,.4)";
    }
    if (tagEl) {
        if (verified) {
            tagEl.textContent = "✅ Verified";
            tagEl.style.cssText = "font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;";
        } else {
            tagEl.textContent = "⚠ Not Verified";
            tagEl.style.cssText = "font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;";
        }
    }
}

/* ── Called when user edits the Step-2 phone field ── */
function _onStep2PhoneEdit() {
    // When user edits the phone, clear the verified badge (number is now unverified)
    const tagEl = document.getElementById("step2-phone-tag");
    const inpEl = document.getElementById("step2-phone-input");
    if (tagEl) {
        tagEl.textContent = "⚠ Not Verified";
        tagEl.style.cssText = "font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;";
    }
    if (inpEl) inpEl.style.borderColor = "rgba(232,130,26,.4)";
    // Clear any previous error
    const errEl = document.getElementById("err_step2_phone");
    if (errEl) errEl.textContent = "";
}

/* ── Countdown for Resend button ── */
function _startPhoneResendCountdown(seconds) {
    const resendBtn = document.getElementById("btn-resend-phone-otp");
    if (!resendBtn) return;
    let remaining = seconds;
    resendBtn.style.display = "inline-block";
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${remaining}s`;
    _phoneOtpResendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_phoneOtpResendTimer);
            _phoneOtpResendTimer = null;
            resendBtn.disabled   = false;
            resendBtn.textContent = "Resend OTP";
        } else {
            resendBtn.textContent = `Resend in ${remaining}s`;
        }
    }, 1000);
}

/* ── Status text helper ── */
function _setPhoneOtpStatus(msg, cls) {
    const el = document.getElementById("phone-otp-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = cls === "error" ? "#c62828" : "#8B5E3C";
}

/* ── Reset all phone OTP state (used by startFresh) ── */
function _resetPhoneVerification() {
    _phoneVerified = false;
    if (_phoneOtpResendTimer) { clearInterval(_phoneOtpResendTimer); _phoneOtpResendTimer = null; }
    document.getElementById("phone-entry-section").style.display    = "block";
    document.getElementById("phone-otp-section").style.display      = "none";
    document.getElementById("phone-verified-section").style.display = "none";

    const phoneInput = document.getElementById("phone_number");
    if (phoneInput) phoneInput.readOnly = false;
    const countrySel = document.getElementById("phone_country");
    if (countrySel) countrySel.disabled = false;

    setVal("phone_otp_input", "");
    const sendBtn = document.getElementById("btn-send-phone-otp");
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Continue →"; }
    const resultEl = document.getElementById("phone-result");
    if (resultEl) resultEl.innerHTML = "";
    _setPhoneOtpStatus("", "");
}

/* ── After OTP verified: look up phone in DB and navigate to Step 2 ── */
async function _proceedAfterPhoneVerified(full) {
    _donorPhone = full;
    const resultEl = document.getElementById("phone-result");

    try {
        const res  = await fetch(`${API_BASE}/check-phone?whatsapp_number=${encodeURIComponent(full)}`);
        const data = await res.json();
        if (resultEl) resultEl.innerHTML = "";

        if (!res.ok) {
            _donorId = null; clearDonorForm(); _resetEmailVerification();
            _donorMode = "new";
            goToStep(2); return;
        }

        if (data.exists && data.donor) {
            _donorId = data.donor.id;
            prefillDonorForm(data.donor);
            const banner = document.getElementById("donor-found-banner");
            if (banner) banner.style.display = "none";
            _showDonorChoiceScreen(data.donor);
        } else {
            _donorId = null;
            clearDonorForm();
            _resetEmailVerification();
            _donorMode = "new";
            const banner = document.getElementById("donor-found-banner");
            if (banner) banner.style.display = "none";
            goToStep(2);
        }

    } catch (e) {
        if (resultEl) resultEl.innerHTML =
            `<span style="color:#c62828;">⚠ Cannot reach server. (${e.message})</span>`;
        // Reset so user can try again
        document.getElementById("phone-otp-section").style.display      = "none";
        document.getElementById("phone-entry-section").style.display    = "block";
        document.getElementById("phone-verified-section").style.display = "none";
    }
}


function _escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function _showLoginRequiredBanner() {
    const el = document.getElementById("login-required-banner");
    if (el) { el.style.display = "block"; setTimeout(() => { el.style.display = "none"; }, 4000); }
}

function _hideLoginRequiredBanner() {
    const el = document.getElementById("login-required-banner");
    if (el) el.style.display = "none";
}

/* ── Donor Action Choice (shown when existing donor found) ── */
function _showDonorChoiceScreen(donor) {
    const overlay = document.getElementById("donor-choice-overlay");
    if (!overlay) return;
    const nameEl = document.getElementById("donor-choice-name");
    if (nameEl) nameEl.textContent = `${donor.first_name}${donor.middle_name ? " " + donor.middle_name : ""} ${donor.last_name}`;
    const phoneEl = document.getElementById("donor-choice-phone");
    if (phoneEl) phoneEl.textContent = donor.whatsapp_number;
    overlay.style.display = "flex";
}

async function selectDonorMode(mode) {
    const overlay = document.getElementById("donor-choice-overlay");
    if (overlay) overlay.style.display = "none";
    _donorMode = mode;

    if (mode === "update_only") {
        // ── UPDATE mode: fetch ALL seva bookings; let user pick if multiple ──
        _editingSevaDonationId = null;
        _updateSevaData        = null;
        let sevaList = [];
        if (_donorId && _donorPhone) {
            try {
                const res = await fetch(`${API_BASE}/donors/${_donorId}/seva-donations?whatsapp_number=${encodeURIComponent(_donorPhone)}`);
                if (res.ok) sevaList = await res.json();
            } catch(e) { /* proceed without seva pre-fill */ }
        }

        if (sevaList.length > 1) {
            // Show seva picker overlay — _applyUpdateMode() called after user selects
            _showSevaSelectOverlay(sevaList);
            return;   // don't navigate yet
        } else if (sevaList.length === 1) {
            _updateSevaData        = sevaList[0];
            _editingSevaDonationId = sevaList[0].id;
        }
        _applyUpdateMode();

    } else {
        // ── NEW BOOKING mode: pre-fill only donor, blank seva+person ──
        _editingSevaDonationId = null;
        _updateSevaData        = null;

        const banner = document.getElementById("donor-found-banner");
        if (banner) { banner.textContent = "✅ Donor found! Your details are pre-filled. Please verify, then proceed to book a new seva."; banner.style.display = "block"; }
        const donorBtn = getEl("btn-donor-submit");
        if (donorBtn) donorBtn.textContent = "Update & Continue →";
        // Reset Step 3 & 4 to blank/default
        _clearSevaAndPersonForms();
        const s3btn = document.querySelector("#step-3 .btn-primary");
        if (s3btn) s3btn.textContent = "Next: Seva Person →";
        const s4btn = getEl("btn-submit-all");
        if (s4btn) s4btn.textContent = "Submit Seva Booking →";
        const sevaHint = document.getElementById("donor-seva-skip-hint");
        if (sevaHint) sevaHint.style.display = "none";
    }
    goToStep(2);
}


/* ── Apply "Update Booked Details" mode UI labels ── */
function _applyUpdateMode() {
    const banner = document.getElementById("donor-found-banner");
    if (banner) {
        banner.textContent = "✏ Update mode — edit details, seva & seva person info, then submit to save changes.";
        banner.style.display = "block";
    }
    const donorBtn = getEl("btn-donor-submit");
    if (donorBtn) donorBtn.textContent = "Save & Continue →";
    const s3btn = document.querySelector("#step-3 .btn-primary");
    if (s3btn) s3btn.textContent = "Update & Continue →";
    const s4btn = getEl("btn-submit-all");
    if (s4btn) s4btn.textContent = "💾 Update Booking →";
    const sevaHint = document.getElementById("donor-seva-skip-hint");
    if (sevaHint) sevaHint.style.display = "block";
    goToStep(2);
}

/* ── Seva Selection Overlay (multi-seva picker for update mode) ── */
function _showSevaSelectOverlay(sevaList) {
    const overlay = document.getElementById("seva-select-overlay");
    const listEl  = document.getElementById("seva-select-list");
    if (!overlay || !listEl) return;

    // Cache the list so cards can reference by index — avoids JSON-in-onclick issues
    _sevaListCache = sevaList;

    listEl.innerHTML = sevaList.map((sd, i) => {
        const sp       = sd.seva_person;
        const spName   = sp ? [sp.first_name, sp.middle_name, sp.last_name].filter(Boolean).join(" ") : "—";
        const dateStr  = sd.created_at ? sd.created_at.split(" ")[0] : "—";
        const sevaDate = sp?.seva_english_date
            || (sp?.seva_calendar_type === "Hindu"
                ? _buildHinduDateLabel(sp)
                : "—");
        return `
        <div onclick="selectSevaForUpdate(${i})"
             style="cursor:pointer;border:2px solid #e8c97a;border-radius:12px;padding:14px 16px;background:#FFFBF0;transition:border-color .15s,box-shadow .15s;"
             onmouseover="this.style.borderColor='#E8821A';this.style.boxShadow='0 2px 10px rgba(232,130,26,.18)'"
             onmouseout="this.style.borderColor='#e8c97a';this.style.boxShadow='none'">
            ${sd.seva_image
                ? `<img src="${sd.seva_image}" alt="${sd.seva_name||'Seva'}"
                        style="width:100%;border-radius:8px;margin-bottom:8px;max-height:160px;object-fit:cover;border:1px solid #e0c870;"
                        loading="lazy" onerror="this.style.display='none'">`
                : `<div id="hist-img-wrap-${sd.id}" style="margin-bottom:8px;text-align:center;">
                       <button onclick="event.stopPropagation();generateHistorySevaImage(${sd.id},this)"
                           style="font-size:11px;padding:4px 12px;border-radius:20px;border:1.5px dashed #e0c870;
                                  background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                           🎨 Generate Blessing Card
                       </button>
                   </div>`}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:700;color:#3B1F0B;font-size:14px;">#${i+1} — ${sd.seva_name || "Seva"}</span>
                <span style="background:#E8821A;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;">${sd.seva_type || ""}</span>
            </div>
            <div style="font-size:12px;color:#5C3D2E;display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;">
                <span>💰 ₹${parseFloat(sd.donation_amount||0).toFixed(2)}</span>
                <span>🧾 ${sd.receipt_no || "—"}</span>
                <span>🧘 ${spName}</span>
                <span>📅 ${sevaDate}</span>
                <span style="color:#8B5E3C;">Booked: ${dateStr}</span>
            </div>
        </div>`;
    }).join("");

    overlay.style.display = "flex";
}

function closeSevaSelectOverlay(event) {
    // null = called from close/cancel button → always close
    // event present = backdrop click → only close if the backdrop itself was clicked
    if (event && event.target !== document.getElementById("seva-select-overlay")) return;
    const overlay = document.getElementById("seva-select-overlay");
    if (overlay) overlay.style.display = "none";
}

// Called when user clicks a seva card — receives the index into _sevaListCache
function selectSevaForUpdate(idx) {
    const sd = _sevaListCache[idx];
    if (!sd) return;
    const overlay = document.getElementById("seva-select-overlay");
    if (overlay) overlay.style.display = "none";
    _updateSevaData        = sd;
    _editingSevaDonationId = sd.id;
    _applyUpdateMode();
}

/* ── Clear Step 3 + Step 4 fields (used when entering new_booking mode) ── */
function _clearSevaAndPersonForms() {
    // Step 3 — seva fields
    setVal("seva_id", ""); setVal("seva_type", "");
    setVal("donation_amount", ""); setVal("receipt_no", "");
    setVal("transaction_id", "");
    const pmEl = document.getElementById("payment_method");
    if (pmEl) pmEl.value = "cash";
    const txnWrap = document.getElementById("transaction-id-wrap");
    if (txnWrap) txnWrap.style.display = "none";
    const descBox = document.getElementById("seva-desc-box");
    if (descBox) descBox.style.display = "none";
    const amtHint = document.getElementById("amount-hint");
    if (amtHint) amtHint.style.display = "none";
    clearMsg("seva-submit-result");

    // Step 4 — seva person fields
    ["sp_first_name","sp_middle_name","sp_last_name","sp_gotra_id","sp_zodiac_id"].forEach(id => setVal(id,""));
    populateSelect("sp_birthstar_id", _birthstarList, "id","birthstar_name","Select Birth Star");
    setVal("sp_english_date","");
    _resetHinduFields();
    setVal("sp_calendar_type","English");
    const ew = document.getElementById("sp-english-date-wrap");
    const hw = document.getElementById("sp-hindu-date-wrap");
    if (ew) ew.style.display = "block";
    if (hw) hw.style.display = "none";
    document.getElementById("sp-relations-list").innerHTML = "";
    _sprIndex = 0;
}

/* ════════════════════════════════════════════════════════════
   8. STEP 2 — DONOR FORM
════════════════════════════════════════════════════════════ */
function prefillDonorForm(d) {
    _emailVerified = true;
    _otpEmail      = d.email || "";
    const okSpan   = getEl("ok_email");
    if (okSpan) okSpan.innerHTML = `<span class="email-verified-badge">✅ Email verified</span>`;
    const sendBtn  = getEl("btn_send_otp");
    if (sendBtn) { sendBtn.textContent = "Change Email"; sendBtn.classList.add("sent"); }
    _renderPhoneInStep2(_donorPhone, _phoneVerified);
    setVal("first_name",      d.first_name      || "");
    setVal("middle_name",     d.middle_name     || "");
    setVal("last_name",       d.last_name       || "");
    setVal("gender",          d.gender          || "");
    setVal("email",           d.email           || "");
    setVal("birthdate",       d.birthdate       || "");
    setVal("wedding_date",    d.wedding_date    || "");
    setVal("address_line1",   d.address_line1   || "");
    setVal("address_line2",   d.address_line2   || "");
    setVal("address_pincode", d.address_pincode || "");
    // Restore map position if lat/lng stored
    if (d.latitude && d.longitude) {
        _mapLat = parseFloat(d.latitude);
        _mapLng = parseFloat(d.longitude);
        document.getElementById("donor_latitude").value  = _mapLat;
        document.getElementById("donor_longitude").value = _mapLng;
        // Map will be positioned by _lazyInitMap when Step 2 becomes visible.
        // Do NOT try to call _donorMap here — step 2 is still hidden at this point,
        // creating a map on a hidden div gives it 0×0 size and tiles never load.
    } else if (d.address_city || d.address_pincode) {
        // Don't geocode here either — step 2 is hidden. _lazyInitMap handles it.
    }
    setVal("profession",      d.profession      || "");
    setVal("institution", d.profession === "Work" ? (d.institution || "") : "");
    if (d.address_state) {
        setVal("address_state", d.address_state);
        onStateChange();
        if (d.address_city) setVal("address_city", d.address_city);
    }
    toggleProfessionFields();
    // Restore photo / avatar
    applyDonorPhoto(d.photo || null);
    // Update button to show "Update" mode
    const btn = getEl("btn-donor-submit");
    if (btn) btn.textContent = "Update & Continue →";
}

function clearDonorForm() {
    ["first_name","middle_name","last_name","gender","email",
     "birthdate","wedding_date","address_line1","address_line2",
     "address_pincode","profession","institution"].forEach(id => setVal(id, ""));
    _renderPhoneInStep2(_donorPhone, _phoneVerified);
    setVal("address_state", "");
    const cityEl = document.getElementById("address_city");
    if (cityEl) cityEl.innerHTML = `<option value="" disabled selected>— Select State First —</option>`;
    toggleProfessionFields();
    const otpBox  = getEl("otp_box");  if (otpBox)  otpBox.style.display = "none";
    const okSpan  = getEl("ok_email"); if (okSpan)  okSpan.innerHTML = "";
    const sendBtn = getEl("btn_send_otp");
    if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.classList.remove("sent"); sendBtn.disabled = true; }
    // Reset button text for new donor
    const btn = getEl("btn-donor-submit");
    if (btn) btn.textContent = "Save & Continue →";
    // Reset photo widget
    resetDonorPhoto();
}

function onStateChange() {
    const state  = getVal("address_state");
    const cityEl = document.getElementById("address_city");
    if (!cityEl) return;
    clearFieldError("address_state","err_address_state");
    if (!state || !INDIA_STATES[state]) {
        cityEl.innerHTML = `<option value="" disabled selected>— Select State First —</option>`;
        return;
    }
    cityEl.innerHTML = `<option value="" disabled selected>— Select District —</option>`;
    INDIA_STATES[state].sort().forEach(dist => {
        const o = document.createElement("option");
        o.value = dist; o.textContent = dist;
        cityEl.appendChild(o);
    });
    clearFieldError("address_city","err_address_city");
    if (getVal("address_pincode")) validatePincode();
    // Trigger map search when state changes (city + pincode may already be set)
    _debouncedGeocode();
}

function toggleProfessionFields() {
    const prof      = document.getElementById("profession")?.value;
    const instGroup = document.getElementById("institution-group");
    const instInput = document.getElementById("institution");
    if (prof === "Work") { if (instGroup) instGroup.style.display = "block"; }
    else { if (instGroup) instGroup.style.display = "none"; if (instInput) instInput.value = ""; }
}

function validateDonorForm() {
    let ok = true;
    ok = liveValidateName("first_name","err_first_name",true,2) && ok;
    ok = liveValidateName("last_name", "err_last_name", true,1) && ok;
    if (!getVal("gender")) { showFieldErr("gender","err_gender","⚠ Select gender."); ok = false; }
    else clearFieldError("gender","err_gender");
    ok = liveValidateEmail() && ok;
    if (!_emailVerified && !_emailSkipped) {
        showError("email","err_email","⚠ Please verify your email or choose Skip Verification.");
        ok = false;
    }
    if (!getVal("address_state"))   { showFieldErr("address_state","err_address_state","⚠ Select state."); ok = false; }
    else clearFieldError("address_state","err_address_state");
    if (!getVal("address_city"))    { showFieldErr("address_city","err_address_city","⚠ Select city."); ok = false; }
    else clearFieldError("address_city","err_address_city");
    if (!validatePincode()) ok = false;
    return ok;
}

async function submitDonorStep() {
    if (!validateDonorForm()) return;
    showMsg("donor-step-result","loading-msg","⏳ Saving donor...");
    const payload = buildDonorPayload();
    try {
        let res;
        if (_donorId) {
            res = await fetch(`${API_BASE}/donors/${_donorId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        } else {
            res = await fetch(`${API_BASE}/donors`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        }
        const data = await res.json();
        if (!res.ok) { showMsg("donor-step-result","result-error",`❌ ${data.detail || "Error saving donor."}`); return; }
        if (!_donorId) _donorId = data.donor_id;
        clearMsg("donor-step-result");

        if (_donorMode === "update_only" && _updateSevaData) {
            // Pre-fill Step 3 with latest booking seva data
            _prefillSevaForm(_updateSevaData);
        } else if (_donorMode === "new_booking") {
            // Ensure Step 3+4 are blank for a fresh booking
            _clearSevaAndPersonForms();
        }
        // new mode — steps are already blank, just proceed
        goToStep(3);
    } catch (e) {
        showMsg("donor-step-result","result-error",`❌ Cannot reach server. (${e.message})`);
    }
}

function buildDonorPayload() {
    const prof = getVal("profession") || null;
    // Use Step-2 editable phone if shown, else fall back to Step-1 phone_number
    const step2PhoneEl = document.getElementById("step2-phone-input");
    const step2Phone   = step2PhoneEl?.value?.trim() || "";
    let whatsappNumber;
    if (step2Phone) {
        // Step-2 field already contains the full number (e.g. +919876543210)
        whatsappNumber = step2Phone;
    } else {
        const dial = (document.getElementById("phone_dial_code")?.textContent || "+91").trim();
        const num  = (document.getElementById("phone_number")?.value || "").trim();
        whatsappNumber = dial + num;
    }
    return {
        first_name:      getVal("first_name"),
        middle_name:     getVal("middle_name")     || null,
        last_name:       getVal("last_name"),
        gender:          getVal("gender"),
        whatsapp_number: whatsappNumber,
        email:           getVal("email"),
        address_line1:   getVal("address_line1")   || null,
        address_line2:   getVal("address_line2")   || null,
        address_city:    getVal("address_city")    || null,
        address_state:   getVal("address_state")   || null,
        address_pincode: getVal("address_pincode") || null,
        latitude:        parseFloat(document.getElementById('donor_latitude')?.value)  || null,
        longitude:       parseFloat(document.getElementById('donor_longitude')?.value) || null,
        profession:      prof,
        designation:     null,
        institution:     prof === "Work" ? (getVal("institution") || null) : null,
        birthdate:       getVal("birthdate")       || null,
        wedding_date:    getVal("wedding_date")    || null,
        booked_calendar_type: "English",
        photo:           (document.getElementById("donor_photo")?.value) || null,
    };
}


/* ════════════════════════════════════════════════════════════
   9. STEP 3 — SEVA DETAILS
════════════════════════════════════════════════════════════ */
function onSevaChange() {
    const sel      = document.getElementById("seva_id");
    const opt      = sel.options[sel.selectedIndex];
    const desc     = opt?.dataset?.desc || "";
    const sevaName = opt?.text?.trim()  || "";
    const box      = document.getElementById("seva-desc-box");

    // ── Description box ──────────────────────────────────────────────────────
    if (desc) {
        document.getElementById("seva_description_text").textContent = desc;
        box.style.display = "block";
    } else {
        box.style.display = "none";
    }

    onSevaTypeChange();
    clearFieldError("seva_id", "err_seva_id");

    // ── AI Seva Image Preview in Step 3 ─────────────────────────────────────
    const card     = document.getElementById("seva-ai-preview-card");
    const loader   = document.getElementById("seva-ai-preview-loader");
    const imgEl    = document.getElementById("seva-ai-preview-img");
    const nameTag  = document.getElementById("seva-ai-preview-seva-name");
    const errorBox = document.getElementById("seva-ai-preview-error");
    const retryBtn = document.getElementById("seva-ai-preview-retry");

    // Increment token — cancels any in-flight fetch from a previous selection
    window._sevaPreviewToken = (window._sevaPreviewToken || 0) + 1;
    const myToken = window._sevaPreviewToken;

    // Reset to hidden/spinner state
    window._sevaPreviewImgUrl = null;
    if (imgEl)    { imgEl.src = ""; imgEl.style.display = "none"; }
    if (loader)   loader.style.display   = "flex";
    if (errorBox) errorBox.style.display = "none";
    if (nameTag)  nameTag.textContent    = "";
    // Hide regen button when a new seva is selected
    const regenBtnReset = document.getElementById("seva-ai-preview-regen-btn");
    if (regenBtnReset) regenBtnReset.style.display = "none";

    if (!sevaName || !sel.value) {
        if (card) card.style.display = "none";
        return;
    }

    // Reveal card with spinner immediately
    if (card) {
        card.style.opacity = "0";
        card.style.display = "block";
        requestAnimationFrame(function() {
            card.style.transition = "opacity .35s";
            card.style.opacity    = "1";
        });
    }
    if (nameTag) nameTag.textContent = sevaName;

    // Fetch image through backend proxy — no CORS, no browser timeout
    var proxyUrl = "/seva-preview-image?seva_name=" + encodeURIComponent(sevaName) +
                   "&seed=" + encodeURIComponent(sel.value);

    fetch(proxyUrl)
        .then(function(res) {
            if (window._sevaPreviewToken !== myToken) return null; // stale
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.blob();
        })
        .then(function(blob) {
            if (!blob || window._sevaPreviewToken !== myToken) return;
            var objectUrl = URL.createObjectURL(blob);
            imgEl.onload = function() {
                loader.style.display = "none";
                imgEl.style.display  = "block";
                window._sevaPreviewImgUrl = objectUrl;
                _showSevaPreviewRegenBtn();
            };
            imgEl.src = objectUrl;
        })
        .catch(function(err) {
            if (window._sevaPreviewToken !== myToken) return;
            console.warn("Seva preview fetch failed:", err);
            loader.style.display = "none";
            if (errorBox) errorBox.style.display = "flex";
        });
}

/* ── Show/create the "Regenerate" button inside the Step-3 preview card ── */
function _showSevaPreviewRegenBtn() {
    const card = document.getElementById("seva-ai-preview-card");
    if (!card) return;
    let btn = document.getElementById("seva-ai-preview-regen-btn");
    if (!btn) {
        btn = document.createElement("button");
        btn.id = "seva-ai-preview-regen-btn";
        btn.innerHTML = "🔄 Regenerate";
        btn.title = "Generate a different AI image for this seva";
        btn.onclick = regenSevaPreview;
        Object.assign(btn.style, {
            display:      "block",
            width:        "100%",
            marginTop:    "8px",
            padding:      "6px 0",
            fontSize:     "11px",
            fontWeight:   "700",
            fontFamily:   "inherit",
            background:   "#FFFBF0",
            color:        "#8B5E3C",
            border:       "1.5px dashed #e0c870",
            borderRadius: "20px",
            cursor:       "pointer",
            transition:   "background .2s,box-shadow .2s",
            letterSpacing:".2px",
        });
        btn.addEventListener("mouseover",  function() { this.style.background = "#FDF0D5"; this.style.boxShadow = "0 2px 8px rgba(139,94,60,.15)"; });
        btn.addEventListener("mouseout",   function() { this.style.background = "#FFFBF0"; this.style.boxShadow = "none"; });
        card.appendChild(btn);
    }
    btn.style.display = "block";
    btn.innerHTML = "🔄 Regenerate";
    btn.disabled  = false;
}

/* ── Regenerate the Step-3 preview with a fresh random seed ── */
window.regenSevaPreview = function() {
    const sel      = document.getElementById("seva_id");
    const sevaName = sel?.options[sel?.selectedIndex]?.text?.trim() || "";
    if (!sevaName) return;

    const card     = document.getElementById("seva-ai-preview-card");
    const imgEl    = document.getElementById("seva-ai-preview-img");
    const loader   = document.getElementById("seva-ai-preview-loader");
    const errorBox = document.getElementById("seva-ai-preview-error");
    const btn      = document.getElementById("seva-ai-preview-regen-btn");

    // Spinner on, image hidden, button locked
    if (imgEl)    { imgEl.src = ""; imgEl.style.display = "none"; }
    if (loader)   loader.style.display   = "flex";
    if (errorBox) errorBox.style.display = "none";
    if (btn)      { btn.disabled = true; btn.innerHTML = "⏳ Generating…"; }

    // Fresh random seed → Gemini produces a different image every call
    const seed = Math.floor(Math.random() * 999999);
    const proxyUrl = "/seva-preview-image?seva_name=" + encodeURIComponent(sevaName)
                   + "&seed=" + seed;

    window._sevaPreviewToken = (window._sevaPreviewToken || 0) + 1;
    const myToken = window._sevaPreviewToken;

    fetch(proxyUrl)
        .then(function(res) {
            if (window._sevaPreviewToken !== myToken) return null;
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.blob();
        })
        .then(function(blob) {
            if (!blob || window._sevaPreviewToken !== myToken) return;
            var objectUrl = URL.createObjectURL(blob);
            imgEl.onload = function() {
                if (loader) loader.style.display = "none";
                imgEl.style.display = "block";
                window._sevaPreviewImgUrl = objectUrl;
                _showSevaPreviewRegenBtn(); // re-enable button
            };
            imgEl.src = objectUrl;
        })
        .catch(function(err) {
            if (window._sevaPreviewToken !== myToken) return;
            console.warn("Seva preview regen failed:", err);
            if (loader) loader.style.display = "none";
            if (errorBox) errorBox.style.display = "flex";
            // Re-enable button even on error so user can retry
            if (btn) { btn.disabled = false; btn.innerHTML = "🔄 Try again"; }
        });
};
function onSevaTypeChange() {
    const sel   = document.getElementById("seva_id");
    if (!sel) return;
    const opt   = sel.options[sel.selectedIndex];
    const type  = document.getElementById("seva_type")?.value || "";
    const hint  = document.getElementById("amount-hint");
    const amtEl = document.getElementById("donation_amount");
    if (!opt || !type) { if (hint) hint.style.display = "none"; return; }
    let defaultAmt = 0;
    if (type === "One Time") {
        defaultAmt = parseFloat(opt.dataset.one_time) || 0;
        if (hint) hint.textContent = `💡 Default one-time amount: ₹${defaultAmt.toFixed(2)} (editable)`;
    } else {
        defaultAmt = parseFloat(opt.dataset.regular) || 0;
        if (hint) hint.textContent = `💡 Default regular amount: ₹${defaultAmt.toFixed(2)} (editable)`;
    }
    if (amtEl) amtEl.value = defaultAmt > 0 ? defaultAmt : "";
    if (hint) hint.style.display = defaultAmt > 0 ? "block" : "none";
    clearFieldError("seva_type","err_seva_type");
}

function toggleTransactionId() {
    const method   = document.getElementById("payment_method")?.value || "cash";
    const txnWrap  = document.getElementById("transaction-id-wrap");
    const qrPanel  = document.getElementById("gpay-qr-panel");
    if (txnWrap)  txnWrap.style.display  = (method === "gpay" || method === "other") ? "block" : "none";
    if (qrPanel)  qrPanel.style.display  = (method === "gpay") ? "block" : "none";
    if (method === "cash") clearFieldError("transaction_id","err_transaction_id");
}

// ── GPay QR helpers ────────────────────────────────────────────
// CONFIGURE: Replace the UPI ID below with your temple's actual UPI ID.
const TEMPLE_UPI_ID = "kanmanisanjay17@oksbi";

(function initGpayUpiDisplay() {
    // Set the displayed UPI ID once DOM is ready
    document.addEventListener("DOMContentLoaded", function () {
        const el = document.getElementById("gpay-upi-id-display");
        if (el) el.textContent = TEMPLE_UPI_ID;
    });
})();

function copyUpiId() {
    const upiId = TEMPLE_UPI_ID;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(upiId).then(() => {
            _showCopyToast("✅ UPI ID copied!");
        }).catch(() => _legacyCopyUpi(upiId));
    } else {
        _legacyCopyUpi(upiId);
    }
}
function _legacyCopyUpi(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); _showCopyToast("✅ UPI ID copied!"); }
    catch { _showCopyToast("⚠ Could not copy — copy manually"); }
    document.body.removeChild(ta);
}
function _showCopyToast(msg) {
    let t = document.getElementById("_gpay_copy_toast");
    if (!t) {
        t = document.createElement("div");
        t.id = "_gpay_copy_toast";
        t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;" +
            "background:#15803d;color:#fff;padding:9px 22px;border-radius:30px;" +
            "font-size:13px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.2);" +
            "pointer-events:none;transition:opacity .3s;";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.opacity = "0"; }, 2200);
}
// ───────────────────────────────────────────────────────────────

function validateAmount() {
    const v = parseFloat(document.getElementById("donation_amount").value);
    if (isNaN(v) || v <= 0) { showError("donation_amount","err_donation_amount","⚠ Enter a valid donation amount."); return false; }
    clearError("donation_amount","err_donation_amount"); return true;
}
function validateReceiptNo() {
    const v = getVal("receipt_no");
    if (!v) { showError("receipt_no","err_receipt_no","⚠ Receipt number is required."); return false; }
    clearError("receipt_no","err_receipt_no"); return true;
}
function validateTransactionId() {
    const method = document.getElementById("payment_method")?.value || "";
    if (method === "gpay" || method === "other") {
        if (!getVal("transaction_id")) { showError("transaction_id","err_transaction_id","⚠ Transaction ID is required for online payments."); return false; }
    }
    clearError("transaction_id","err_transaction_id"); return true;
}

function goToStep4FromSeva() {
    let ok = true;
    if (!getVal("seva_id"))   { showFieldErr("seva_id","err_seva_id","⚠ Please select a seva."); ok = false; } else clearFieldError("seva_id","err_seva_id");
    if (!getVal("seva_type")) { showFieldErr("seva_type","err_seva_type","⚠ Please select seva type."); ok = false; } else clearFieldError("seva_type","err_seva_type");
    if (!validateAmount())        ok = false;
    if (!validateReceiptNo())     ok = false;
    if (!validateTransactionId()) ok = false;
    if (!ok) return;

    // Pre-fill Step 4 if update mode — errors here must never block navigation
    if (_donorMode === "update_only" && _updateSevaData && _updateSevaData.seva_person) {
        try { _prefillSevaPersonForm(_updateSevaData.seva_person); } catch(e) { console.error(e); }
    }
    goToStep(4);
}

/* ── Prefill Step 3 (Seva) from existing booking data ── */
function _prefillSevaForm(sd) {
    if (!sd) return;

    // 1. Set seva dropdown
    const sevaSelect = document.getElementById("seva_id");
    if (sevaSelect && sd.seva_id) sevaSelect.value = sd.seva_id;

    // 2. Show seva description (without triggering onSevaChange which would reset amount)
    const opt = sevaSelect?.options[sevaSelect.selectedIndex];
    const desc = opt?.dataset?.desc || "";
    const box = document.getElementById("seva-desc-box");
    if (desc) { const dt = document.getElementById("seva_description_text"); if (dt) dt.textContent = desc; if (box) box.style.display = "block"; }
    else if (box) box.style.display = "none";

    // 3. Set seva type
    if (sd.seva_type) setVal("seva_type", sd.seva_type);

    // 4. Set amount DIRECTLY — do NOT call onSevaTypeChange() as it overwrites with default
    if (sd.donation_amount != null) setVal("donation_amount", parseFloat(sd.donation_amount).toFixed(2));

    // Show the hint label but don't override the amount
    const hint = document.getElementById("amount-hint");
    if (hint && opt && sd.seva_type) {
        const defaultAmt = sd.seva_type === "One Time"
            ? (parseFloat(opt.dataset.one_time) || 0)
            : (parseFloat(opt.dataset.regular)  || 0);
        hint.textContent = `💡 Default ${sd.seva_type.toLowerCase()} amount: ₹${defaultAmt.toFixed(2)} (editable)`;
        hint.style.display = defaultAmt > 0 ? "block" : "none";
    }

    // 5. Receipt number
    if (sd.receipt_no) setVal("receipt_no", sd.receipt_no);

    // 6. Payment method & transaction ID
    if (sd.transaction_id) {
        const pmEl = document.getElementById("payment_method");
        if (pmEl) pmEl.value = "gpay";
        const txnWrap = document.getElementById("transaction-id-wrap");
        if (txnWrap) txnWrap.style.display = "block";
        setVal("transaction_id", sd.transaction_id);
    } else {
        const pmEl = document.getElementById("payment_method");
        if (pmEl) pmEl.value = "cash";
        const txnWrap = document.getElementById("transaction-id-wrap");
        if (txnWrap) txnWrap.style.display = "none";
    }

    // 7. Clear any leftover errors from previous interactions
    clearFieldError("seva_id","err_seva_id");
    clearFieldError("seva_type","err_seva_type");
    clearError("donation_amount","err_donation_amount");
    clearError("receipt_no","err_receipt_no");
    clearError("transaction_id","err_transaction_id");
}

/* ── Prefill Step 4 (Seva Person) from existing booking ── */
function _prefillSevaPersonForm(sp) {
    if (!sp) return;
    try {
        // ── Names ──
        setVal("sp_first_name",  sp.first_name  || "");
        setVal("sp_middle_name", sp.middle_name || "");
        setVal("sp_last_name",   sp.last_name   || "");

        // ── Gotra ──
        if (sp.gotra_id) {
            const gotraSelect = document.getElementById("sp_gotra_id");
            if (gotraSelect) {
                gotraSelect.value = String(sp.gotra_id);
                if (!gotraSelect.value || gotraSelect.value !== String(sp.gotra_id)) {
                    gotraSelect.value = "__other__";
                    const otherInput = document.getElementById("sp_gotra_other");
                    if (otherInput) { otherInput.style.display = "block"; otherInput.value = sp.gotra_name || ""; }
                } else {
                    const otherWrap = document.getElementById("sp_gotra_other");
                    if (otherWrap) otherWrap.style.display = "none";
                }
            }
        }

        // ── Zodiac + Birthstar (cascade) ──
        if (sp.zodiac_id) {
            setVal("sp_zodiac_id", String(sp.zodiac_id));
            onZodiacChange("sp_zodiac_id", "sp_birthstar_id", null);
            // birthstar dropdown is rebuilt by onZodiacChange, set after tick
            setTimeout(() => {
                if (sp.birthstar_id) setVal("sp_birthstar_id", String(sp.birthstar_id));
            }, 50);
        }

        // ── Calendar type & dates ──
        const cal = sp.seva_calendar_type || "English";
        setVal("sp_calendar_type", cal);
        toggleSevaCalendar();   // correct function name
        if (cal === "English" && sp.seva_english_date) {
            setVal("sp_english_date", sp.seva_english_date);
        } else if (cal === "Hindu") {
            // Restore year from the stored English date (e.g. "2026-11-12" → year=2026)
            if (sp.seva_english_date) {
                const parts = sp.seva_english_date.split("-");
                if (parts[0]) setVal("sp_hindu_year", parts[0]);
            } else {
                setVal("sp_hindu_year", String(new Date().getFullYear()));
            }
            if (sp.seva_purnima_name_id)  { setVal("sp_purnima_name_id", String(sp.seva_purnima_name_id)); onHinduTypeChange("purnima"); }
            if (sp.seva_krishna_tithi_id) setVal("sp_krishna_tithi_id", String(sp.seva_krishna_tithi_id));
            if (sp.seva_amavasya_name_id) { setVal("sp_amavasya_name_id", String(sp.seva_amavasya_name_id)); onHinduTypeChange("amavasya"); }
            if (sp.seva_shukla_tithi_id)  setVal("sp_shukla_tithi_id",  String(sp.seva_shukla_tithi_id));
            // Trigger live preview so computed date is visible immediately
            setTimeout(onHinduSelectionChange, 100);
        }

        // ── Family relation cards ──
        const relList = document.getElementById("sp-relations-list");
        if (relList) relList.innerHTML = "";
        _sprIndex = 0;
        if (sp.relations && sp.relations.length > 0) {
            sp.relations.forEach(rel => addSevaPersonRelation(rel));
        }

        // ── Update submit button ──
        const submitBtn = getEl("btn-submit-all");
        if (submitBtn) submitBtn.textContent = "💾 Update Booking →";

    } catch(e) {
        console.error("_prefillSevaPersonForm error:", e);
        // Don't block navigation even if prefill partially fails
    }
}


/* ════════════════════════════════════════════════════════════
   10. STEP 4 — SEVA PERSON + SUBMIT  (v12.0: POST or PUT)
════════════════════════════════════════════════════════════ */
function validateSevaPersonForm() {
    let ok = true;
    ok = liveValidateName("sp_first_name","err_sp_first_name",true,2) && ok;
    ok = liveValidateName("sp_last_name", "err_sp_last_name", true,1) && ok;
    if (!getVal("sp_gotra_id") || getVal("sp_gotra_id") === "__other__") { showFieldErr("sp_gotra_id","err_sp_gotra_id","⚠ Select or add gotra."); ok = false; } else clearFieldError("sp_gotra_id","err_sp_gotra_id");
    if (!getVal("sp_zodiac_id"))    { showFieldErr("sp_zodiac_id","err_sp_zodiac_id","⚠ Select zodiac (Rashi)."); ok = false; } else clearFieldError("sp_zodiac_id","err_sp_zodiac_id");
    if (!getVal("sp_birthstar_id")) { showFieldErr("sp_birthstar_id","err_sp_birthstar_id","⚠ Select birth star (Nakshatra)."); ok = false; } else clearFieldError("sp_birthstar_id","err_sp_birthstar_id");
    const cal = getVal("sp_calendar_type");
    if (cal === "English") {
        if (!getVal("sp_english_date")) { showFieldErr("sp_english_date","err_sp_date","⚠ Seva date is required."); ok = false; }
        else clearFieldError("sp_english_date","err_sp_date");
        _clearHinduDateError();
    } else {
        clearFieldError("sp_english_date","err_sp_date");
        if (!getVal("sp_hindu_year")) { _showHinduDateError("⚠ Please select a year."); ok = false; }
        else {
            const pName = getVal("sp_purnima_name_id");
            const aName = getVal("sp_amavasya_name_id");
            if (!pName && !aName) { _showHinduDateError("⚠ Select a Pournami or Amavasai month name."); ok = false; }
            else if (pName && !getVal("sp_krishna_tithi_id")) { _showHinduDateError("⚠ Please select a Krishna Paksha Tithi."); ok = false; }
            else if (aName && !getVal("sp_shukla_tithi_id"))  { _showHinduDateError("⚠ Please select a Shukla Paksha Tithi."); ok = false; }
            else if (!_computedHinduEnglishDate) { _showHinduDateError("⚠ Date not yet computed — please wait a moment and try again."); ok = false; }
            else _clearHinduDateError();
        }
    }
    return ok;
}

async function submitAll() {
    if (!validateSevaPersonForm()) return;
    if (!validateRelationCards())  return;

    showMsg("seva-submit-result","loading-msg","⏳ Submitting seva booking...");

    const spRelations = [];
    document.querySelectorAll(".sp-relation-item").forEach(item => spRelations.push(extractSevaPersonRelationData(item)));

    const calType = getVal("sp_calendar_type");
    let sevaPurnimaNameId  = null, sevaKrishnaTithiId = null;
    let sevaAmavasyanNameId = null, sevaShuklaTithiId = null;
    if (calType === "Hindu") {
        const pNameVal = getVal("sp_purnima_name_id");
        const aNameVal = getVal("sp_amavasya_name_id");
        if (pNameVal) {
            sevaPurnimaNameId  = parseInt(pNameVal);
            sevaKrishnaTithiId = parseInt(getVal("sp_krishna_tithi_id")) || null;
        } else if (aNameVal) {
            sevaAmavasyanNameId = parseInt(aNameVal);
            sevaShuklaTithiId   = parseInt(getVal("sp_shukla_tithi_id")) || null;
        }
    }

    const sevaPersonPayload = {
        first_name:            getVal("sp_first_name"),
        middle_name:           getVal("sp_middle_name") || null,
        last_name:             getVal("sp_last_name"),
        gotra_id:              parseInt(getVal("sp_gotra_id")),
        birthstar_id:          parseInt(getVal("sp_birthstar_id")),
        zodiac_id:             parseInt(getVal("sp_zodiac_id")),
        seva_calendar_type:    calType,
        seva_english_date:     calType === "English" ? (getVal("sp_english_date") || null) : null,
        seva_hindu_date:       null,
        seva_purnima_name_id:  sevaPurnimaNameId,
        seva_krishna_tithi_id: sevaKrishnaTithiId,
        seva_amavasya_name_id: sevaAmavasyanNameId,
        seva_shukla_tithi_id:  sevaShuklaTithiId,
        seva_year:             calType === "Hindu" ? (parseInt(getVal("sp_hindu_year")) || null) : null,
        // FIX #6: relation_count removed — server derives count from relations.length
        relations:             spRelations,
    };

    const method  = document.getElementById("payment_method").value;
    const showTxn = (method === "gpay" || method === "other");

    try {
        const payload = {
            donor_id:        _donorId,
            seva_id:         parseInt(getVal("seva_id")),
            seva_type:       getVal("seva_type"),
            donation_amount: parseFloat(getVal("donation_amount")),
            receipt_no:      getVal("receipt_no"),
            transaction_id:  showTxn ? (getVal("transaction_id") || null) : null,
            seva_person:     sevaPersonPayload,
        };
        // update_only + has existing booking → PUT, everything else → POST
        const isUpdate = (_donorMode === "update_only" && !!_editingSevaDonationId);
        let res;
        if (isUpdate) {
            res = await fetch(`${API_BASE}/seva-donations/${_editingSevaDonationId}`, {
                method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE}/seva-donations`, {
                method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload)
            });
        }
        const data = await res.json();
        if (!res.ok) {
            let errMsg = "Submission failed.";
            if (data.detail) {
                if (Array.isArray(data.detail)) {
                    errMsg = data.detail
                        .map(e => `${(e.loc || []).slice(1).join(" → ")}: ${e.msg}`)
                        .join(" | ");
                } else {
                    errMsg = String(data.detail);
                }
            }
            console.error("[submitAll] Server error:", data);
            showMsg("seva-submit-result", "result-error", `❌ ${errMsg}`);
            return;
        }
        _lastBooking = {
            isEdit: isUpdate,
            receipt_no:  data.receipt_no,
            seva_name:   document.getElementById("seva_id")?.options[document.getElementById("seva_id")?.selectedIndex]?.text || "",
            seva_type:   getVal("seva_type"),
            amount:      getVal("donation_amount"),
            person_name: `${getVal("sp_first_name")} ${getVal("sp_last_name")}`.trim(),
            donationId:  data.seva_donation_id || null,   // ← stored for image polling
        };
        clearMsg("seva-submit-result");

        const rawEmail   = getVal("email") || "";
        const rawPhone   = getVal("whatsapp_number") || _donorPhone || "";
        const donationId = data.seva_donation_id || _editingSevaDonationId || null;

        // ── Fire-and-forget: generate & store AI seva image ────────────────
        if (donationId && !isUpdate) {
            console.log(`[seva-image] ▶ START — requesting image for donation ${donationId}`);
            fetch(`${API_BASE}/seva-donations/${donationId}/generate-seva-image`, { method: "POST" })
                .then(r => {
                    if (!r.ok) {
                        console.warn(`[seva-image] ❌ HTTP ${r.status} from server`);
                        return r.json().catch(() => ({}));
                    }
                    return r.json();
                })
                .then(imgData => {
                    if (imgData && imgData.seva_image) {
                        // Win the race: cancel polling so it doesn't fire twice
                        if (_sevaImagePollTimer) {
                            clearInterval(_sevaImagePollTimer);
                            _sevaImagePollTimer = null;
                        }
                        _lastBooking.seva_image = imgData.seva_image;
                        const cached = imgData.cached ? " (cached)" : " (newly generated)";
                        console.log(`[seva-image] ✅ SUCCESS${cached} — image stored for donation ${donationId}`);
                        // Replace placeholder with real image + regenerate button
                        const placeholder = document.getElementById("seva-img-placeholder");
                        if (placeholder) {
                            placeholder.outerHTML = _sevaImgWithRegenBtn(
                                imgData.seva_image,
                                _lastBooking.seva_name || 'Seva',
                                donationId
                            );
                        } else {
                            const panel = document.getElementById("step-5");
                            if (panel && panel.classList.contains("active")) _renderSuccessStep();
                        }
                    } else {
                        console.warn(
                            `[seva-image] ❌ FAILED for donation ${donationId}:`,
                            imgData && imgData.message ? imgData.message : "No image returned"
                        );
                    }
                })
                .catch(err => {
                    console.warn(`[seva-image] ❌ Network error for donation ${donationId}:`, err.message || err);
                });
        }

        // Store WhatsApp pending info for after email prompt
        _pendingWAPhone = rawPhone  || null;
        _pendingWADonId = donationId || null;

        // ── After booking: ask about confirmation email then WhatsApp, then go to step 5 ─────
        if (rawEmail && donationId) {
            _pendingEmailAddr  = rawEmail;
            _pendingEmailDonId = donationId;
            _promptEmailConfirmation();
        } else if (rawPhone && donationId) {
            // No email — go straight to WhatsApp prompt
            _promptWAConfirmation();
        } else {
            goToStep(5);
        }

    } catch (e) {
        showMsg("seva-submit-result","result-error",`❌ Cannot reach server. (${e.message})`);
    }
}



/* ════════════════════════════════════════════════════════════
   EMAIL CONFIRMATION MODAL  — shown after successful booking
   Uses _pendingEmailAddr + _pendingEmailDonId globals.
   Buttons wired with addEventListener (no inline onclick).
════════════════════════════════════════════════════════════ */
function _promptEmailConfirmation() {
    // Clean up any leftover modal
    const old = document.getElementById("email-confirm-modal");
    if (old) old.remove();

    const email = _pendingEmailAddr  || "";
    const donId = _pendingEmailDonId || null;

    if (!email || !donId) { goToStep(5); return; }

    // ── Overlay ──────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "email-confirm-modal";
    Object.assign(overlay.style, {
        position:        "fixed",
        inset:           "0",
        zIndex:          "9999",
        background:      "rgba(30,15,0,.58)",
        backdropFilter:  "blur(4px)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         "16px",
    });

    // ── Box ───────────────────────────────────────────────────
    const box = document.createElement("div");
    Object.assign(box.style, {
        background:   "#fff",
        borderRadius: "18px",
        padding:      "28px 26px 24px",
        width:        "100%",
        maxWidth:     "440px",
        boxShadow:    "0 20px 60px rgba(30,15,0,.35)",
        fontFamily:   "inherit",
    });

    // Header
    const hdr = document.createElement("div");
    Object.assign(hdr.style, {
        display:       "flex",
        alignItems:    "center",
        gap:           "12px",
        marginBottom:  "18px",
        paddingBottom: "14px",
        borderBottom:  "1px solid #EFE0C6",
    });
    hdr.innerHTML = `
        <div style="width:44px;height:44px;border-radius:50%;background:#FFF3DC;
                    display:flex;align-items:center;justify-content:center;
                    font-size:22px;flex-shrink:0;">📧</div>
        <div>
            <div style="font-size:15px;font-weight:700;color:#3B1F0B;">Send Booking Confirmation?</div>
            <div style="font-size:12px;color:#2e7d32;margin-top:2px;">✅ Booking saved successfully</div>
        </div>`;

    // Body text
    const body = document.createElement("div");
    Object.assign(body.style, {
        fontSize:     "13.5px",
        color:        "#5C3D2E",
        lineHeight:   "1.6",
        marginBottom: "18px",
    });
    body.innerHTML = `
        Do you want to send the booking confirmation email to the donor?
        <div style="margin-top:10px;padding:10px 14px;background:#FFF9EC;
                    border:1.5px solid #F5C842;border-radius:8px;
                    font-size:13px;color:#3B1F0B;word-break:break-all;">
            📬 <strong>${_escHtml(email)}</strong>
        </div>`;

    // Status
    const statusEl = document.createElement("div");
    statusEl.id = "ecm-status";
    Object.assign(statusEl.style, {
        display:      "none",
        marginBottom: "14px",
        padding:      "9px 14px",
        borderRadius: "8px",
        fontSize:     "13px",
        fontWeight:   "600",
    });

    // Buttons row
    const row = document.createElement("div");
    Object.assign(row.style, {
        display:        "flex",
        gap:            "10px",
        justifyContent: "flex-end",
    });

    const btnSkip = document.createElement("button");
    btnSkip.id        = "ecm-btn-skip";
    btnSkip.textContent = "Skip";
    Object.assign(btnSkip.style, {
        padding:      "10px 20px",
        fontSize:     "13px",
        fontWeight:   "600",
        background:   "#f5f0e8",
        color:        "#8B5E3C",
        border:       "1.5px solid #EFE0C6",
        borderRadius: "10px",
        cursor:       "pointer",
        fontFamily:   "inherit",
    });
    btnSkip.addEventListener("mouseenter", () => btnSkip.style.background = "#EFE0C6");
    btnSkip.addEventListener("mouseleave", () => btnSkip.style.background = "#f5f0e8");
    btnSkip.addEventListener("click", _ecmSkip);

    const btnSend = document.createElement("button");
    btnSend.id = "ecm-btn-send";
    btnSend.innerHTML = `<span>📨</span> Yes, Send Email`;
    Object.assign(btnSend.style, {
        padding:      "10px 22px",
        fontSize:     "13px",
        fontWeight:   "700",
        background:   "#E8821A",
        color:        "#fff",
        border:       "none",
        borderRadius: "10px",
        cursor:       "pointer",
        fontFamily:   "inherit",
        display:      "flex",
        alignItems:   "center",
        gap:          "7px",
    });
    btnSend.addEventListener("mouseenter", () => { if (!btnSend.disabled) btnSend.style.background = "#c96e12"; });
    btnSend.addEventListener("mouseleave", () => { if (!btnSend.disabled) btnSend.style.background = "#E8821A"; });
    btnSend.addEventListener("click", _ecmSend);

    row.append(btnSkip, btnSend);
    box.append(hdr, body, statusEl, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function _ecmSkip() {
    const modal = document.getElementById("email-confirm-modal");
    if (modal) modal.remove();
    _pendingEmailAddr  = null;
    _pendingEmailDonId = null;
    // Chain to WhatsApp prompt if we have a number; otherwise go to step 5
    if (_pendingWAPhone && _pendingWADonId) {
        _promptWAConfirmation();
    } else {
        goToStep(5);
    }
}

async function _ecmSend() {
    const statusEl = document.getElementById("ecm-status");
    const btnSend  = document.getElementById("ecm-btn-send");
    const btnSkip  = document.getElementById("ecm-btn-skip");

    const email = _pendingEmailAddr;
    const donId = _pendingEmailDonId;

    if (!email || !donId || !statusEl || !btnSend) { _ecmSkip(); return; }

    // Disable both buttons while sending
    btnSend.disabled   = true;
    btnSend.innerHTML  = `<span>⏳</span> Sending…`;
    btnSend.style.opacity = "0.7";
    if (btnSkip) btnSkip.disabled = true;
    statusEl.style.display = "none";

    try {
        const res  = await fetch(`${API_BASE}/seva-donations/${donId}/send-confirmation`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ donor_id: _donorId }),
        });
        const data = await res.json();

        if (res.ok) {
            // Success
            Object.assign(statusEl.style, {
                display:     "block",
                background:  "#ECFDF5",
                color:       "#065F46",
                border:      "1.5px solid #6EE7B7",
            });
            statusEl.textContent  = "✅ Confirmation email sent successfully!";
            btnSend.style.display = "none";
            // Convert Skip → Continue — clicking will chain to WhatsApp prompt
            if (btnSkip) {
                btnSkip.textContent = "Continue →";
                Object.assign(btnSkip.style, {
                    background:   "#E8821A",
                    color:        "#fff",
                    borderColor:  "#E8821A",
                });
                btnSkip.disabled = false;
                // Re-wire: clicking Continue now goes to WA prompt (or step 5 if no phone)
                btnSkip.replaceWith(btnSkip.cloneNode(true));   // strip old listener
                const btnContinue = document.getElementById("ecm-btn-skip");
                if (btnContinue) {
                    btnContinue.addEventListener("click", () => {
                        const modal = document.getElementById("email-confirm-modal");
                        if (modal) modal.remove();
                        _pendingEmailAddr  = null;
                        _pendingEmailDonId = null;
                        if (_pendingWAPhone && _pendingWADonId) {
                            _promptWAConfirmation();
                        } else {
                            goToStep(5);
                        }
                    });
                }
            }
            _pendingEmailAddr  = null;
            _pendingEmailDonId = null;
        } else {
            // Server error
            const msg = data?.detail || "Failed to send email.";
            Object.assign(statusEl.style, {
                display:    "block",
                background: "#FEF2F2",
                color:      "#991B1B",
                border:     "1.5px solid #FCA5A5",
            });
            statusEl.textContent   = `⚠ ${msg}`;
            btnSend.disabled       = false;
            btnSend.innerHTML      = `<span>🔁</span> Retry`;
            btnSend.style.opacity  = "1";
            if (btnSkip) btnSkip.disabled = false;
        }
    } catch (err) {
        Object.assign(statusEl.style, {
            display:    "block",
            background: "#FEF2F2",
            color:      "#991B1B",
            border:     "1.5px solid #FCA5A5",
        });
        statusEl.textContent   = `⚠ Network error: ${err.message}`;
        btnSend.disabled       = false;
        btnSend.innerHTML      = `<span>🔁</span> Retry`;
        btnSend.style.opacity  = "1";
        if (btnSkip) btnSkip.disabled = false;
    }
}


/* ════════════════════════════════════════════════════════════
   WHATSAPP CONFIRMATION MODAL — shown after email modal closes
   (or directly if there is no email).
   Uses _pendingWAPhone + _pendingWADonId globals.
════════════════════════════════════════════════════════════ */
function _promptWAConfirmation() {
    const old = document.getElementById("wa-confirm-modal");
    if (old) old.remove();

    const phone = _pendingWAPhone || "";
    const donId = _pendingWADonId || null;

    // If nothing to send, skip straight to step 5
    if (!phone || !donId) { goToStep(5); return; }

    // ── Overlay ──────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "wa-confirm-modal";
    Object.assign(overlay.style, {
        position:        "fixed",
        inset:           "0",
        zIndex:          "9999",
        background:      "rgba(10,40,20,.60)",
        backdropFilter:  "blur(4px)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         "16px",
    });

    // ── Box ───────────────────────────────────────────────────
    const box = document.createElement("div");
    Object.assign(box.style, {
        background:   "#fff",
        borderRadius: "18px",
        padding:      "28px 26px 24px",
        width:        "100%",
        maxWidth:     "440px",
        boxShadow:    "0 20px 60px rgba(10,40,20,.35)",
        fontFamily:   "inherit",
    });

    // Header
    const hdr = document.createElement("div");
    Object.assign(hdr.style, {
        display:       "flex",
        alignItems:    "center",
        gap:           "12px",
        marginBottom:  "18px",
        paddingBottom: "14px",
        borderBottom:  "1px solid #D1F0D8",
    });
    hdr.innerHTML = `
        <div style="width:44px;height:44px;border-radius:50%;background:#E8F8ED;
                    display:flex;align-items:center;justify-content:center;
                    font-size:22px;flex-shrink:0;">💬</div>
        <div>
            <div style="font-size:15px;font-weight:700;color:#1A3C28;">Send WhatsApp Notification?</div>
            <div style="font-size:12px;color:#2e7d32;margin-top:2px;">✅ Booking saved successfully</div>
        </div>`;

    // Body text
    const body = document.createElement("div");
    Object.assign(body.style, {
        fontSize:     "13.5px",
        color:        "#1A3C28",
        lineHeight:   "1.6",
        marginBottom: "18px",
    });
    body.innerHTML = `
        Send a WhatsApp booking confirmation to the donor?
        <div style="margin-top:10px;padding:10px 14px;background:#F0FDF4;
                    border:1.5px solid #4ADE80;border-radius:8px;
                    font-size:13px;color:#14532D;word-break:break-all;">
            📱 <strong>${_escHtml(phone)}</strong>
        </div>
        <div style="margin-top:8px;font-size:11.5px;color:#6B7280;">
            The donor will receive a WhatsApp template message with booking details
            ${_escHtml(phone) ? 'and their profile photo' : ''}.
        </div>`;

    // Status
    const statusEl = document.createElement("div");
    statusEl.id = "wam-status";
    Object.assign(statusEl.style, {
        display:      "none",
        marginBottom: "14px",
        padding:      "9px 14px",
        borderRadius: "8px",
        fontSize:     "13px",
        fontWeight:   "600",
    });

    // Buttons row
    const row = document.createElement("div");
    Object.assign(row.style, {
        display:        "flex",
        gap:            "10px",
        justifyContent: "flex-end",
    });

    const btnSkip = document.createElement("button");
    btnSkip.id          = "wam-btn-skip";
    btnSkip.textContent = "Skip";
    Object.assign(btnSkip.style, {
        padding:      "10px 20px",
        fontSize:     "13px",
        fontWeight:   "600",
        background:   "#F0FDF4",
        color:        "#166534",
        border:       "1.5px solid #BBF7D0",
        borderRadius: "10px",
        cursor:       "pointer",
        fontFamily:   "inherit",
    });
    btnSkip.addEventListener("mouseenter", () => btnSkip.style.background = "#DCFCE7");
    btnSkip.addEventListener("mouseleave", () => btnSkip.style.background = "#F0FDF4");
    btnSkip.addEventListener("click", _wamSkip);

    const btnSend = document.createElement("button");
    btnSend.id       = "wam-btn-send";
    btnSend.innerHTML = `<span>📲</span> Yes, Send WhatsApp`;
    Object.assign(btnSend.style, {
        padding:      "10px 22px",
        fontSize:     "13px",
        fontWeight:   "700",
        background:   "#25D366",
        color:        "#fff",
        border:       "none",
        borderRadius: "10px",
        cursor:       "pointer",
        fontFamily:   "inherit",
        display:      "flex",
        alignItems:   "center",
        gap:          "7px",
    });
    btnSend.addEventListener("mouseenter", () => { if (!btnSend.disabled) btnSend.style.background = "#1aad52"; });
    btnSend.addEventListener("mouseleave", () => { if (!btnSend.disabled) btnSend.style.background = "#25D366"; });
    btnSend.addEventListener("click", _wamSend);

    row.append(btnSkip, btnSend);
    box.append(hdr, body, statusEl, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function _wamSkip() {
    const modal = document.getElementById("wa-confirm-modal");
    if (modal) modal.remove();
    _pendingWAPhone = null;
    _pendingWADonId = null;
    goToStep(5);
}

async function _wamSend() {
    const statusEl = document.getElementById("wam-status");
    const btnSend  = document.getElementById("wam-btn-send");
    const btnSkip  = document.getElementById("wam-btn-skip");

    const phone = _pendingWAPhone;
    const donId = _pendingWADonId;

    if (!phone || !donId || !statusEl || !btnSend) { _wamSkip(); return; }

    // Disable buttons while sending
    btnSend.disabled   = true;
    btnSend.innerHTML  = `<span>⏳</span> Sending…`;
    btnSend.style.opacity = "0.7";
    if (btnSkip) btnSkip.disabled = true;
    statusEl.style.display = "none";

    try {
        const res  = await fetch(`${API_BASE}/seva-donations/${donId}/send-whatsapp`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();

        if (res.ok && data.success) {
            // Success
            Object.assign(statusEl.style, {
                display:     "block",
                background:  "#F0FDF4",
                color:       "#14532D",
                border:      "1.5px solid #4ADE80",
            });
            statusEl.textContent  = "✅ WhatsApp message sent successfully!";
            btnSend.style.display = "none";
            if (btnSkip) {
                btnSkip.textContent = "Continue →";
                Object.assign(btnSkip.style, {
                    background:  "#25D366",
                    color:       "#fff",
                    borderColor: "#25D366",
                });
                btnSkip.disabled = false;
            }
            _pendingWAPhone = null;
            _pendingWADonId = null;
        } else {
            // Server-side error (WA not configured, template issue, etc.)
            const msg = data?.message || data?.detail || "Failed to send WhatsApp message.";
            Object.assign(statusEl.style, {
                display:    "block",
                background: "#FEF2F2",
                color:      "#991B1B",
                border:     "1.5px solid #FCA5A5",
            });
            statusEl.textContent   = `⚠ ${msg}`;
            btnSend.disabled       = false;
            btnSend.innerHTML      = `<span>🔁</span> Retry`;
            btnSend.style.opacity  = "1";
            if (btnSkip) btnSkip.disabled = false;
        }
    } catch (err) {
        Object.assign(statusEl.style, {
            display:    "block",
            background: "#FEF2F2",
            color:      "#991B1B",
            border:     "1.5px solid #FCA5A5",
        });
        statusEl.textContent   = `⚠ Network error: ${err.message}`;
        btnSend.disabled       = false;
        btnSend.innerHTML      = `<span>🔁</span> Retry`;
        btnSend.style.opacity  = "1";
        if (btnSkip) btnSkip.disabled = false;
    }
}


/* ════════════════════════════════════════════════════════════
   11. HINDU CALENDAR
════════════════════════════════════════════════════════════ */
async function loadHinduCalendarData() {
    try {
        const [pn, an, kt, st] = await Promise.all([
            fetch(`${API_BASE}/hindu-calendar/purnima-names`).then(r => r.json()),
            fetch(`${API_BASE}/hindu-calendar/amavasya-names`).then(r => r.json()),
            fetch(`${API_BASE}/hindu-calendar/krishna-paksha-tithis`).then(r => r.json()),
            fetch(`${API_BASE}/hindu-calendar/shukla-paksha-tithis`).then(r => r.json()),
        ]);
        _purnimaNames = pn; _amavasyanNames = an; _krishnaTithis = kt; _shuklaTithis = st;
        _populateHinduDropdowns();
        _populateYearDropdown();
    } catch (e) { console.error("Hindu calendar data load error:", e); }
}

function _populateYearDropdown() {
    const sel = document.getElementById("sp_hindu_year");
    if (!sel) return;
    const cur = new Date().getFullYear();
    sel.innerHTML = `<option value="" disabled selected>— Select Year —</option>`;
    // Past 10 years → next 25 years  (e.g. 2016 – 2051 in 2026)
    // ephem works accurately for any year, so no upper limit is needed.
    for (let y = cur - 10; y <= cur + 25; y++) {
        const o = document.createElement("option");
        o.value = y;
        o.textContent = y;
        if (y === cur) o.selected = true;
        sel.appendChild(o);
    }
}

function _populateHinduDropdowns() {
    const pSel = document.getElementById("sp_purnima_name_id");
    if (pSel) { pSel.innerHTML = `<option value="" disabled selected>— Select Pournami Month —</option>`; _purnimaNames.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name; pSel.appendChild(o); }); }
    const aSel = document.getElementById("sp_amavasya_name_id");
    if (aSel) { aSel.innerHTML = `<option value="" disabled selected>— Select Amavasai Month —</option>`; _amavasyanNames.forEach(a => { const o = document.createElement("option"); o.value = a.id; o.textContent = a.name; aSel.appendChild(o); }); }
    const kSel = document.getElementById("sp_krishna_tithi_id");
    if (kSel) { kSel.innerHTML = `<option value="" disabled selected>— Select Krishna Paksha Tithi —</option>`; _krishnaTithis.forEach(t => { const o = document.createElement("option"); o.value = t.id; o.textContent = t.tithi_name; kSel.appendChild(o); }); }
    const sSel = document.getElementById("sp_shukla_tithi_id");
    if (sSel) { sSel.innerHTML = `<option value="" disabled selected>— Select Shukla Paksha Tithi —</option>`; _shuklaTithis.forEach(t => { const o = document.createElement("option"); o.value = t.id; o.textContent = t.tithi_name; sSel.appendChild(o); }); }
}

function onHinduTypeChange(which) {
    const purnimaNameEl   = document.getElementById("sp_purnima_name_id");
    const amavasyanNameEl = document.getElementById("sp_amavasya_name_id");
    const krishnaWrap     = document.getElementById("sp-krishna-tithi-wrap");
    const shuklaWrap      = document.getElementById("sp-shukla-tithi-wrap");
    const krishnaSelEl    = document.getElementById("sp_krishna_tithi_id");
    const shuklaSelEl     = document.getElementById("sp_shukla_tithi_id");
    _clearHinduDateError();
    _hideHinduPreview();
    if (which === "purnima" && purnimaNameEl?.value) {
        if (amavasyanNameEl) { amavasyanNameEl.value = ""; amavasyanNameEl.classList.remove("input-ok"); }
        if (shuklaSelEl)     { shuklaSelEl.value = ""; shuklaSelEl.classList.remove("input-ok"); }
        if (shuklaWrap)  shuklaWrap.style.display  = "none";
        if (krishnaWrap) krishnaWrap.style.display = "block";
        markInputOk(purnimaNameEl);
        onHinduSelectionChange();
    } else if (which === "amavasya" && amavasyanNameEl?.value) {
        if (purnimaNameEl)  { purnimaNameEl.value = ""; purnimaNameEl.classList.remove("input-ok"); }
        if (krishnaSelEl)   { krishnaSelEl.value = ""; krishnaSelEl.classList.remove("input-ok"); }
        if (krishnaWrap) krishnaWrap.style.display = "none";
        if (shuklaWrap)  shuklaWrap.style.display  = "block";
        markInputOk(amavasyanNameEl);
        onHinduSelectionChange();
    }
}

/**
 * Called whenever year, tithi, or month-name selection changes.
 * Debounces 300 ms then fetches /hindu-calendar/convert for live preview.
 */
function onHinduSelectionChange() {
    _computedHinduEnglishDate = null;
    if (_hinduPreviewTimer) { clearTimeout(_hinduPreviewTimer); _hinduPreviewTimer = null; }

    const year       = getVal("sp_hindu_year");
    const purnima    = getVal("sp_purnima_name_id");
    const krishna    = getVal("sp_krishna_tithi_id");
    const amavasya   = getVal("sp_amavasya_name_id");
    const shukla     = getVal("sp_shukla_tithi_id");

    // Need year + at least a complete tithi pair to compute.
    const hasPurnima  = year && purnima  && krishna;
    const hasAmavasya = year && amavasya && shukla;

    if (!hasPurnima && !hasAmavasya) { _hideHinduPreview(); return; }

    // Show loading indicator
    const loading = document.getElementById("hindu-date-preview-loading");
    const preview = document.getElementById("hindu-date-preview");
    if (loading) loading.style.display = "block";
    if (preview) preview.style.display = "none";

    _hinduPreviewTimer = setTimeout(async () => {
        try {
            const params = new URLSearchParams({ year });
            if (hasPurnima)  { params.set("purnima_name_id", purnima);  params.set("krishna_tithi_id", krishna); }
            if (hasAmavasya) { params.set("amavasya_name_id", amavasya); params.set("shukla_tithi_id", shukla); }

            const res  = await fetch(`${API_BASE}/hindu-calendar/convert?${params}`);
            const data = await res.json();

            if (loading) loading.style.display = "none";

            if (data.english_date) {
                _computedHinduEnglishDate = data.english_date;
                const prevDate   = document.getElementById("hindu-preview-date");
                const prevDetail = document.getElementById("hindu-preview-detail");
                if (prevDate)   prevDate.textContent = `📅  ${data.display}`;
                if (prevDetail) prevDetail.innerHTML =
                    `${data.base_label}<br>${data.tithi_label}`;
                if (preview) preview.style.display = "block";
            } else {
                _hideHinduPreview();
            }
        } catch (err) {
            if (loading) loading.style.display = "none";
            console.error("Hindu date preview error:", err);
        }
    }, 300);
}

function _hideHinduPreview() {
    _computedHinduEnglishDate = null;
    const p = document.getElementById("hindu-date-preview");
    const l = document.getElementById("hindu-date-preview-loading");
    if (p) p.style.display = "none";
    if (l) l.style.display = "none";
}

function toggleSevaCalendar() {
    const t = document.getElementById("sp_calendar_type").value;
    const engWrap  = document.getElementById("sp-english-date-wrap");
    const hindWrap = document.getElementById("sp-hindu-date-wrap");
    if (t === "English") {
        if (engWrap)  engWrap.style.display  = "block";
        if (hindWrap) hindWrap.style.display = "none";
        _resetHinduFields(); clearFieldError("sp_english_date","err_sp_date");
    } else {
        if (engWrap)  engWrap.style.display  = "none";
        if (hindWrap) hindWrap.style.display = "block";
        setVal("sp_english_date",""); clearFieldError("sp_english_date","err_sp_date");
    }
}

function _resetHinduFields() {
    ["sp_purnima_name_id","sp_amavasya_name_id","sp_krishna_tithi_id","sp_shukla_tithi_id"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ""; el.classList.remove("input-ok"); }
    });
    const kw = document.getElementById("sp-krishna-tithi-wrap");
    const sw = document.getElementById("sp-shukla-tithi-wrap");
    if (kw) kw.style.display = "none";
    if (sw) sw.style.display = "none";
    _hideHinduPreview();
    _clearHinduDateError();
}
function _clearHinduDateError() { const el = document.getElementById("err_sp_hindu_date"); if (el) { el.textContent = ""; el.style.display = "none"; } }
function _showHinduDateError(msg) { const el = document.getElementById("err_sp_hindu_date"); if (el) { el.textContent = msg; el.style.display = "block"; } }

/**
 * Build a short human-readable label for a Hindu-calendar seva_person.
 * Used in the UI when seva_english_date is not available (legacy records).
 */
function _buildHinduDateLabel(sp) {
    if (!sp) return "—";
    if (sp.seva_english_date) return sp.seva_english_date;
    // Fall back to the stored human string if present
    if (sp.seva_hindu_date) return sp.seva_hindu_date;
    return "Hindu Calendar";
}


/* ════════════════════════════════════════════════════════════
   12. RELATION CARDS
════════════════════════════════════════════════════════════ */
function addSevaPersonRelation(prefill) {
    const idx = _sprIndex++;
    const div = document.createElement("div");
    div.className = "relation-card sp-relation-item";
    div.id = `spr-item-${idx}`;
    div.innerHTML = buildSevaPersonRelationHTML("spr_", idx, prefill);
    document.getElementById("sp-relations-list").appendChild(div);
    populateSevaPersonRelationDropdowns("spr_", idx, prefill);
    toggleRelProfessionFields("spr_", idx);
}

function buildSevaPersonRelationHTML(prefix, idx, p) {
    const rt   = p?.relation_type || "";
    const gen  = p?.gender        || "";
    const prof = p?.profession    || "";
return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <strong style="color:#E8821A;">Family Member #${idx + 1}</strong>
    <button class="btn-danger" style="padding:6px 14px;font-size:12px;"
        onclick="document.getElementById('spr-item-${idx}').remove()">✕ Remove</button>
</div>
<div class="form-grid three">
    <div class="form-group"><label>FIRST NAME <span>*</span></label>
        <input type="text" id="${prefix}first_${idx}" value="${p?.first_name||""}"
            oninput="relValidateName('${prefix}first_${idx}','${prefix}err_first_${idx}',true,2)"
            onblur="relValidateName('${prefix}first_${idx}','${prefix}err_first_${idx}',true,2)">
        <span class="field-error" id="${prefix}err_first_${idx}" role="alert"></span></div>
    <div class="form-group"><label>MIDDLE NAME</label>
        <input type="text" id="${prefix}middle_${idx}" value="${p?.middle_name||""}">
        <span class="field-error" id="${prefix}err_middle_${idx}" role="alert"></span></div>
    <div class="form-group"><label>LAST NAME <span>*</span></label>
        <input type="text" id="${prefix}last_${idx}" value="${p?.last_name||""}"
            oninput="relValidateName('${prefix}last_${idx}','${prefix}err_last_${idx}',true,1)"
            onblur="relValidateName('${prefix}last_${idx}','${prefix}err_last_${idx}',true,1)">
        <span class="field-error" id="${prefix}err_last_${idx}" role="alert"></span></div>
</div>
<div class="form-grid three">
    <div class="form-group"><label>RELATION TYPE <span>*</span></label>
        <select id="${prefix}rel_type_${idx}"
            onchange="onRelationTypeChange('${prefix}',${idx});clearError('${prefix}rel_type_${idx}','${prefix}err_rel_type_${idx}')">
            <option value="" disabled ${!rt?"selected":""}>Select</option>
            ${["Husband","Wife","Son","Daughter","Grandson","Granddaughter","Other"].map(r=>`<option value="${r}" ${rt===r||(r==="Other"&&rt&&!["Husband","Wife","Son","Daughter","Grandson","Granddaughter"].includes(rt))?"selected":""}>${r}</option>`).join("")}
        </select>
        <input type="text" id="${prefix}rel_other_${idx}" placeholder="Enter relation (e.g. Uncle, Aunt…)" maxlength="100"
            style="display:${rt&&!["Husband","Wife","Son","Daughter","Grandson","Granddaughter"].includes(rt)?"block":"none"};margin-top:8px;"
            value="${["Husband","Wife","Son","Daughter","Grandson","Granddaughter"].includes(rt)?"":rt}"
            oninput="clearError('${prefix}rel_type_${idx}','${prefix}err_rel_type_${idx}')"
            onblur="validateRelOther('${prefix}',${idx})">
        <span class="field-error" id="${prefix}err_rel_type_${idx}" role="alert"></span></div>
    <div class="form-group"><label>GENDER <span>*</span></label>
        <select id="${prefix}gender_${idx}" onchange="clearError('${prefix}gender_${idx}','${prefix}err_gender_${idx}')">
            <option value="" disabled ${!gen?"selected":""}>Select</option>
            <option value="Male"   ${gen==="Male"  ?"selected":""}>Male</option>
            <option value="Female" ${gen==="Female"?"selected":""}>Female</option>
        </select>
        <span class="field-error" id="${prefix}err_gender_${idx}" role="alert"></span></div>
    <div class="form-group"><label>DATE OF BIRTH</label>
        <input type="date" id="${prefix}dob_${idx}" value="${p?.birthdate||""}"
            onchange="relValidateDob('${prefix}dob_${idx}','${prefix}err_dob_${idx}')">
        <span class="field-error" id="${prefix}err_dob_${idx}" role="alert"></span></div>
</div>
<div class="form-grid">
    <div class="form-group"><label>EMAIL</label>
        <input type="email" id="${prefix}email_${idx}" value="${p?.email||""}"
            oninput="relValidateEmail('${prefix}email_${idx}','${prefix}err_email_${idx}')"
            onblur="relValidateEmail('${prefix}email_${idx}','${prefix}err_email_${idx}')">
        <span class="field-error" id="${prefix}err_email_${idx}" role="alert"></span></div>
    <div class="form-group"><label>PROFESSION</label>
        <select id="${prefix}prof_${idx}" onchange="toggleRelProfessionFields('${prefix}',${idx})">
            <option value="">Select (Optional)</option>
            <option value="Work"    ${prof==="Work"   ?"selected":""}>Work</option>
            <option value="Student" ${prof==="Student"?"selected":""}>Student</option>
        </select></div>
</div>
<div class="form-group rel-phone-group">
    <label>PHONE</label>
    <div class="whatsapp-input-row">
        <select class="country-select" id="${prefix}phone_country_${idx}" aria-label="Country dial code"
            onchange="onPhoneCountryChange(this,'${prefix}phone_dial_${idx}','${prefix}phone_hint_${idx}')"></select>
        <span class="dial-code-tag" id="${prefix}phone_dial_${idx}">+91</span>
        <input type="text" id="${prefix}phone_num_${idx}" placeholder="9876543210" maxlength="15" inputmode="numeric"
            oninput="this.value=this.value.replace(/\\D/g,'');relValidatePhone('${prefix}phone_num_${idx}','${prefix}err_phone_${idx}')"
            onblur="relValidatePhone('${prefix}phone_num_${idx}','${prefix}err_phone_${idx}')">
    </div>
    <span class="phone-digits-hint" id="${prefix}phone_hint_${idx}">ⓘ Enter exactly 10 digits for India</span>
    <span class="field-error" id="${prefix}err_phone_${idx}" role="alert"></span>
</div>
<div id="${prefix}inst_wrap_${idx}" style="display:none;margin-bottom:16px;">
    <div class="form-group"><label>COMPANY / WORKPLACE NAME</label>
        <input type="text" id="${prefix}inst_${idx}" value="${p?.institution||''}" placeholder="E.g. Tata Consultancy Services">
        <span class="field-error" id="${prefix}err_inst_${idx}" role="alert"></span></div>
</div>
<div class="form-grid three">
    <div class="form-group"><label>BIRTH STAR (NAKSHATRA) <span>*</span></label>
        <select id="${prefix}birthstar_${idx}" onchange="onRelationBirthstarChange('${prefix}',${idx});clearError('${prefix}birthstar_${idx}','${prefix}err_birthstar_${idx}')">
            <option value="" disabled selected>— Select Birth Star —</option></select>
        <span class="field-error" id="${prefix}err_birthstar_${idx}" role="alert"></span></div>
    <div class="form-group"><label>ZODIAC (RASHI) <span>*</span></label>
        <select id="${prefix}zodiac_${idx}" onchange="onRelationZodiacChange('${prefix}',${idx});clearError('${prefix}zodiac_${idx}','${prefix}err_zodiac_${idx}')">
            <option value="" disabled selected>— Select Zodiac —</option></select>
        <span class="field-error" id="${prefix}err_zodiac_${idx}" role="alert"></span></div>
    <div class="form-group"><label>GOTRA <span>*</span></label>
        <select id="${prefix}gotra_${idx}" onchange="handleGotraChange('${prefix}gotra_${idx}','${prefix}gw_${idx}');clearError('${prefix}gotra_${idx}','${prefix}err_gotra_${idx}')">
            <option value="">Loading...</option></select>
        <span class="field-error" id="${prefix}err_gotra_${idx}" role="alert"></span></div>
</div>
<div id="${prefix}gw_${idx}" style="display:none;margin-bottom:15px;">
    <div class="form-group"><label>ENTER NEW GOTRA</label>
        <div class="form-row">
            <input type="text" id="${prefix}gc_${idx}" placeholder="Type gotra name">
            <button class="btn-outline" onclick="saveNewGotra('${prefix}gotra_${idx}','${prefix}gc_${idx}','${prefix}gw_${idx}')">Save Gotra</button>
        </div></div>
</div>
<hr style="margin:10px 0 0;">
`; }

function toggleRelProfessionFields(prefix, idx) {
    const prof  = document.getElementById(`${prefix}prof_${idx}`)?.value;
    const wrap  = document.getElementById(`${prefix}inst_wrap_${idx}`);
    const input = document.getElementById(`${prefix}inst_${idx}`);
    if (prof === "Work") { if (wrap) wrap.style.display = "block"; }
    else { if (wrap) wrap.style.display = "none"; if (input) input.value = ""; }
}

function populateRelPhoneCountry(prefix, idx, prefilledPhone) {
    const selId  = `${prefix}phone_country_${idx}`;
    const dialId = `${prefix}phone_dial_${idx}`;
    const numId  = `${prefix}phone_num_${idx}`;
    const hintId = `${prefix}phone_hint_${idx}`;
    const sel    = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = "";
    COUNTRIES.forEach(c => {
        const o = document.createElement("option");
        o.value = c.dial; o.textContent = `${c.name} (${c.dial})`;
        if (c.code === "IN") o.selected = true;
        sel.appendChild(o);
    });
    // Pre-fill from existing phone number
    if (prefilledPhone) {
        const sorted = [...COUNTRIES].sort((a,b) => b.dial.length - a.dial.length);
        const match  = sorted.find(c => prefilledPhone.startsWith(c.dial) && c.dial !== "+");
        const numEl  = document.getElementById(numId);
        if (match) {
            sel.value = match.dial;
            if (numEl) numEl.value = prefilledPhone.slice(match.dial.length).replace(/\D/g,"");
        } else if (numEl) {
            numEl.value = prefilledPhone.replace(/\D/g,"");
        }
    }
    // Always fire hint update with direct IDs
    onPhoneCountryChange(sel, dialId, hintId);
}

function populateSevaPersonRelationDropdowns(prefix, idx, p) {
    populateSelect(`${prefix}zodiac_${idx}`, _zodiacList, "id","zodiac_name","Select Zodiac", p?.zodiac_id);
    if (p?.zodiac_id && p?.birthstar_id) onZodiacChange(`${prefix}zodiac_${idx}`,`${prefix}birthstar_${idx}`, p.birthstar_id);
    else populateSelect(`${prefix}birthstar_${idx}`, _birthstarList, "id","birthstar_name","Select Birth Star", p?.birthstar_id);
    populateGotraSelect(`${prefix}gotra_${idx}`, _gotraList, p?.gotra_id);
    populateRelPhoneCountry(prefix, idx, p?.phone || "");
}

function extractSevaPersonRelationData(item) {
    const idx = item.id.replace("spr-item-","");
    const p   = "spr_";
    const prof = getEl(`${p}prof_${idx}`)?.value || "";
    return {
        relation_type: getRelationTypeValue(p, idx),
        first_name:    (getEl(`${p}first_${idx}`)?.value  || "").trim(),
        middle_name:   (getEl(`${p}middle_${idx}`)?.value || "").trim() || null,
        last_name:     (getEl(`${p}last_${idx}`)?.value   || "").trim(),
        gender:        getEl(`${p}gender_${idx}`)?.value  || "Male",
        zodiac_id:     parseInt(getEl(`${p}zodiac_${idx}`)?.value)    || null,
        birthstar_id:  parseInt(getEl(`${p}birthstar_${idx}`)?.value) || null,
        gotra_id: (() => { const v = getEl(`${p}gotra_${idx}`)?.value; return (v && v !== "__other__") ? parseInt(v) : null; })(),
        birthdate:    getEl(`${p}dob_${idx}`)?.value   || null,
        email:        (getEl(`${p}email_${idx}`)?.value || "").trim() || null,
        phone: (() => { const dial=(getEl(`${p}phone_dial_${idx}`)?.textContent||"").trim(); const num=(getEl(`${p}phone_num_${idx}`)?.value||"").trim(); return num?(dial+num):null; })(),
        profession:  prof || null,
        designation: null,
        institution: prof==="Work"?((getEl(`${p}inst_${idx}`)?.value||"").trim()||null):null,
    };
}

const _STANDARD_REL_TYPES = ["Husband","Wife","Son","Daughter","Grandson","Granddaughter"];
function onRelationTypeChange(prefix, idx) {
    const selEl=document.getElementById(`${prefix}rel_type_${idx}`);
    const otherEl=document.getElementById(`${prefix}rel_other_${idx}`);
    if (!selEl||!otherEl) return;
    if (selEl.value==="Other") { otherEl.style.display="block"; otherEl.focus(); }
    else { otherEl.style.display="none"; otherEl.value=""; otherEl.classList.remove("input-ok","input-error"); }
    markInputOk(selEl);
}
function validateRelOther(prefix, idx) {
    const selEl=document.getElementById(`${prefix}rel_type_${idx}`);
    const otherEl=document.getElementById(`${prefix}rel_other_${idx}`);
    const errEl=document.getElementById(`${prefix}err_rel_type_${idx}`);
    if (!selEl||!otherEl) return true;
    if (selEl.value==="Other") {
        const v=otherEl.value.trim();
        if (!v) { if(errEl){errEl.textContent="⚠ Please enter the relation type.";errEl.style.display="block";} otherEl.classList.add("input-error"); return false; }
        otherEl.classList.remove("input-error"); otherEl.classList.add("input-ok");
        if(errEl){errEl.textContent="";errEl.style.display="none";}
    }
    return true;
}
function getRelationTypeValue(prefix, idx) {
    const selEl=document.getElementById(`${prefix}rel_type_${idx}`);
    const otherEl=document.getElementById(`${prefix}rel_other_${idx}`);
    if (!selEl) return "";
    if (selEl.value==="Other") return (otherEl?.value||"").trim();
    return selEl.value;
}

function validateRelationCards() {
    let ok = true;
    document.querySelectorAll(".sp-relation-item").forEach(item => {
        const idx = item.id.replace("spr-item-","");
        const p   = "spr_";
        if (!relValidateName(`${p}first_${idx}`,`${p}err_first_${idx}`,true,2)) ok=false;
        if (!relValidateName(`${p}last_${idx}`, `${p}err_last_${idx}`, true,1)) ok=false;
        if (!getEl(`${p}rel_type_${idx}`)?.value) { showError(`${p}rel_type_${idx}`,`${p}err_rel_type_${idx}`,"⚠ Select a relation type."); ok=false; }
        else if (getEl(`${p}rel_type_${idx}`)?.value==="Other") { if(!validateRelOther(p,idx)) ok=false; }
        else clearError(`${p}rel_type_${idx}`,`${p}err_rel_type_${idx}`);
        if (!getEl(`${p}gender_${idx}`)?.value) { showError(`${p}gender_${idx}`,`${p}err_gender_${idx}`,"⚠ Select gender."); ok=false; }
        else clearError(`${p}gender_${idx}`,`${p}err_gender_${idx}`);
        if (!getEl(`${p}birthstar_${idx}`)?.value) { showError(`${p}birthstar_${idx}`,`${p}err_birthstar_${idx}`,"⚠ Select birth star."); ok=false; }
        else clearError(`${p}birthstar_${idx}`,`${p}err_birthstar_${idx}`);
        if (!getEl(`${p}zodiac_${idx}`)?.value) { showError(`${p}zodiac_${idx}`,`${p}err_zodiac_${idx}`,"⚠ Select zodiac."); ok=false; }
        else clearError(`${p}zodiac_${idx}`,`${p}err_zodiac_${idx}`);
        const g=getEl(`${p}gotra_${idx}`)?.value||"";
        if (!g||g==="__other__") { showError(`${p}gotra_${idx}`,`${p}err_gotra_${idx}`,"⚠ Select or save a gotra."); ok=false; }
        else clearError(`${p}gotra_${idx}`,`${p}err_gotra_${idx}`);
    });
    return ok;
}

function startFresh() {
    // ── FIX #1: clear any in-flight image polling so it can't interfere
    //           with the next booking's image flow ──────────────────────
    if (_sevaImagePollTimer) {
        clearInterval(_sevaImagePollTimer);
        _sevaImagePollTimer = null;
    }
    _lastBooking = null;
    _donorMode = "new";
    _editingSevaDonationId = null;
    _updateSevaData = null;
    // Reset Step 3 & 4 button labels
    const s3btn = document.querySelector("#step-3 .btn-primary");
    if (s3btn) s3btn.textContent = "Next: Seva Person →";
    const s4btn = getEl("btn-submit-all");
    if (s4btn) s4btn.textContent = "Submit Seva Booking →";
    _resetEmailVerification();
    _resetPhoneVerification();
    clearDonorForm();
    document.getElementById("phone_number").value = "";
    const banner = document.getElementById("donor-found-banner");
    if (banner) banner.style.display = "none";
    _clearSevaAndPersonForms();
    _donorId = null; _donorPhone = "";
    _clearSession();
    goToStep(1);
}


/* ════════════════════════════════════════════════════════════
   13. GOTRA — Inline Add
════════════════════════════════════════════════════════════ */
function handleGotraChange(selectId, wrapId) {
    const sel = document.getElementById(selectId);
    document.getElementById(wrapId).style.display = (sel.value === "__other__") ? "block" : "none";
}

async function saveNewGotra(selectId, inputId, wrapId) {
    const name = document.getElementById(inputId).value.trim();
    if (!name) return;
    try {
        const res  = await fetch(`${API_BASE}/gotra/add`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ gotra_name: name }) });
        const data = await res.json();
        if (data.id) {
            if (!_gotraList.find(g => g.id === data.id)) _gotraList.push({ id: data.id, gotra_name: data.gotra_name });
            refreshAllGotraSelects(selectId, data.id);
            document.getElementById(wrapId).style.display = "none";
            document.getElementById(inputId).value = "";
        }
    } catch (e) { alert("Error saving gotra: " + e.message); }
}

function refreshAllGotraSelects(focusSelectId, focusValue) {
    document.querySelectorAll("select[id*='gotra']").forEach(sel => {
        if (sel.tagName !== "SELECT") return;
        if (sel.id.includes("gc_") || sel.id.includes("custom_input")) return;
        const currentVal = (sel.id === focusSelectId) ? focusValue : (parseInt(sel.value) || null);
        populateGotraSelect(sel.id, _gotraList, currentVal);
    });
}


/* ════════════════════════════════════════════════════════════
   14. AUTH — LOGIN / LOGOUT (Admin & Staff)
════════════════════════════════════════════════════════════ */
// ─── AUTH MODAL STATE ──────────────────────────────────────────
let _setupOtpVerified  = false;   // email verified in setup flow
let _setupOtpEmail     = "";
let _setupResendTimer  = null;
let _smtpConfigured    = false;   // populated from /auth/setup-status

// Admin setup — phone OTP state
let _setupPhoneVerified     = false;
let _setupPhoneNumber       = "";   // full number with country code
let _setupPhoneResendTimer  = null;

async function _checkSetupStatus() {
    try {
        const res = await fetch(`${API_BASE}/auth/setup-status`);
        if (!res.ok) return;
        const data = await res.json();
        _smtpConfigured = data.smtp_configured === true;
        _configureSetupForm(_smtpConfigured);
        if (!data.setup_complete) {
            // First launch — open modal in setup mode
            const overlay = document.getElementById("admin-modal-overlay");
            if (overlay) overlay.style.display = "flex";
            switchAuthView("setup");
        }
    } catch (e) { /* server unreachable on first load — ignore silently */ }
}

function _configureSetupForm(smtpOk) {
    // Show/hide the right email section based on SMTP availability
    var withOtp    = document.getElementById("setup-email-otp-section");
    var withoutOtp = document.getElementById("setup-email-optional-section");
    var notice     = document.getElementById("setup-no-smtp-notice");
    if (smtpOk) {
        if (withOtp)    withOtp.style.display    = "block";
        if (withoutOtp) withoutOtp.style.display = "none";
        if (notice)     notice.style.display     = "none";
    } else {
        if (withOtp)    withOtp.style.display    = "none";
        if (withoutOtp) withoutOtp.style.display = "block";
        if (notice)     notice.style.display     = "block";
    }
}

function openAdminModal() {
    const overlay = document.getElementById("admin-modal-overlay");
    if (!overlay) return;
    overlay.style.display = "flex";
    // Show login by default, hide all other views
    var loginView  = document.getElementById("auth-login-view");
    var setupView  = document.getElementById("auth-setup-view");
    var forgotView = document.getElementById("auth-forgot-view");
    if (loginView)  loginView.style.display  = "block";
    if (setupView)  setupView.style.display  = "none";
    if (forgotView) forgotView.style.display = "none";
    ["admin-login-result","err_alm","err_alp"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = "";
    });
}

function closeAdminModal() {
    const overlay = document.getElementById("admin-modal-overlay");
    if (overlay) overlay.style.display = "none";
}

function switchAuthView(view) {
    // view: "setup" | "login" | "forgot"
    try {
        var views = { setup: "auth-setup-view", login: "auth-login-view", forgot: "auth-forgot-view" };
        for (var k in views) {
            var el = document.getElementById(views[k]);
            if (el) el.style.display = (k === view) ? "block" : "none";
        }
        ["setup-result","admin-login-result"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.textContent = "";
        });
        // Reset forgot password steps when opening forgot view
        if (view === "forgot") _resetForgotForm();
    } catch(e) {
        console.error("switchAuthView error:", e);
    }
}

// Keep stub for backward-compat
function switchAdminTab(tab) {}


// ─── ADMIN FIRST-TIME SETUP ─────────────────────────────────
function onSetupEmailInput() {
    const val = (getEl("setup_email")?.value || "").trim();
    const btn = getEl("btn_setup_send_otp");
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    if (btn) btn.disabled = !isValid;
    if (_setupOtpVerified && val.toLowerCase() !== _setupOtpEmail) _resetSetupOtp();
    clearError("setup_email","err_setup_email");
}

function _resetSetupOtp() {
    _setupOtpVerified = false; _setupOtpEmail = "";
    const otpBox = getEl("setup_otp_box"); if (otpBox) otpBox.style.display = "none";
    const sendBtn = getEl("btn_setup_send_otp"); if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
    const okSpan = getEl("ok_setup_email"); if (okSpan) okSpan.textContent = "";
    setVal("setup_otp_input","");
    const statusEl = getEl("setup_otp_status"); if (statusEl) statusEl.textContent = "";
    if (_setupResendTimer) { clearInterval(_setupResendTimer); _setupResendTimer = null; }
}


// ─── ADMIN SETUP — PHONE SMS OTP ─────────────────────────────────

function onSetupPhoneInput() {
    const val = (getEl("setup_phone")?.value || "").replace(/\D/g, "");
    setVal("setup_phone", val);
    const btn = getEl("btn_setup_send_phone_otp");
    if (btn) btn.disabled = val.length < 10;
    clearError("setup_phone", "err_setup_phone");
    // If user edits phone after verifying, reset verification
    if (_setupPhoneVerified) resetSetupPhoneOtp();
}

async function sendSetupPhoneOtp() {
    const num = (getEl("setup_phone")?.value || "").replace(/\D/g, "").trim();
    if (num.length < 10) {
        showError("setup_phone", "err_setup_phone", "⚠ Enter a valid phone number (min 10 digits).");
        return;
    }
    // Always use +91 for India; prepend country code
    const full = "+" + (num.startsWith("91") ? num : "91" + num);
    _setupPhoneNumber = full;

    const sendBtn   = getEl("btn_setup_send_phone_otp");
    const statusEl  = getEl("setup_phone_otp_status");
    const errEl     = getEl("err_setup_phone");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }
    if (errEl)   { errEl.textContent = ""; errEl.style.display = "none"; }

    try {
        const res  = await fetch(`${API_BASE}/auth/setup/send-phone-otp`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ phone_number: full }),
        });
        const data = await res.json();

        if (!res.ok) {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send OTP"; }
            showError("setup_phone", "err_setup_phone", `⚠ ${data.detail || "Failed to send OTP."}`);
            return;
        }

        // Show OTP input box
        const sentDisplay = getEl("setup-phone-sent-display");
        if (sentDisplay) sentDisplay.textContent = data.masked_phone || full;
        const entryDiv = getEl("setup-phone-entry");
        if (entryDiv) entryDiv.style.display = "none";
        const otpBox = getEl("setup-phone-otp-box");
        if (otpBox) otpBox.style.display = "block";

        setVal("setup_phone_otp_input", "");
        const verifyBtn = getEl("btn_setup_verify_phone_otp");
        if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verify"; }
        if (statusEl) { statusEl.textContent = `✉ OTP sent. Check your SMS inbox.`; statusEl.style.color = "#5C3D2E"; }
        _startSetupPhoneResendCountdown(30);

    } catch (e) {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send OTP"; }
        showError("setup_phone", "err_setup_phone", `⚠ Cannot reach server. (${e.message})`);
    }
}

function onSetupPhoneOtpInput() {
    const val = (getEl("setup_phone_otp_input")?.value || "").replace(/\D/g, "");
    setVal("setup_phone_otp_input", val);
    const btn = getEl("btn_setup_verify_phone_otp");
    if (btn) btn.disabled = val.length !== 6;
    const statusEl = getEl("setup_phone_otp_status");
    if (statusEl) statusEl.textContent = "";
}

async function verifySetupPhoneOtp() {
    const otp      = (getEl("setup_phone_otp_input")?.value || "").trim();
    const statusEl = getEl("setup_phone_otp_status");
    const verifyBtn = getEl("btn_setup_verify_phone_otp");
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verifying…"; }
    if (statusEl)  { statusEl.textContent = "⏳ Verifying…"; statusEl.style.color = "#8B5E3C"; }

    try {
        const res  = await fetch(`${API_BASE}/auth/setup/verify-phone-otp`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ phone_number: _setupPhoneNumber, otp }),
        });
        const data = await res.json();

        if (!res.ok) {
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify"; }
            if (statusEl)  { statusEl.textContent = `❌ ${data.detail || "Incorrect OTP."}`; statusEl.style.color = "#c62828"; }
            return;
        }

        // Verified!
        _setupPhoneVerified = true;
        if (_setupPhoneResendTimer) { clearInterval(_setupPhoneResendTimer); _setupPhoneResendTimer = null; }
        const otpBox = getEl("setup-phone-otp-box");
        if (otpBox) otpBox.style.display = "none";
        const badge = getEl("setup-phone-verified-badge");
        if (badge) badge.style.display = "block";
        const entryDiv = getEl("setup-phone-entry");
        if (entryDiv) entryDiv.style.display = "none";

    } catch (e) {
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify"; }
        if (statusEl)  { statusEl.textContent = `⚠ Cannot reach server.`; statusEl.style.color = "#c62828"; }
    }
}

async function resendSetupPhoneOtp() {
    if (_setupPhoneResendTimer) { clearInterval(_setupPhoneResendTimer); _setupPhoneResendTimer = null; }
    const resendBtn = getEl("btn_setup_resend_phone_otp");
    if (resendBtn) resendBtn.style.display = "none";
    setVal("setup_phone_otp_input", "");
    const verifyBtn = getEl("btn_setup_verify_phone_otp");
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verify"; }
    const statusEl = getEl("setup_phone_otp_status");
    if (statusEl) statusEl.textContent = "";

    try {
        const res  = await fetch(`${API_BASE}/auth/setup/send-phone-otp`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ phone_number: _setupPhoneNumber }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (statusEl) { statusEl.textContent = `✉ New OTP sent.`; statusEl.style.color = "#5C3D2E"; }
            _startSetupPhoneResendCountdown(30);
        } else {
            if (statusEl) { statusEl.textContent = `⚠ ${data.detail || "Failed to resend OTP."}`; statusEl.style.color = "#c62828"; }
        }
    } catch (e) {
        if (statusEl) { statusEl.textContent = `⚠ Cannot reach server.`; statusEl.style.color = "#c62828"; }
    }
}

function resetSetupPhoneOtp() {
    _setupPhoneVerified = false;
    _setupPhoneNumber   = "";
    if (_setupPhoneResendTimer) { clearInterval(_setupPhoneResendTimer); _setupPhoneResendTimer = null; }

    setVal("setup_phone", "");
    setVal("setup_phone_otp_input", "");

    const entryDiv = getEl("setup-phone-entry");
    if (entryDiv) entryDiv.style.display = "block";
    const otpBox = getEl("setup-phone-otp-box");
    if (otpBox) otpBox.style.display = "none";
    const badge = getEl("setup-phone-verified-badge");
    if (badge) badge.style.display = "none";

    const sendBtn = getEl("btn_setup_send_phone_otp");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Send OTP"; }
    const statusEl = getEl("setup_phone_otp_status");
    if (statusEl) statusEl.textContent = "";
    const errEl = getEl("err_setup_phone");
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    const errOtp = getEl("err_setup_phone_otp");
    if (errOtp) { errOtp.textContent = ""; errOtp.style.display = "none"; }
}

function _startSetupPhoneResendCountdown(secs) {
    const resendBtn = getEl("btn_setup_resend_phone_otp");
    if (!resendBtn) return;
    let remaining = secs;
    resendBtn.style.display = "inline";
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${remaining}s`;
    _setupPhoneResendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_setupPhoneResendTimer); _setupPhoneResendTimer = null;
            resendBtn.disabled    = false;
            resendBtn.textContent = "Resend OTP";
        } else {
            resendBtn.textContent = `Resend in ${remaining}s`;
        }
    }, 1000);
}

async function sendSetupOtp() {
    const email = (getEl("setup_email")?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        showError("setup_email","err_setup_email","⚠ Enter a valid email address.");
        return;
    }
    const sendBtn = getEl("btn_setup_send_otp");
    const otpBox  = getEl("setup_otp_box");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending..."; }
    try {
        const res  = await fetch(`${API_BASE}/email/send-otp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email }) });
        const data = await res.json();
        if (res.ok && data.success) {
            _setupOtpEmail = email.toLowerCase();
            if (otpBox) otpBox.style.display = "block";
            if (sendBtn) { sendBtn.textContent = "Resend OTP"; sendBtn.disabled = false; }
            setVal("setup_otp_input","");
            const statusEl = getEl("setup_otp_status");
            if (statusEl) { statusEl.textContent = `✉ OTP sent to ${email}.`; statusEl.style.color = "#5C3D2E"; }
            _startSetupResendCountdown(30);
        } else {
            if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
            showError("setup_email","err_setup_email", `⚠ ${data.detail || "Failed to send OTP."}`);
        }
    } catch (e) {
        if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
        showError("setup_email","err_setup_email","⚠ Network error. Please try again.");
    }
}

function _startSetupResendCountdown(secs) {
    const sendBtn = getEl("btn_setup_send_otp");
    if (!sendBtn) return;
    let remaining = secs;
    sendBtn.disabled = true;
    sendBtn.textContent = `Resend in ${remaining}s`;
    if (_setupResendTimer) clearInterval(_setupResendTimer);
    _setupResendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_setupResendTimer); _setupResendTimer = null;
            sendBtn.disabled = false; sendBtn.textContent = "Resend OTP";
        } else {
            sendBtn.textContent = `Resend in ${remaining}s`;
        }
    }, 1000);
}

function onSetupOtpInput() {
    const val = (getEl("setup_otp_input")?.value || "").replace(/\D/g,"");
    setVal("setup_otp_input", val);
    const btn = getEl("btn_setup_verify_otp");
    if (btn) btn.disabled = val.length !== 6;
}

async function verifySetupOtp() {
    const email = (getEl("setup_email")?.value || "").trim();
    const otp   = (getEl("setup_otp_input")?.value || "").trim();
    const statusEl = getEl("setup_otp_status");
    if (statusEl) { statusEl.textContent = "⏳ Verifying..."; statusEl.style.color = "#8B5E3C"; }
    try {
        const res  = await fetch(`${API_BASE}/email/verify-otp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, otp }) });
        const data = await res.json();
        if (res.ok && data.success) {
            _setupOtpVerified = true;
            const otpBox  = getEl("setup_otp_box"); if (otpBox) otpBox.style.display = "none";
            const okSpan  = getEl("ok_setup_email"); if (okSpan) { okSpan.textContent = "✅ Email verified!"; okSpan.style.color = "#2e7d32"; }
            const sendBtn = getEl("btn_setup_send_otp"); if (sendBtn) { sendBtn.textContent = "✅ Verified"; sendBtn.disabled = true; }
            if (_setupResendTimer) { clearInterval(_setupResendTimer); _setupResendTimer = null; }
        } else {
            if (statusEl) { statusEl.textContent = `❌ ${data.detail || "Invalid OTP."}`; statusEl.style.color = "#c62828"; }
        }
    } catch (e) {
        if (statusEl) { statusEl.textContent = "⚠ Cannot reach server."; statusEl.style.color = "#c62828"; }
    }
}

async function submitAdminSetup() {
    const password = (document.getElementById("setup_password")?.value || "");
    const confirm  = (document.getElementById("setup_confirm_password")?.value || "");
    const resultEl = document.getElementById("setup-result");

    // Get email depending on which section is visible
    var email = "";
    if (_smtpConfigured) {
        email = (document.getElementById("setup_email")?.value || "").trim();
    } else {
        email = (document.getElementById("setup_email_optional")?.value || "").trim();
    }

    let ok = true;

    // ── Phone OTP is REQUIRED ──
    if (!_setupPhoneVerified) {
        const errOtp = document.getElementById("err_setup_phone_otp");
        if (errOtp) {
            errOtp.textContent = "⚠ Please verify your phone number with OTP before submitting.";
            errOtp.style.display = "block";
        }
        // Scroll to phone section
        document.getElementById("setup-phone-entry")?.scrollIntoView({ behavior: "smooth", block: "center" });
        ok = false;
    } else {
        const errOtp = document.getElementById("err_setup_phone_otp");
        if (errOtp) { errOtp.textContent = ""; errOtp.style.display = "none"; }
    }

    // Email OTP check only when SMTP is configured
    if (_smtpConfigured && email) {
        if (!_setupOtpVerified) {
            var errEl = document.getElementById("err_setup_email");
            if (errEl) { errEl.textContent = "⚠ Please verify your email with OTP first."; errEl.style.display = "block"; }
            ok = false;
        }
    }

    if (password.length < 6) {
        var errPw = document.getElementById("err_setup_password");
        if (errPw) { errPw.textContent = "⚠ Password must be at least 6 characters."; errPw.style.display = "block"; }
        ok = false;
    } else {
        var errPw2 = document.getElementById("err_setup_password");
        if (errPw2) { errPw2.textContent = ""; errPw2.style.display = "none"; }
    }

    if (password !== confirm) {
        var errCf = document.getElementById("err_setup_confirm");
        if (errCf) { errCf.textContent = "⚠ Passwords do not match."; errCf.style.display = "block"; }
        ok = false;
    } else {
        var errCf2 = document.getElementById("err_setup_confirm");
        if (errCf2) { errCf2.textContent = ""; errCf2.style.display = "none"; }
    }

    if (!ok) return;

    if (resultEl) { resultEl.textContent = "⏳ Creating Admin Panel account..."; resultEl.style.color = "#8B5E3C"; }
    try {
        const payload = {
            password:         password,
            confirm_password: confirm,
            email:            email || null,
            phone_number:     _setupPhoneNumber || null,   // verified phone number
        };
        const res  = await fetch(`${API_BASE}/auth/admin-setup`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            if (resultEl) { resultEl.textContent = `❌ ${data.detail || "Setup failed."}`; resultEl.style.color = "#c62828"; }
            return;
        }
        if (resultEl) { resultEl.textContent = `✅ ${data.message}`; resultEl.style.color = "#2e7d32"; }
        setTimeout(function() {
            switchAuthView("login");
            var unEl = document.getElementById("admin_login_mobile");
            if (unEl) unEl.value = "Administrator";
        }, 1800);
    } catch (e) {
        if (resultEl) { resultEl.textContent = "❌ Cannot reach server."; resultEl.style.color = "#c62828"; }
    }
}


// Normal user self-signup removed — users are created by admin only via Admin Panel → Users tab.


// ─── LOGIN ──────────────────────────────────────────────────
async function adminLogin() {
    const username = (getEl("admin_login_mobile")?.value || "").trim();
    const password = getEl("admin_login_password")?.value || "";
    const resultEl = getEl("admin-login-result");
    let ok = true;
    if (!username || username.length < 3) { showError("admin_login_mobile","err_alm","⚠ Username must be at least 3 characters."); ok=false; } else clearError("admin_login_mobile","err_alm");
    if (!password) { showError("admin_login_password","err_alp","⚠ Password is required."); ok=false; } else clearError("admin_login_password","err_alp");
    if (!ok) return;
    if (resultEl) { resultEl.textContent = "⏳ Logging in..."; resultEl.style.color = "#8B5E3C"; }
    try {
        const res  = await fetch(`${API_BASE}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ username, password }) });
        const data = await res.json();
        if (!res.ok) { if (resultEl) { resultEl.textContent = `❌ ${data.detail || "Login failed."}`; resultEl.style.color = "#c62828"; } return; }
        _adminLoggedIn = true;
        _adminUsername = data.username;
        _userIsAdmin   = data.is_admin === true || data.is_admin === 1;
        _userRoleName  = data.role_name || (_userIsAdmin ? "Admin Panel" : "Staff");
        _saveSession();
        _updateAdminHeaderUI();
        document.getElementById("admin-modal-overlay").style.display = "none";
    } catch (e) { if (resultEl) { resultEl.textContent = `❌ Cannot reach server.`; resultEl.style.color = "#c62828"; } }
}

function adminLogout() {
    _adminLoggedIn = false; _adminUsername = ""; _userIsAdmin = false; _userRoleName = "";
    _clearSession();
    _updateAdminHeaderUI();
}

function _updateAdminHeaderUI() {
    const badge       = document.getElementById("admin-logged-in-badge");
    const loginBtn    = document.getElementById("btn-admin-login-header");
    const usernameEl  = document.getElementById("admin-username-display");
    const roleBadge   = document.getElementById("user-role-badge");
    const loginHint   = document.getElementById("step1-login-hint");
    const sendOtpBtn  = document.getElementById("btn-send-phone-otp");
    const chpwBtn     = document.getElementById("btn-change-password-header");

    if (_adminLoggedIn) {
        if (badge)      badge.style.display = "flex";
        if (loginBtn)   loginBtn.style.display = "none";
        if (usernameEl) {
            usernameEl.textContent = `👤 ${_adminUsername}`;
            usernameEl.style.cursor = _userIsAdmin ? "pointer" : "default";
            usernameEl.title = _userIsAdmin ? "Click to open Admin Panel" : "";
        }
        if (roleBadge) {
            const label = _userRoleName || (_userIsAdmin ? "Admin Panel" : "STAFF");
            roleBadge.textContent      = label.toUpperCase();
            roleBadge.style.background = _userIsAdmin ? "#27ae60" : "#1565c0";
            roleBadge.style.cursor     = _userIsAdmin ? "pointer" : "default";
            roleBadge.title            = _userIsAdmin ? "Click to open Admin Panel" : "";
        }
        // Change Password button only visible to admins
        if (chpwBtn) chpwBtn.style.display = _userIsAdmin ? "inline-flex" : "none";
        if (loginHint)  loginHint.style.display = "none";
        if (sendOtpBtn) {
            sendOtpBtn.disabled    = false;
            sendOtpBtn.textContent = "Send OTP →";
            sendOtpBtn.classList.remove("btn-locked");
        }
        _hideLoginRequiredBanner();
    } else {
        if (badge)    badge.style.display = "none";
        if (loginBtn) loginBtn.style.display = "flex";
        if (chpwBtn)  chpwBtn.style.display = "none";
        if (loginHint) loginHint.style.display = "flex";
        if (sendOtpBtn) {
            sendOtpBtn.disabled    = false;
            sendOtpBtn.textContent = "Send OTP →";
            sendOtpBtn.classList.remove("btn-locked");
        }
    }
}


/* ════════════════════════════════════════════════════════════
   15. ADMIN PANEL (Seva + Gotra + Donors + Users)  v13.0
════════════════════════════════════════════════════════════ */

function openAdminPanel() {
    if (!_adminLoggedIn || !_userIsAdmin) { openAdminModal(); return; }
    document.getElementById("admin-panel-overlay").style.display = "flex";
    renderSevaManagerList();
    renderGotraManagerList();
}

function closeAdminPanel(event) {
    if (event && event.target !== document.getElementById("admin-panel-overlay") && event.type === "click") return;
    document.getElementById("admin-panel-overlay").style.display = "none";
}

function switchAdminPanelTab(tab) {
    const sections = { sevas:"ap-sevas", gotra:"ap-gotra", donors:"ap-donors", report:"ap-report", labelprint:"ap-labelprint", users:"ap-users" };
    const tabs     = { sevas:"aptab-sevas", gotra:"aptab-gotra", donors:"aptab-donors", report:"aptab-report", labelprint:"aptab-labelprint", users:"aptab-users" };
    Object.keys(sections).forEach(key => {
        const sec = document.getElementById(sections[key]);
        const t   = document.getElementById(tabs[key]);
        if (sec) sec.style.display = (key === tab) ? "block" : "none";
        if (t)   t.classList.toggle("active", key === tab);
    });
    if (tab === "sevas")   renderSevaManagerList();
    if (tab === "gotra")   renderGotraManagerList();
    if (tab === "donors")  loadAdminDonors();
    if (tab === "report")     initReportTab();
    if (tab === "labelprint") initLabelPrintTab();
    if (tab === "users")      { switchUserTab("users"); }
}

/* ── Seva Manager ── */
function renderSevaManagerList() {
    const cont = document.getElementById("seva-manager-list");
    if (!cont) return;
    if (!_sevaList.length) { cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">No sevas found.</p>`; return; }
    cont.innerHTML = _sevaList.map(s => {
        const desc = s.seva_description ? `<div class="seva-item-desc">${s.seva_description}</div>` : "";
        return `
        <div class="seva-item">
            <div class="seva-item-info">
                <div class="seva-item-name">${s.seva_name}</div>
                <div class="seva-item-amount">One-time: ₹${parseFloat(s.default_amount_one_time).toFixed(0)} &nbsp;|&nbsp; Regular: ₹${parseFloat(s.default_amount_regular).toFixed(0)}</div>
                ${desc}
            </div>
            <div class="seva-item-actions">
                <button class="btn-admin-edit" onclick="editSevaForm(${s.id},'${s.seva_name.replace(/'/g,"\\'")}',${s.default_amount_one_time},${s.default_amount_regular})">✏ Edit</button>
                <button class="btn-admin-delete" onclick="adminDeleteSeva(${s.id},'${s.seva_name.replace(/'/g,"\\'")}')">🗑 Delete</button>
            </div>
        </div>`;
    }).join("");
}

async function adminDeleteSeva(id, name) {
    if (!confirm(`Delete seva "${name}"?\n\nThis is blocked if any donations already reference it.`)) return;
    const resultEl = getEl("seva-form-result");
    try {
        // FIX #1: admin_username is now required by the backend
        const res  = await fetch(`${API_BASE}/admin/sevas/${id}?admin_username=${encodeURIComponent(_adminUsername)}`, { method:"DELETE" });
        const data = await res.json();
        if (!res.ok) { if(resultEl){resultEl.textContent=`❌ ${data.detail||"Cannot delete."}`;resultEl.style.color="#c62828";} return; }
        if(resultEl){resultEl.textContent=`✅ ${data.message}`;resultEl.style.color="#2e7d32";}
        await loadSevas(); renderSevaManagerList();
        resetSevaForm();
    } catch (e) { if(resultEl){resultEl.textContent="❌ Cannot reach server.";resultEl.style.color="#c62828";} }
}

function openSevaDetailPanel(id) { /* removed — no longer used */ }
function closeSevaDetailPanel(event) { /* removed — no longer used */ }

function editSevaForm(id, name, oneTime, regular) {
    // Find the seva to get its description
    const seva = _sevaList.find(s => s.id === id);
    setVal("seva_edit_id", id);
    setVal("seva_form_name", name);
    setVal("seva_form_description", seva?.seva_description || "");
    setVal("seva_form_one_time", parseFloat(oneTime).toFixed(2));
    setVal("seva_form_regular",  parseFloat(regular).toFixed(2));
    const t = document.getElementById("seva-form-title"); if (t) t.textContent = "✏ EDIT SEVA";
    const r = document.getElementById("seva-form-result"); if (r) r.textContent = "";
    // Update the Save button to say "Update"
    const saveBtn = document.querySelector("#seva-admin-form-box button.btn-primary");
    if (saveBtn) saveBtn.textContent = "💾 Update Seva";
    // Scroll the form into view
    const box = document.getElementById("seva-admin-form-box");
    if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetSevaForm() {
    ["seva_edit_id","seva_form_name","seva_form_description","seva_form_one_time","seva_form_regular"].forEach(id => setVal(id,""));
    const t = document.getElementById("seva-form-title"); if (t) t.textContent = "➕ ADD NEW SEVA";
    const r = document.getElementById("seva-form-result"); if (r) r.textContent = "";
    // Reset Save button text
    const saveBtn = document.querySelector("#seva-admin-form-box button.btn-primary");
    if (saveBtn) saveBtn.textContent = "💾 Save";
    ["seva_form_name","seva_form_one_time","seva_form_regular"].forEach(id => { const el=getEl(id); if(el) el.classList.remove("input-ok","input-error"); });
}

async function saveSevaForm() {
    const name    = (getEl("seva_form_name")?.value || "").trim();
    const desc    = (getEl("seva_form_description")?.value || "").trim();
    const oneTime = parseFloat(getEl("seva_form_one_time")?.value || "0");
    const regular = parseFloat(getEl("seva_form_regular")?.value || "0");
    const editId  = getEl("seva_edit_id")?.value || "";
    const resultEl = getEl("seva-form-result");
    let ok = true;
    if (!name) { showError("seva_form_name","err_seva_form_name","⚠ Seva name is required."); ok=false; } else clearError("seva_form_name","err_seva_form_name");
    if (isNaN(oneTime)||oneTime<0) { showError("seva_form_one_time","err_seva_form_one_time","⚠ Enter valid amount."); ok=false; } else clearError("seva_form_one_time","err_seva_form_one_time");
    if (isNaN(regular)||regular<0) { showError("seva_form_regular","err_seva_form_regular","⚠ Enter valid amount."); ok=false; } else clearError("seva_form_regular","err_seva_form_regular");
    if (!ok) return;
    const payload = { seva_name: name, seva_description: desc || null, default_amount_one_time: oneTime, default_amount_regular: regular, is_active: true };
    if (resultEl) { resultEl.textContent = "⏳ Saving..."; resultEl.style.color = "#8B5E3C"; }
    try {
        // FIX #1: admin_username is now required by the backend on all seva admin endpoints
        const sevaUrl = editId
            ? `${API_BASE}/admin/sevas/${editId}?admin_username=${encodeURIComponent(_adminUsername)}`
            : `${API_BASE}/admin/sevas?admin_username=${encodeURIComponent(_adminUsername)}`;
        const res = await fetch(sevaUrl, {
            method: editId ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) { if(resultEl){resultEl.textContent=`❌ ${data.detail||"Error."}`;resultEl.style.color="#c62828";} return; }
        if(resultEl){resultEl.textContent=editId?"✅ Seva updated!":"✅ Seva added!";resultEl.style.color="#2e7d32";}
        await loadSevas(); renderSevaManagerList();
        if (!editId) resetSevaForm();
        else setTimeout(() => { if(resultEl) resultEl.textContent = ""; }, 3000);
    } catch (e) { if(resultEl){resultEl.textContent=`❌ Cannot reach server.`;resultEl.style.color="#c62828";} }
}

/* ── Gotra Manager ── */
function renderGotraManagerList() {
    const cont = document.getElementById("gotra-manager-list");
    if (!cont) return;
    if (!_gotraList.length) { cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">No gotras found.</p>`; return; }
    cont.innerHTML = _gotraList.map(g => `
        <div class="gotra-item">
            <div class="gotra-item-name">${g.gotra_name}</div>
            <div class="gotra-item-actions">
                <button class="btn-admin-delete" onclick="adminDeleteGotra(${g.id},'${g.gotra_name.replace(/'/g,"\\'")}')">🗑 Delete</button>
            </div>
        </div>`).join("");
}

async function adminAddGotra() {
    const name     = (getEl("gotra_form_name")?.value || "").trim();
    const resultEl = getEl("gotra-form-result");
    if (!name) { showError("gotra_form_name","err_gotra_form_name","⚠ Gotra name is required."); return; }
    clearError("gotra_form_name","err_gotra_form_name");
    if (resultEl) { resultEl.textContent = "⏳ Saving..."; resultEl.style.color = "#8B5E3C"; }
    try {
        const res  = await fetch(`${API_BASE}/gotra/add`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ gotra_name: name }) });
        const data = await res.json();
        if (!data.id) { if(resultEl){resultEl.textContent="❌ Error saving gotra.";resultEl.style.color="#c62828";} return; }
        if (!_gotraList.find(g => g.id === data.id)) _gotraList.push({ id: data.id, gotra_name: data.gotra_name });
        refreshAllGotraSelects(null, null); setVal("gotra_form_name",""); renderGotraManagerList();
        if(resultEl){resultEl.textContent=data.already_exists?"ℹ Gotra already exists.":"✅ Gotra added!";resultEl.style.color=data.already_exists?"#8B5E3C":"#2e7d32";}
    } catch (e) { if(resultEl){resultEl.textContent="❌ Cannot reach server.";resultEl.style.color="#c62828";} }
}

async function adminDeleteGotra(id, name) {
    if (!confirm(`Delete gotra "${name}"? This cannot be undone if it is currently in use.`)) return;
    const resultEl = getEl("gotra-form-result");
    try {
        const res  = await fetch(`${API_BASE}/gotra/${id}`, { method:"DELETE" });
        const data = await res.json();
        if (!res.ok) { alert(`❌ ${data.detail || "Cannot delete gotra."}`); return; }
        _gotraList = _gotraList.filter(g => g.id !== id);
        refreshAllGotraSelects(null, null); renderGotraManagerList();
        if(resultEl){resultEl.textContent="✅ Gotra deleted.";resultEl.style.color="#2e7d32";}
    } catch (e) { alert("❌ Cannot reach server."); }
}

/* ── Donor Manager (v13.0 – view + delete) ── */
function onDonorSearchInput() {
    if (_donorSearchTimer) clearTimeout(_donorSearchTimer);
    _donorSearchTimer = setTimeout(() => {
        loadAdminDonors(getEl("donor_search_input")?.value || "");
    }, 350);
}

async function loadAdminDonors(search) {
    const cont     = document.getElementById("donor-manager-list");
    const resultEl = document.getElementById("donor-manager-result");
    if (!cont) return;
    cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">⏳ Loading donors...</p>`;
    try {
        // FIX #1: admin_username is now required by the backend
        const q   = search ? `&search=${encodeURIComponent(search)}` : "";
        const res  = await fetch(`${API_BASE}/admin/donors?admin_username=${encodeURIComponent(_adminUsername)}${q}`);
        const data = await res.json();
        if (!res.ok) { cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Failed to load donors.</p>`; return; }
        if (!data.length) { cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">No donors found.</p>`; return; }
        cont.innerHTML = data.map(d => `
            <div class="donor-item">
                <div class="donor-item-info">
                    <div class="donor-item-name">${d.first_name}${d.middle_name?" "+d.middle_name:""} ${d.last_name}</div>
                    <div class="donor-item-meta">${d.whatsapp_number} &nbsp;|&nbsp; ${d.email}</div>
                </div>
                <span class="donor-count-badge">${d.seva_donation_count} seva${d.seva_donation_count!==1?"s":""}</span>
                <div class="donor-item-actions">
                    <button class="btn-admin-view" onclick="viewDonorDetails(${d.id})">👁 View</button>
                    <button class="btn-admin-delete" onclick="adminDeleteDonor(${d.id},'${(d.first_name+" "+d.last_name).replace(/'/g,"\\'")}')">🗑 Delete</button>
                </div>
            </div>`).join("");
        if (resultEl) resultEl.textContent = "";
    } catch (e) {
        cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Cannot reach server.</p>`;
    }
}

/* ── Admin Donor View Modal ── */
async function adminDeleteDonor(donorId, donorName) {
    if (!confirm(`⚠ Permanently delete donor "${donorName}" and ALL their seva donation records?\n\nThis action cannot be undone.`)) return;
    const resultEl = document.getElementById("donor-manager-result");
    try {
        const res  = await fetch(`${API_BASE}/donors/${donorId}?admin_username=${encodeURIComponent(_adminUsername)}`, { method:"DELETE" });
        const data = await res.json();
        if (!res.ok) {
            if (resultEl) { resultEl.textContent = `❌ ${data.detail || "Delete failed."}`; resultEl.style.color="#c62828"; }
            return;
        }
        if (resultEl) { resultEl.textContent = `✅ ${data.message}`; resultEl.style.color="#2e7d32"; }
        loadAdminDonors(getEl("donor_search_input")?.value || "");
    } catch (e) {
        if (resultEl) { resultEl.textContent = "❌ Cannot reach server."; resultEl.style.color="#c62828"; }
    }
}

/* ── Donor View Modal ── */
async function viewDonorDetails(donorId) {
    const overlay = getEl("donor-view-overlay");
    const content = getEl("donor-view-content");
    if (!overlay || !content) return;
    overlay.style.display = "flex";
    content.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">⏳ Loading donor details...</p>`;
    try {
        const res  = await fetch(`${API_BASE}/admin/donors/${donorId}/detail?admin_username=${encodeURIComponent(_adminUsername)}`);
        const d    = await res.json();
        if (!res.ok) { content.innerHTML = `<p style="color:#c62828;">⚠ ${d.detail||"Could not load donor."}</p>`; return; }

        const field = (label, val) => val
            ? `<div class="dv-row"><span class="dv-label">${label}</span><span class="dv-val">${val}</span></div>`
            : "";

        let sevaHtml = "";
        if (d.seva_donations && d.seva_donations.length) {
            sevaHtml = `<div class="dv-section-title">🙏 Seva Donations (${d.seva_donations.length})</div>`;
            d.seva_donations.forEach((sd, i) => {
                const sp = sd.seva_person;
                sevaHtml += `
                <div class="dv-seva-card" id="dv-seva-card-${sd.id}">
                    ${sd.seva_image
                        ? `<img src="${sd.seva_image}" alt="${sd.seva_name}"
                                style="width:100%;border-radius:8px;margin-bottom:8px;max-height:160px;object-fit:cover;border:1px solid #e0c870;"
                                loading="lazy" onerror="this.style.display='none'">`
                        : `<div id="hist-img-wrap-${sd.id}" style="margin-bottom:8px;text-align:center;">
                               <button onclick="generateHistorySevaImage(${sd.id},this)"
                                   style="font-size:11px;padding:4px 12px;border-radius:20px;border:1.5px dashed #e0c870;
                                          background:#FFFBF0;color:#8B5E3C;cursor:pointer;font-family:inherit;font-weight:600;">
                                   🎨 Generate Blessing Card
                               </button>
                           </div>`}
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                        <div class="dv-seva-header" style="flex:1;margin-bottom:0;">#${i+1} — ${sd.seva_name} <span class="dv-seva-type">${sd.seva_type}</span></div>
                        <button onclick="adminDeleteSevaDonation(${sd.id},'${sd.seva_name.replace(/'/g,"\'")}')"
                            style="flex-shrink:0;padding:3px 10px;font-size:11px;font-weight:600;background:#fff0f0;color:#c62828;border:1.5px solid #f5c6c6;border-radius:6px;cursor:pointer;font-family:inherit;line-height:1.4;"
                            onmouseover="this.style.background='#fde0e0'" onmouseout="this.style.background='#fff0f0'"
                            title="Delete this seva donation">🗑 Delete</button>
                    </div>
                    ${field("Amount", `₹${parseFloat(sd.donation_amount).toFixed(2)}`)}
                    ${field("Receipt No", sd.receipt_no)}
                    ${field("Transaction ID", sd.transaction_id || "—")}
                    ${field("Date", sd.created_at ? sd.created_at.split(" ")[0] : "—")}
                    ${sp ? `
                    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e0c870;">
                        <div style="font-size:11px;color:#8B5E3C;font-weight:600;margin-bottom:4px;">🧘 SEVA PERSON</div>
                        ${field("Name", [sp.first_name, sp.middle_name, sp.last_name].filter(Boolean).join(" "))}
                        ${field("Gotra", sp.gotra_name)}
                        ${field("Nakshatra", sp.birthstar_name)}
                        ${field("Rashi", sp.zodiac_name)}
                        ${field("Seva Date", sp.seva_english_date || _buildHinduDateLabel(sp) || "—")}
                        ${sp.relation_count ? field("Family Members", sp.relation_count) : ""}
                    </div>` : ""}
                </div>`;
            });
        } else {
            sevaHtml = `<div style="color:#8B5E3C;font-size:13px;margin-top:8px;">No seva donations recorded.</div>`;
        }

        content.innerHTML = `
        <div class="dv-section-title">👤 Personal Info</div>
        ${field("Name", [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" "))}
        ${field("Gender", d.gender)}
        ${field("WhatsApp", d.whatsapp_number)}
        ${field("Email", d.email)}
        ${field("Date of Birth", d.birthdate)}
        ${field("Wedding Date", d.wedding_date)}
        ${(d.address_line1 || d.address_city) ? `<div class="dv-section-title" style="margin-top:14px;">📍 Address</div>` : ""}
        ${field("Line 1", d.address_line1)}
        ${field("Line 2", d.address_line2)}
        ${field("City", d.address_city)}
        ${field("State", d.address_state)}
        ${field("Pincode", d.address_pincode)}
        ${d.profession ? `<div class="dv-section-title" style="margin-top:14px;">💼 Profession</div>` : ""}
        ${field("Profession", d.profession)}
        ${field("Designation", d.designation)}
        ${field("Workplace", d.institution)}
        <div style="margin-top:16px;">${sevaHtml}</div>`;
    } catch (e) {
        content.innerHTML = `<p style="color:#c62828;">⚠ Cannot reach server.</p>`;
    }
}

async function adminDeleteSevaDonation(sevaId, sevaName) {
    if (!confirm(`Delete seva "${sevaName}" (ID: ${sevaId})?

This permanently removes this seva booking and all seva person details. Cannot be undone.`)) return;
    const card = document.getElementById(`dv-seva-card-${sevaId}`);
    if (card) { card.style.opacity = "0.4"; card.style.pointerEvents = "none"; }
    try {
        const res  = await fetch(`${API_BASE}/admin/seva-donations/${sevaId}?admin_username=${encodeURIComponent(_adminUsername)}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
            if (card) { card.style.opacity = "1"; card.style.pointerEvents = ""; }
            alert(`❌ Could not delete: ${data.detail || "Unknown error."}`); return;
        }
        if (card) {
            card.style.transition = "opacity .3s, max-height .35s, margin .35s, padding .35s";
            card.style.opacity = "0"; card.style.maxHeight = "0";
            card.style.overflow = "hidden"; card.style.margin = "0"; card.style.padding = "0";
            setTimeout(() => {
                card.remove();
                const content = getEl("donor-view-content");
                if (content) {
                    const remaining = content.querySelectorAll('[id^="dv-seva-card-"]').length;
                    content.querySelectorAll('.dv-section-title').forEach(t => {
                        if (t.textContent.includes('Seva Donations')) t.textContent = `🙏 Seva Donations (${remaining})`;
                    });
                    if (remaining === 0) {
                        const wrap = content.querySelector('[style*="margin-top:16px"]');
                        if (wrap) wrap.innerHTML = '<div class="dv-section-title">🙏 Seva Donations (0)</div><div style="color:#8B5E3C;font-size:13px;margin-top:8px;">No seva donations recorded.</div>';
                    }
                }
            }, 380);
        }
        loadAdminDonors();
    } catch (e) {
        if (card) { card.style.opacity = "1"; card.style.pointerEvents = ""; }
        alert(`❌ Network error: ${e.message}`);
    }
}

function closeDonorView(event) {
    if (event && event.target !== document.getElementById("donor-view-overlay") && event.type === "click") return;
    const overlay = getEl("donor-view-overlay");
    if (overlay) overlay.style.display = "none";
}


/* ── User Manager — sub-tab switcher ── */
function switchUserTab(tab) {
    const tabMap = { users: "ut-users", roles: "ut-roles" };
    const btnMap = { users: "utab-users", roles: "utab-roles" };
    Object.keys(tabMap).forEach(k => {
        const sec = getEl(tabMap[k]); if (sec) sec.style.display = (k === tab) ? "block" : "none";
        const btn = getEl(btnMap[k]); if (btn) btn.classList.toggle("active", k === tab);
    });
    if (tab === "users") loadAdminUsers();
    if (tab === "roles") loadAdminRoles();
}

async function loadAdminUsers() {
    const cont = getEl("user-manager-list");
    if (!cont) return;
    cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">⏳ Loading users...</p>`;
    try {
        const res  = await fetch(`${API_BASE}/admin/users?admin_username=${encodeURIComponent(_adminUsername)}`);
        const data = await res.json();
        if (!res.ok) { cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Failed to load users.</p>`; return; }
        if (!data.length) { cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">No users found.</p>`; return; }
        cont.innerHTML = data.map(u => {
            const roleLabel = (u.role_name || (u.is_admin ? "Admin Panel" : "Staff")).toUpperCase();
            const badgeBg   = u.is_admin ? "#27ae60" : "#1565c0";
            const phone     = u.phone_number ? `📱 ${u.phone_number}` : "";
            const email     = u.email ? `✉ ${u.email}` : "";
            const meta      = [phone, email].filter(Boolean).join(" &nbsp;·&nbsp; ") || `Created: ${u.created_at ? u.created_at.split(" ")[0] : "—"}`;
            return `
            <div class="donor-item">
                <div class="donor-item-info" style="flex:1;min-width:0;">
                    <div class="donor-item-name">${u.username}</div>
                    <div class="donor-item-meta" style="font-size:11px;color:#8B5E3C;">${meta}</div>
                </div>
                <span class="donor-count-badge" style="background:${badgeBg};flex-shrink:0;">${roleLabel}</span>
                <div class="donor-item-actions" style="flex-shrink:0;">
                    ${u.username !== _adminUsername
                        ? `<button class="btn-admin-delete" onclick="deleteAdminUser(${u.id},'${u.username.replace(/'/g,"\\'")}')">🗑</button>`
                        : `<span style="font-size:11px;color:#8B5E3C;">(you)</span>`}
                </div>
            </div>`;
        }).join("");
    } catch (e) {
        cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Cannot reach server.</p>`;
    }
}

async function saveAdminUser() {
    var username        = (getEl("user_form_mobile")?.value || "").trim();
    var phone           = (getEl("user_form_phone")?.value  || "").trim();
    var email           = (getEl("user_form_email")?.value  || "").trim();
    var password        = getEl("user_form_password")?.value || "";
    var confirmPassword = getEl("user_form_confirm_password")?.value || "";
    var roleSel         = getEl("user_form_role")?.value || "Staff";
    var resultEl        = getEl("user-form-result");
    var ok = true;

    if (!username || username.length < 3) {
        showError("user_form_mobile","err_user_form_mobile","⚠ Username must be at least 3 characters."); ok=false;
    } else clearError("user_form_mobile","err_user_form_mobile");

    // Email is required and must be OTP-verified
    if (!email) {
        var errEmail = document.getElementById("err_user_form_email");
        if (errEmail) { errEmail.textContent = "⚠ Email is required for password recovery."; errEmail.style.display = "block"; }
        ok = false;
    } else if (!_userFormEmailVerified || _userFormVerifiedEmail !== email.toLowerCase()) {
        var errEmail2 = document.getElementById("err_user_form_email");
        if (errEmail2) { errEmail2.textContent = "⚠ Please verify the email with OTP first."; errEmail2.style.display = "block"; }
        ok = false;
    }

    if (password.length < 6) {
        showError("user_form_password","err_user_form_password","⚠ Password must be at least 6 characters."); ok=false;
    } else clearError("user_form_password","err_user_form_password");

    if (password !== confirmPassword) {
        showError("user_form_confirm_password","err_user_form_confirm","⚠ Passwords do not match."); ok=false;
    } else clearError("user_form_confirm_password","err_user_form_confirm");

    if (!ok) return;

    var payload = {
        username:         username,
        password:         password,
        confirm_password: confirmPassword,
        is_admin:         false,
        role_name:        roleSel,
        phone_number:     phone || null,
        email:            email || null,
    };

    if (resultEl) { resultEl.textContent = "⏳ Creating user..."; resultEl.style.color = "#8B5E3C"; }
    try {
        var res  = await fetch(API_BASE + "/admin/users?admin_username=" + encodeURIComponent(_adminUsername), {
            method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
        });
        var data = await res.json();
        if (!res.ok) { if(resultEl){resultEl.textContent="❌ " + (data.detail||"Error.");resultEl.style.color="#c62828";} return; }
        if(resultEl){resultEl.textContent="✅ " + data.message;resultEl.style.color="#2e7d32";}
        // Reset form completely
        ["user_form_mobile","user_form_phone","user_form_email","user_form_password","user_form_confirm_password"].forEach(function(id){setVal(id,"");});
        var roleEl = getEl("user_form_role"); if (roleEl) roleEl.value = "Staff";
        // Reset email OTP state
        _userFormEmailVerified = false; _userFormVerifiedEmail = "";
        var okEl = document.getElementById("ok_user_form_email"); if (okEl) okEl.textContent = "";
        var sBtn = document.getElementById("btn_user_send_otp"); if (sBtn) { sBtn.textContent = "Send OTP"; sBtn.disabled = true; sBtn.style.opacity = "0.5"; }
        var ob   = document.getElementById("user_otp_box"); if (ob) ob.style.display = "none";
        await loadAdminUsers();
        setTimeout(function() { if(resultEl) resultEl.textContent=""; }, 3000);
    } catch (e) { if(resultEl){resultEl.textContent="❌ Cannot reach server.";resultEl.style.color="#c62828";} }
}

async function deleteAdminUser(userId, username) {
    if (!confirm(`Delete user "${username}"? They will no longer be able to login.`)) return;
    const resultEl = getEl("user-form-result");
    try {
        const res  = await fetch(`${API_BASE}/admin/users/${userId}?admin_username=${encodeURIComponent(_adminUsername)}`, { method:"DELETE" });
        const data = await res.json();
        if (!res.ok) { alert(`❌ ${data.detail||"Cannot delete user."}`); return; }
        if(resultEl){resultEl.textContent=`✅ ${data.message}`;resultEl.style.color="#2e7d32";}
        await loadAdminUsers();
    } catch (e) { alert("❌ Cannot reach server."); }
}


/* ── Roles Manager ── */
async function loadAdminRoles() {
    const cont = getEl("roles-manager-list");
    if (!cont) return;
    cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">⏳ Loading roles...</p>`;
    try {
        const res  = await fetch(`${API_BASE}/admin/roles?admin_username=${encodeURIComponent(_adminUsername)}`);
        const data = await res.json();
        if (!res.ok) { cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Failed to load roles.</p>`; return; }
        const PROTECTED = ["staff","administrator"];
        if (!data.length) { cont.innerHTML = `<p style="color:#8B5E3C;font-size:13px;">No custom roles yet.</p>`; return; }
        cont.innerHTML = data.map(r => {
            const isProtected = PROTECTED.includes(r.role_name.toLowerCase());
            return `
            <div class="donor-item" style="padding:8px 10px;">
                <div class="donor-item-info" style="flex:1;"><div class="donor-item-name" style="font-size:13px;">🏷 ${r.role_name}</div></div>
                <div class="donor-item-actions">
                    ${!isProtected
                        ? `<button class="btn-admin-delete" onclick="deleteAdminRole(${r.id},'${r.role_name.replace(/'/g,"\\'")}')">🗑</button>`
                        : `<span style="font-size:10px;color:#aaa;">built-in</span>`}
                </div>
            </div>`;
        }).join("");
        _populateRoleDropdown(data);
    } catch (e) {
        cont.innerHTML = `<p style="color:#c62828;font-size:13px;">⚠ Cannot reach server.</p>`;
    }
}

function _populateRoleDropdown(roles) {
    const sel = getEl("user_form_role");
    if (!sel) return;
    // Exclude "Administrator" — admin account is created only via first-time setup
    const EXCLUDED = ["administrator"];
    const BUILTIN  = ["staff", "staff 2", "staff 3"];
    const customRoles = roles.filter(r => !EXCLUDED.includes(r.role_name.toLowerCase()) && !BUILTIN.includes(r.role_name.toLowerCase()));
    sel.innerHTML = [
        `<option value="Staff">Staff</option>`,
        `<option value="Staff 2">Staff 2</option>`,
        `<option value="Staff 3">Staff 3</option>`,
        ...customRoles.map(r => `<option value="${r.role_name}">${r.role_name}</option>`)
    ].join("");
}

async function adminAddRole() {
    const name     = (getEl("role_form_name")?.value || "").trim();
    const resultEl = getEl("role-form-result");
    if (!name) { showError("role_form_name","err_role_form_name","⚠ Role name cannot be empty."); return; }
    clearError("role_form_name","err_role_form_name");
    if (resultEl) { resultEl.textContent = "⏳ Saving..."; resultEl.style.color = "#8B5E3C"; }
    try {
        const res  = await fetch(`${API_BASE}/admin/roles?admin_username=${encodeURIComponent(_adminUsername)}`, {
            method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ role_name: name })
        });
        const data = await res.json();
        if (!res.ok) { if(resultEl){resultEl.textContent=`❌ ${data.detail||"Error."}`;resultEl.style.color="#c62828";} return; }
        if (data.already_exists) {
            if(resultEl){resultEl.textContent=`ℹ Role "${name}" already exists.`;resultEl.style.color="#8B5E3C";}
        } else {
            if(resultEl){resultEl.textContent=`✅ Role "${name}" added.`;resultEl.style.color="#2e7d32";}
        }
        setVal("role_form_name","");
        await loadAdminRoles();
        setTimeout(() => { if(resultEl) resultEl.textContent=""; }, 3000);
    } catch (e) { if(resultEl){resultEl.textContent=`❌ Cannot reach server.`;resultEl.style.color="#c62828";} }
}

async function deleteAdminRole(roleId, roleName) {
    if (!confirm(`Delete role "${roleName}"?`)) return;
    const resultEl = getEl("role-form-result");
    try {
        const res  = await fetch(`${API_BASE}/admin/roles/${roleId}?admin_username=${encodeURIComponent(_adminUsername)}`, { method:"DELETE" });
        const data = await res.json();
        if (!res.ok) { alert(`❌ ${data.detail||"Cannot delete role."}`); return; }
        if(resultEl){resultEl.textContent=`✅ ${data.message}`;resultEl.style.color="#2e7d32";}
        await loadAdminRoles();
    } catch (e) { alert("❌ Cannot reach server."); }
}


/* ════════════════════════════════════════════════════════════
   15a. CHANGE PASSWORD MODAL  (Admin-only, OTP-verified)
   Step 1: Select target user → Send OTP to admin email
   Step 2: Verify OTP
   Step 3: Set new password
════════════════════════════════════════════════════════════ */
var _chpwTargetUsername = "";

async function openChangePasswordModal() {
    if (!_adminLoggedIn || !_userIsAdmin) return;
    var overlay = document.getElementById("change-password-overlay");
    if (!overlay) return;

    // Reset all steps
    _resetChpwModal();

    // Populate user dropdown
    try {
        var res  = await fetch(API_BASE + "/admin/users?admin_username=" + encodeURIComponent(_adminUsername));
        var users = await res.json();
        var sel  = document.getElementById("chpw_target_user");
        if (sel) {
            sel.innerHTML = '<option value="">— Select a user —</option>';
            users.forEach(function(u) {
                var opt = document.createElement("option");
                opt.value       = u.username;
                opt.textContent = u.username + (u.is_admin ? " (Admin)" : " (" + (u.role_name || "Staff") + ")");
                sel.appendChild(opt);
            });
        }
    } catch(e) {
        var sel = document.getElementById("chpw_target_user");
        if (sel) sel.innerHTML = '<option value="">— Could not load users —</option>';
    }

    overlay.style.display = "flex";
    setTimeout(function() {
        var sel = document.getElementById("chpw_target_user"); if (sel) sel.focus();
    }, 100);
}

function _resetChpwModal() {
    _chpwTargetUsername = "";
    // Show only step 1
    var s1 = document.getElementById("chpw-step1"); if (s1) s1.style.display = "block";
    var s2 = document.getElementById("chpw-step2"); if (s2) s2.style.display = "none";
    var s3 = document.getElementById("chpw-step3"); if (s3) s3.style.display = "none";
    // Clear fields
    var otpEl  = document.getElementById("chpw_otp");     if (otpEl)  otpEl.value  = "";
    var newEl  = document.getElementById("chpw_new");     if (newEl)  newEl.value  = "";
    var confEl = document.getElementById("chpw_confirm"); if (confEl) confEl.value = "";
    // Clear results
    ["chpw-step1-result","chpw-step2-result","chpw-result"].forEach(function(id) {
        var el = document.getElementById(id); if (el) { el.textContent = ""; el.style.color = ""; }
    });
    // Clear errors
    ["err_chpw_target","err_chpw_otp","err_chpw_new","err_chpw_confirm"].forEach(function(id) {
        var el = document.getElementById(id); if (el) { el.textContent = ""; el.style.display = "none"; }
    });
    // Reset strength
    var sw = document.getElementById("chpw-strength-wrap"); if (sw) sw.style.display = "none";
    // Reset buttons
    var btnV = document.getElementById("btn_chpw_verify_otp");
    if (btnV) { btnV.disabled = true; btnV.style.opacity = "0.5"; btnV.textContent = "✅ Verify OTP"; }
    var btnS = document.getElementById("btn_chpw_submit");
    if (btnS) { btnS.disabled = false; btnS.style.display = ""; btnS.textContent = "🔑 Update Password"; }
}

function closeChangePasswordModal() {
    var overlay = document.getElementById("change-password-overlay");
    if (overlay) overlay.style.display = "none";
}

async function chpwSendOtp() {
    var sel    = document.getElementById("chpw_target_user");
    var target = sel ? sel.value.trim() : "";
    var r1     = document.getElementById("chpw-step1-result");
    var errEl  = document.getElementById("err_chpw_target");

    if (!target) {
        if (errEl) { errEl.textContent = "⚠ Please select a user."; errEl.style.display = "block"; }
        return;
    }
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    if (r1) { r1.textContent = "⏳ Sending OTP to admin email..."; r1.style.color = "#8B5E3C"; }

    var btn = document.getElementById("btn_chpw_send_otp");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending..."; }

    try {
        var res  = await fetch(API_BASE + "/admin/change-password/send-otp", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ admin_username: _adminUsername, target_username: target })
        });
        var data = await res.json();
        if (!res.ok) {
            if (r1) { r1.textContent = "❌ " + (data.detail || "Failed."); r1.style.color = "#c62828"; }
            if (btn) { btn.disabled = false; btn.textContent = "📧 Send OTP to Admin Email"; }
            return;
        }
        _chpwTargetUsername = target;
        if (r1) r1.textContent = "";
        if (btn) { btn.disabled = false; btn.textContent = "📧 Send OTP to Admin Email"; }
        // Show step 2
        var s1 = document.getElementById("chpw-step1"); if (s1) s1.style.display = "none";
        var s2 = document.getElementById("chpw-step2"); if (s2) s2.style.display = "block";
        var hint = document.getElementById("chpw-email-hint");
        if (hint) hint.innerHTML = "✉ OTP sent to admin email <strong>" + (data.masked_email || "admin") + "</strong>. Changing password for: <strong>" + target + "</strong>.";
        // Reset OTP input state
        var otpEl = document.getElementById("chpw_otp"); if (otpEl) { otpEl.value = ""; otpEl.focus(); }
        var btnV  = document.getElementById("btn_chpw_verify_otp");
        if (btnV) { btnV.disabled = true; btnV.style.opacity = "0.5"; btnV.textContent = "✅ Verify OTP"; }
        var r2 = document.getElementById("chpw-step2-result"); if (r2) { r2.textContent = ""; }
    } catch(e) {
        if (r1) { r1.textContent = "❌ Cannot reach server."; r1.style.color = "#c62828"; }
        if (btn) { btn.disabled = false; btn.textContent = "📧 Send OTP to Admin Email"; }
    }
}

function onChpwOtpInput() {
    var val = (document.getElementById("chpw_otp")?.value || "").replace(/\D/g, "");
    var el  = document.getElementById("chpw_otp"); if (el) el.value = val;
    var btn = document.getElementById("btn_chpw_verify_otp");
    if (btn) {
        btn.disabled     = val.length !== 6;
        btn.style.opacity = val.length === 6 ? "1" : "0.5";
    }
}

async function chpwVerifyOtp() {
    var otp  = (document.getElementById("chpw_otp")?.value || "").trim();
    var r2   = document.getElementById("chpw-step2-result");
    var errO = document.getElementById("err_chpw_otp");
    if (otp.length !== 6) {
        if (errO) { errO.textContent = "⚠ Enter the 6-digit OTP."; errO.style.display = "block"; }
        return;
    }
    if (errO) { errO.textContent = ""; errO.style.display = "none"; }
    if (r2)   { r2.textContent = ""; }
    // Advance to step 3 — OTP is formally verified server-side on final submit
    var s2 = document.getElementById("chpw-step2"); if (s2) s2.style.display = "none";
    var s3 = document.getElementById("chpw-step3"); if (s3) s3.style.display = "block";
    var td = document.getElementById("chpw-target-display"); if (td) td.textContent = _chpwTargetUsername;
    var newEl = document.getElementById("chpw_new"); if (newEl) newEl.focus();
}

function onChpwNewInput() {
    var newPw  = document.getElementById("chpw_new")?.value || "";
    var conf   = document.getElementById("chpw_confirm")?.value || "";
    var sw     = document.getElementById("chpw-strength-wrap");
    var bar    = document.getElementById("chpw-strength-bar");
    var label  = document.getElementById("chpw-strength-label");

    if (newPw.length > 0) {
        if (sw) sw.style.display = "block";
        var score = 0;
        if (newPw.length >= 6)  score++;
        if (newPw.length >= 10) score++;
        if (/[A-Z]/.test(newPw)) score++;
        if (/[0-9]/.test(newPw)) score++;
        if (/[^A-Za-z0-9]/.test(newPw)) score++;
        var colors = ["#c62828","#e65100","#f9a825","#2e7d32","#1565c0"];
        var labels = ["Very Weak","Weak","Fair","Strong","Very Strong"];
        var pct    = Math.round((score / 5) * 100);
        if (bar)   { bar.style.width = pct + "%"; bar.style.background = colors[score-1] || "#c62828"; }
        if (label) { label.textContent = labels[score-1] || "Very Weak"; label.style.color = colors[score-1] || "#c62828"; }
    } else {
        if (sw) sw.style.display = "none";
    }

    var errC = document.getElementById("err_chpw_confirm");
    if (conf && errC) {
        if (newPw !== conf) {
            errC.textContent = "⚠ Passwords do not match."; errC.style.display = "block";
        } else {
            errC.textContent = ""; errC.style.display = "none";
        }
    }
}

async function submitChangePassword() {
    var otp     = (document.getElementById("chpw_otp")?.value || "").trim();
    var newPw   = document.getElementById("chpw_new")?.value || "";
    var confirm = document.getElementById("chpw_confirm")?.value || "";
    var resultEl = document.getElementById("chpw-result");
    var btn      = document.getElementById("btn_chpw_submit");
    var ok = true;

    if (newPw.length < 6) {
        var e2 = document.getElementById("err_chpw_new");
        if (e2) { e2.textContent = "⚠ New password must be at least 6 characters."; e2.style.display = "block"; }
        ok = false;
    } else {
        var e2c = document.getElementById("err_chpw_new");
        if (e2c) { e2c.textContent = ""; e2c.style.display = "none"; }
    }
    if (newPw !== confirm) {
        var e3 = document.getElementById("err_chpw_confirm");
        if (e3) { e3.textContent = "⚠ Passwords do not match."; e3.style.display = "block"; }
        ok = false;
    } else {
        var e3c = document.getElementById("err_chpw_confirm");
        if (e3c) { e3c.textContent = ""; e3c.style.display = "none"; }
    }
    if (!ok) return;

    if (btn) { btn.disabled = true; btn.textContent = "⏳ Updating..."; }
    if (resultEl) { resultEl.textContent = ""; }

    try {
        var res = await fetch(API_BASE + "/admin/change-password/set", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                admin_username:  _adminUsername,
                target_username: _chpwTargetUsername,
                otp:             otp,
                new_password:    newPw,
                confirm_password: confirm
            })
        });
        var data = await res.json();
        if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = "🔑 Update Password"; }
            if (resultEl) {
                resultEl.textContent = "❌ " + (data.detail || "Update failed.");
                resultEl.style.color = "#c62828";
            }
            // If OTP error, go back to step 2
            if (data.detail && (data.detail.toLowerCase().includes("otp") || data.detail.toLowerCase().includes("expired"))) {
                var s2 = document.getElementById("chpw-step2"); if (s2) s2.style.display = "block";
                var s3 = document.getElementById("chpw-step3"); if (s3) s3.style.display = "none";
            }
            return;
        }
        // Success
        if (resultEl) {
            resultEl.innerHTML = "✅ <strong>Password for '" + _chpwTargetUsername + "' updated successfully!</strong>";
            resultEl.style.color = "#2e7d32";
        }
        if (btn) btn.style.display = "none";
        setTimeout(function() { closeChangePasswordModal(); }, 2500);
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "🔑 Update Password"; }
        if (resultEl) { resultEl.textContent = "❌ Cannot reach server."; resultEl.style.color = "#c62828"; }
    }
}


/* ════════════════════════════════════════════════════════════
   15b. FORGOT PASSWORD FLOW
   Step 1: Enter username → OTP sent to admin email
   Step 2: Verify OTP
   Step 3: Enter and set new password
════════════════════════════════════════════════════════════ */
var _forgotUsername = "";

function _resetForgotForm() {
    _forgotUsername = "";
    var s1 = document.getElementById("forgot-step1"); if (s1) s1.style.display = "block";
    var s2 = document.getElementById("forgot-step2"); if (s2) s2.style.display = "none";
    var s3 = document.getElementById("forgot-step3"); if (s3) s3.style.display = "none";

    var uEl  = document.getElementById("forgot_username");         if (uEl)  uEl.value = "";
    var oEl  = document.getElementById("forgot_otp");              if (oEl)  oEl.value = "";
    var np   = document.getElementById("forgot_new_password");     if (np)   np.value  = "";
    var cp   = document.getElementById("forgot_confirm_password"); if (cp)   cp.value  = "";

    var r1  = document.getElementById("forgot-step1-result");  if (r1)  r1.textContent = "";
    var r2  = document.getElementById("forgot-step2-result");  if (r2)  r2.textContent = "";
    var r3  = document.getElementById("forgot-step3-result");  if (r3)  r3.textContent = "";

    ["err_forgot_username","err_forgot_otp","err_forgot_new_password","err_forgot_confirm_password"]
        .forEach(function(id) {
            var el = document.getElementById(id);
            if (el) { el.textContent = ""; el.style.display = "none"; }
        });

    var sw = document.getElementById("forgot-strength-wrap"); if (sw) sw.style.display = "none";
    var btn = document.getElementById("btn_verify_forgot_otp");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.textContent = "✅ Verify OTP"; }
    var btnS = document.getElementById("btn_forgot_set_password");
    if (btnS) { btnS.disabled = false; btnS.style.display = ""; btnS.textContent = "🔑 Set New Password"; }
}

async function sendForgotOtp() {
    var username = (document.getElementById("forgot_username")?.value || "").trim();
    var r1       = document.getElementById("forgot-step1-result");
    var errEl    = document.getElementById("err_forgot_username");
    if (!username) {
        if (errEl) { errEl.textContent = "⚠ Please enter your username."; errEl.style.display = "block"; }
        return;
    }
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    if (r1) { r1.textContent = "⏳ Sending OTP to admin email..."; r1.style.color = "#8B5E3C"; }
    try {
        var res  = await fetch(API_BASE + "/auth/forgot-password", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: username })
        });
        var data = await res.json();
        if (!res.ok) {
            if (r1) { r1.textContent = "❌ " + (data.detail || "Failed."); r1.style.color = "#c62828"; }
            return;
        }
        _forgotUsername = username;
        if (r1) r1.textContent = "";
        var s1 = document.getElementById("forgot-step1"); if (s1) s1.style.display = "none";
        var s2 = document.getElementById("forgot-step2"); if (s2) s2.style.display = "block";
        var hint = document.getElementById("forgot-email-hint");
        if (hint) hint.innerHTML = "✉ OTP sent to admin email <strong>" + (data.masked_email || "admin") + "</strong>. Please ask the admin for the OTP.";
        var oEl = document.getElementById("forgot_otp"); if (oEl) oEl.focus();
    } catch(e) {
        if (r1) { r1.textContent = "❌ Cannot reach server."; r1.style.color = "#c62828"; }
    }
}

function onForgotOtpInput() {
    var val = (document.getElementById("forgot_otp")?.value || "").replace(/\D/g, "");
    var el  = document.getElementById("forgot_otp"); if (el) el.value = val;
    var btn = document.getElementById("btn_verify_forgot_otp");
    if (btn) {
        btn.disabled = val.length !== 6;
        btn.style.opacity = val.length === 6 ? "1" : "0.5";
    }
}

async function verifyForgotOtp() {
    var otp = (document.getElementById("forgot_otp")?.value || "").trim();
    var r2  = document.getElementById("forgot-step2-result");
    var errO = document.getElementById("err_forgot_otp");
    if (otp.length !== 6) {
        if (errO) { errO.textContent = "⚠ Enter the 6-digit OTP."; errO.style.display = "block"; }
        return;
    }
    if (errO) { errO.textContent = ""; errO.style.display = "none"; }
    var btn = document.getElementById("btn_verify_forgot_otp");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Verifying..."; }
    if (r2) { r2.textContent = ""; }
    try {
        var res  = await fetch(API_BASE + "/auth/forgot-password/verify", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: _forgotUsername, otp: otp })
        });
        var data = await res.json();
        if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = "✅ Verify OTP"; btn.style.opacity = "1"; }
            if (r2) { r2.textContent = "❌ " + (data.detail || "Verification failed."); r2.style.color = "#c62828"; }
            return;
        }
        // OTP verified — move to Step 3
        var s2 = document.getElementById("forgot-step2"); if (s2) s2.style.display = "none";
        var s3 = document.getElementById("forgot-step3"); if (s3) s3.style.display = "block";
        var uLabel = document.getElementById("forgot-step3-username"); if (uLabel) uLabel.textContent = _forgotUsername;
        var npEl = document.getElementById("forgot_new_password"); if (npEl) npEl.focus();
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "✅ Verify OTP"; btn.style.opacity = "1"; }
        if (r2) { r2.textContent = "❌ Cannot reach server."; r2.style.color = "#c62828"; }
    }
}

function onForgotNewPwInput() {
    var newPw = document.getElementById("forgot_new_password")?.value || "";
    var conf  = document.getElementById("forgot_confirm_password")?.value || "";
    var sw    = document.getElementById("forgot-strength-wrap");
    var bar   = document.getElementById("forgot-strength-bar");
    var lbl   = document.getElementById("forgot-strength-label");

    if (newPw.length > 0) {
        if (sw) sw.style.display = "block";
        var score = 0;
        if (newPw.length >= 6)  score++;
        if (newPw.length >= 10) score++;
        if (/[A-Z]/.test(newPw)) score++;
        if (/[0-9]/.test(newPw)) score++;
        if (/[^A-Za-z0-9]/.test(newPw)) score++;
        var colors = ["#c62828","#e65100","#f9a825","#2e7d32","#1565c0"];
        var labels = ["Very Weak","Weak","Fair","Strong","Very Strong"];
        var pct = Math.round((score / 5) * 100);
        if (bar) { bar.style.width = pct + "%"; bar.style.background = colors[score-1] || "#c62828"; }
        if (lbl) { lbl.textContent = labels[score-1] || "Very Weak"; lbl.style.color = colors[score-1] || "#c62828"; }
    } else {
        if (sw) sw.style.display = "none";
    }
    var errC = document.getElementById("err_forgot_confirm_password");
    if (conf && errC) {
        if (newPw !== conf) {
            errC.textContent = "⚠ Passwords do not match."; errC.style.display = "block";
        } else {
            errC.textContent = ""; errC.style.display = "none";
        }
    }
}

async function submitForgotNewPassword() {
    var newPw = (document.getElementById("forgot_new_password")?.value  || "");
    var conf  = (document.getElementById("forgot_confirm_password")?.value || "");
    var r3    = document.getElementById("forgot-step3-result");
    var btn   = document.getElementById("btn_forgot_set_password");
    var ok    = true;

    if (newPw.length < 6) {
        var e1 = document.getElementById("err_forgot_new_password");
        if (e1) { e1.textContent = "⚠ Password must be at least 6 characters."; e1.style.display = "block"; }
        ok = false;
    } else {
        var e1c = document.getElementById("err_forgot_new_password");
        if (e1c) { e1c.textContent = ""; e1c.style.display = "none"; }
    }
    if (newPw !== conf) {
        var e2 = document.getElementById("err_forgot_confirm_password");
        if (e2) { e2.textContent = "⚠ Passwords do not match."; e2.style.display = "block"; }
        ok = false;
    } else {
        var e2c = document.getElementById("err_forgot_confirm_password");
        if (e2c) { e2c.textContent = ""; e2c.style.display = "none"; }
    }
    if (!ok) return;

    if (btn) { btn.disabled = true; btn.textContent = "⏳ Saving..."; }
    if (r3)  { r3.textContent = ""; }

    try {
        var res  = await fetch(API_BASE + "/auth/forgot-password/set-password", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                username:         _forgotUsername,
                new_password:     newPw,
                confirm_password: conf
            })
        });
        var data = await res.json();
        if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = "🔑 Set New Password"; }
            if (r3)  { r3.textContent = "❌ " + (data.detail || "Failed."); r3.style.color = "#c62828"; }
            return;
        }
        if (r3) {
            r3.innerHTML = "✅ <strong>Password updated successfully!</strong><br><span style='font-size:12px;color:#555;'>Redirecting to login…</span>";
            r3.style.color = "#2e7d32";
        }
        if (btn) btn.style.display = "none";
        setTimeout(function() {
            switchAuthView("login");
            var uEl = document.getElementById("admin_login_mobile");
            if (uEl) uEl.value = _forgotUsername;
            _forgotUsername = "";
        }, 2500);
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "🔑 Set New Password"; }
        if (r3)  { r3.textContent = "❌ Cannot reach server."; r3.style.color = "#c62828"; }
    }
}


/* ════════════════════════════════════════════════════════════
   15c. USER FORM EMAIL OTP (admin creating a user)
════════════════════════════════════════════════════════════ */
var _userFormEmailVerified = false;
var _userFormVerifiedEmail = "";

function onUserFormEmailInput() {
    var val   = (document.getElementById("user_form_email")?.value || "").trim();
    var btn   = document.getElementById("btn_user_send_otp");
    var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    if (btn) { btn.disabled = !valid; btn.style.opacity = valid ? "1" : "0.5"; }
    // Reset verification if email changed
    if (_userFormEmailVerified && val.toLowerCase() !== _userFormVerifiedEmail) {
        _userFormEmailVerified = false;
        _userFormVerifiedEmail = "";
        var okEl = document.getElementById("ok_user_form_email"); if (okEl) okEl.textContent = "";
        var ob   = document.getElementById("user_otp_box"); if (ob) ob.style.display = "none";
    }
    var errEl = document.getElementById("err_user_form_email");
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
}

async function sendUserFormOtp() {
    var email = (document.getElementById("user_form_email")?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    var btn    = document.getElementById("btn_user_send_otp");
    var otpBox = document.getElementById("user_otp_box");
    var status = document.getElementById("user_otp_status");
    if (btn) { btn.disabled = true; btn.textContent = "Sending..."; btn.style.opacity = "0.6"; }
    try {
        var res  = await fetch(API_BASE + "/email/send-otp", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (res.ok && data.success) {
            if (otpBox) otpBox.style.display = "block";
            if (status) { status.textContent = "✉ OTP sent to " + email; status.style.color = "#2e7d32"; }
            if (btn) { btn.disabled = false; btn.textContent = "Resend OTP"; btn.style.opacity = "1"; }
            var oEl = document.getElementById("user_otp_input"); if (oEl) { oEl.value = ""; oEl.focus(); }
            var vBtn = document.getElementById("btn_user_verify_otp"); if (vBtn) { vBtn.disabled = true; vBtn.style.opacity = "0.5"; }
        } else {
            if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; btn.style.opacity = "1"; }
            var errEl = document.getElementById("err_user_form_email");
            if (errEl) { errEl.textContent = "⚠ " + (data.detail || "Failed to send OTP."); errEl.style.display = "block"; }
        }
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; btn.style.opacity = "1"; }
    }
}

function onUserOtpInput() {
    var val  = (document.getElementById("user_otp_input")?.value || "").replace(/\D/g,"");
    var el   = document.getElementById("user_otp_input"); if (el) el.value = val;
    var btn  = document.getElementById("btn_user_verify_otp");
    if (btn) { btn.disabled = val.length !== 6; btn.style.opacity = val.length === 6 ? "1" : "0.5"; }
}

async function verifyUserFormOtp() {
    var email  = (document.getElementById("user_form_email")?.value || "").trim();
    var otp    = (document.getElementById("user_otp_input")?.value || "").trim();
    var status = document.getElementById("user_otp_status");
    var vBtn   = document.getElementById("btn_user_verify_otp");
    if (vBtn) vBtn.disabled = true;
    if (status) { status.textContent = "⏳ Verifying..."; status.style.color = "#8B5E3C"; }
    try {
        var res  = await fetch(API_BASE + "/email/verify-otp", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ email: email, otp: otp })
        });
        var data = await res.json();
        if (res.ok && data.success) {
            _userFormEmailVerified = true;
            _userFormVerifiedEmail = email.toLowerCase();
            var otpBox = document.getElementById("user_otp_box"); if (otpBox) otpBox.style.display = "none";
            var okEl   = document.getElementById("ok_user_form_email");
            if (okEl) okEl.textContent = "✅ Email verified!";
            var sBtn   = document.getElementById("btn_user_send_otp");
            if (sBtn) { sBtn.textContent = "✅ Verified"; sBtn.disabled = true; sBtn.style.opacity = "0.7"; }
        } else {
            if (status) { status.textContent = "❌ " + (data.detail || "Invalid OTP."); status.style.color = "#c62828"; }
            if (vBtn) { vBtn.disabled = false; vBtn.style.opacity = "1"; }
        }
    } catch(e) {
        if (status) { status.textContent = "⚠ Cannot reach server."; status.style.color = "#c62828"; }
        if (vBtn) { vBtn.disabled = false; vBtn.style.opacity = "1"; }
    }
}


/* ════════════════════════════════════════════════════════════
   16. EMAIL OTP VERIFICATION
════════════════════════════════════════════════════════════ */
function onEmailInput() {
    liveValidateEmail();
    const val     = getVal("email");
    const sendBtn = getEl("btn_send_otp");
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    if (sendBtn) sendBtn.disabled = !isValid;
    if ((_emailVerified || _emailSkipped) && val !== _otpEmail) _resetEmailVerification();
    // Hide prompt if email changes
    const ep = getEl("email-verify-prompt"); if(ep) ep.style.display="none";
}

/* ── Show email yes/no prompt ── */
async function sendEmailOtp_showPrompt() {
    if (!liveValidateEmail()) return;
    const ep = getEl("email-verify-prompt");
    if (ep) ep.style.display = "block";
}
/* ── User chose YES → directly send OTP without going through guard ── */
async function emailVerifyYes() {
    const ep = getEl("email-verify-prompt"); if(ep) ep.style.display="none";
    if (!liveValidateEmail()) return;
    const email   = getVal("email");
    const sendBtn = getEl("btn_send_otp");
    const otpBox  = getEl("otp_box");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending..."; }
    try {
        const res  = await fetch(`${API_BASE}/email/send-otp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email }) });
        const data = await res.json();
        if (res.ok && data.success) {
            _otpEmail = email;
            if (otpBox) otpBox.style.display = "block";
            if (sendBtn) { sendBtn.textContent = "Resend OTP"; sendBtn.classList.add("sent"); sendBtn.disabled = false; }
            setVal("otp_input", "");
            _setOtpStatus(`✉ OTP sent to ${email}. Check your inbox.`, "info");
            _startResendCountdown(30);
        } else {
            if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
            _setOtpStatus(`⚠ ${data.detail || "Failed to send OTP. Try again."}`, "error");
        }
    } catch (e) {
        if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
        _setOtpStatus("⚠ Network error. Please try again.", "error");
    }
}
/* ── User chose NO → skip OTP, accept email as-is ── */
function emailVerifyNo() {
    const ep = getEl("email-verify-prompt"); if(ep) ep.style.display="none";
    const email = getVal("email");
    _emailVerified = false;
    _emailSkipped  = true;
    _otpEmail      = email;
    const okSpan = getEl("ok_email");
    if (okSpan) okSpan.innerHTML = `<span style="font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:12px;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;">⚠ Email not verified</span>`;
    const sendBtn = getEl("btn_send_otp");
    if (sendBtn) { sendBtn.textContent = "Change Email"; sendBtn.classList.add("sent"); }
}

function _resetEmailVerification() {
    _emailVerified = false; _emailSkipped = false; _otpEmail = "";
    const otpBox  = getEl("otp_box"); if (otpBox) otpBox.style.display = "none";
    const sendBtn = getEl("btn_send_otp"); if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.classList.remove("sent"); }
    const okSpan  = getEl("ok_email"); if (okSpan) okSpan.textContent = "";
    const ep = getEl("email-verify-prompt"); if(ep) ep.style.display="none";
    setVal("otp_input",""); _setOtpStatus("","");
    if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
}

async function sendEmailOtp() {
    // If called directly (from button) and no OTP in progress, show Yes/No prompt first
    if (!_otpEmail && !getEl("otp_box")?.style.display?.includes("block")) {
        await sendEmailOtp_showPrompt(); return;
    }
    if (!liveValidateEmail()) return;
    const email   = getVal("email");
    const sendBtn = getEl("btn_send_otp");
    const otpBox  = getEl("otp_box");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending..."; }
    try {
        const res  = await fetch(`${API_BASE}/email/send-otp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email }) });
        const data = await res.json();
        if (res.ok && data.success) {
            _otpEmail = email; if (otpBox) otpBox.style.display = "block";
            if (sendBtn) { sendBtn.textContent = "Resend OTP"; sendBtn.classList.add("sent"); sendBtn.disabled = false; }
            setVal("otp_input",""); _setOtpStatus(`✉ OTP sent to ${email}. Check your inbox.`,"info");
            _startResendCountdown(30);
        } else {
            if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; }
            _setOtpStatus(`⚠ ${data.detail || "Failed to send OTP. Try again."}`, "error");
        }
    } catch (e) { if (sendBtn) { sendBtn.textContent = "Send OTP"; sendBtn.disabled = false; } _setOtpStatus("⚠ Network error. Please try again.","error"); }
}

async function resendEmailOtp() {
    if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
    const resendBtn = getEl("btn_resend_otp"); if (resendBtn) resendBtn.style.display = "none";
    await sendEmailOtp();
}

function onOtpInput() {
    const val = getVal("otp_input").replace(/\D/g,"");
    setVal("otp_input", val);
    const verifyBtn = getEl("btn_verify_otp"); if (verifyBtn) verifyBtn.disabled = val.length !== 6;
}

async function verifyEmailOtp() {
    const otp       = getVal("otp_input");
    const verifyBtn = getEl("btn_verify_otp");
    const otpBox    = getEl("otp_box");
    const okSpan    = getEl("ok_email");
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = "Verifying..."; }
    try {
        const res  = await fetch(`${API_BASE}/email/verify-otp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:_otpEmail, otp }) });
        const data = await res.json();
        if (res.ok && data.success) {
            _emailVerified = true;
            if (otpBox) otpBox.style.display = "none";
            if (verifyBtn) { verifyBtn.textContent = "Verified"; verifyBtn.classList.add("verified"); }
            if (okSpan) okSpan.innerHTML = `<span class="email-verified-badge">✅ Email verified</span>`;
            if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
            clearError("email","err_email");
        } else {
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify"; }
            _setOtpStatus(`⚠ ${data.detail || "Incorrect OTP. Please try again."}`, "error");
            const otpInput = getEl("otp_input"); if (otpInput) otpInput.style.borderColor = "#c62828";
        }
    } catch (e) { if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify"; } _setOtpStatus("⚠ Network error. Please try again.","error"); }
}

function _startResendCountdown(seconds) {
    const resendBtn = getEl("btn_resend_otp"); if (!resendBtn) return;
    let remaining = seconds;
    resendBtn.style.display = "inline"; resendBtn.disabled = true; resendBtn.textContent = `Resend in ${remaining}s`;
    _resendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) { clearInterval(_resendTimer); _resendTimer = null; resendBtn.disabled = false; resendBtn.textContent = "Resend OTP"; }
        else resendBtn.textContent = `Resend in ${remaining}s`;
    }, 1000);
}
function _setOtpStatus(msg, cls) { const el = getEl("otp_status"); if (!el) return; el.textContent = msg; el.className = cls; }


/* ════════════════════════════════════════════════════════════
   17. VALIDATION HELPERS
════════════════════════════════════════════════════════════ */
function liveValidateName(fieldId, errId, required, minLen) {
    const t = getVal(fieldId).trim();
    if (!required && t==="") { clearError(fieldId,errId); return true; }
    if (required  && t==="") { showError(fieldId,errId,"⚠ This field is required."); return false; }
    if (!/^[A-Za-z\s]+$/.test(t)) { showError(fieldId,errId,"⚠ Only letters allowed."); return false; }
    if (/\s{2,}/.test(t))          { showError(fieldId,errId,"⚠ Extra spaces detected."); return false; }
    if (t.length<(minLen||1))      { showError(fieldId,errId,`⚠ Min ${minLen} characters.`); return false; }
    if (t.length>50)               { showError(fieldId,errId,"⚠ Max 50 characters."); return false; }
    clearError(fieldId,errId); return true;
}
function liveValidateTextField(fieldId, errId, required) {
    const t = getVal(fieldId).trim();
    if (!required && t==="") { clearError(fieldId,errId); return true; }
    if (required  && t==="") { showError(fieldId,errId,"⚠ This field is required."); return false; }
    if (t.length>150)        { showError(fieldId,errId,"⚠ Max 150 characters."); return false; }
    clearError(fieldId,errId); return true;
}
function liveValidateEmail() {
    const val = getVal("email").trim();
    if (!val)                                        { showError("email","err_email","⚠ Email is required."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) { showError("email","err_email","⚠ Invalid email format."); return false; }
    clearError("email","err_email"); return true;
}
function validateBirthdate() {
    const val = getVal("birthdate"); if (!val) { clearError("birthdate","err_birthdate"); return true; }
    const d = new Date(val);
    if (isNaN(d.getTime())) { showError("birthdate","err_birthdate","⚠ Invalid date."); return false; }
    if (d > new Date())     { showError("birthdate","err_birthdate","⚠ Birthdate cannot be in the future."); return false; }
    clearError("birthdate","err_birthdate"); return true;
}
function validateWeddingDate() {
    const val = getVal("wedding_date"); if (!val) { clearError("wedding_date","err_wedding_date"); return true; }
    const d = new Date(val);
    if (isNaN(d.getTime())) { showError("wedding_date","err_wedding_date","⚠ Invalid date."); return false; }
    clearError("wedding_date","err_wedding_date"); return true;
}
function validatePincode() {
    const val = getVal("address_pincode"), state = getVal("address_state");
    if (!val) { clearError("address_pincode","err_address_pincode"); return true; }
    if (!/^\d{6}$/.test(val)) { showError("address_pincode","err_address_pincode","⚠ Pincode must be 6 digits."); return false; }
    if (state && STATE_PINCODE_PREFIXES[state]) {
        const p2 = val.substring(0,2);
        if (!STATE_PINCODE_PREFIXES[state].includes(p2)) {
            showError("address_pincode","err_address_pincode",`⚠ Pincode doesn't match ${state}. Please verify.`); return false;
        }
    }
    clearError("address_pincode","err_address_pincode");
    // Valid 6-digit pincode — trigger map search
    _debouncedGeocode();
    return true;
}
function relValidateName(fieldId,errId,required,minLen) {
    const t=(document.getElementById(fieldId)?.value||"").trim();
    if(!required&&t===""){clearError(fieldId,errId);return true;}
    if(required&&t===""){showError(fieldId,errId,"⚠ This field is required.");return false;}
    if(!/^[A-Za-z\s]+$/.test(t)){showError(fieldId,errId,"⚠ Only letters allowed.");return false;}
    if(t.length<(minLen||1)){showError(fieldId,errId,`⚠ Min ${minLen} characters.`);return false;}
    if(t.length>50){showError(fieldId,errId,"⚠ Max 50 characters.");return false;}
    clearError(fieldId,errId);return true;
}
function relValidateEmail(fieldId,errId){
    const val=(document.getElementById(fieldId)?.value||"").trim();
    if(!val){clearError(fieldId,errId);return true;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)){showError(fieldId,errId,"⚠ Enter a valid email.");return false;}
    clearError(fieldId,errId);return true;
}
function relValidatePhone(numFieldId,errId){
    const val=(document.getElementById(numFieldId)?.value||"").trim();
    if(!val){clearError(numFieldId,errId);return true;}
    const dialId=numFieldId.replace("phone_num_","phone_dial_");
    const dial=(document.getElementById(dialId)?.textContent||"+91").trim();
    const result=validatePhoneDigitsByDial(val,dial);
    if(!result.valid){showError(numFieldId,errId,result.msg);return false;}
    clearError(numFieldId,errId);return true;
}
function relValidateDob(fieldId,errId){
    const val=document.getElementById(fieldId)?.value||"";
    if(!val){clearError(fieldId,errId);return true;}
    const d=new Date(val),now=new Date();
    if(isNaN(d.getTime())){showError(fieldId,errId,"⚠ Invalid date.");return false;}
    if(d>now){showError(fieldId,errId,"⚠ Date cannot be in the future.");return false;}
    clearError(fieldId,errId);return true;
}


/* ════════════════════════════════════════════════════════════
   18. DOM HELPERS
════════════════════════════════════════════════════════════ */
function getVal(id)      { return (document.getElementById(id)?.value || "").trim(); }

/* ── Password show/hide eye toggle ── */
function togglePwEye(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const isHidden = inp.type === "password";
    inp.type       = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "🙈" : "👁";
    btn.title       = isHidden ? "Hide password" : "Show password";
}
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function getEl(id)       { return document.getElementById(id); }

function showError(fieldId, errId, msg) {
    const err = document.getElementById(errId);
    if (err) { err.textContent = msg; err.style.display = "block"; }
    const inp = document.getElementById(fieldId);
    if (inp) { inp.classList.add("input-error"); inp.classList.remove("input-ok"); }
}
function clearError(fieldId, errId) {
    const err = document.getElementById(errId);
    if (err) { err.textContent = ""; err.style.display = "none"; }
    const inp = document.getElementById(fieldId);
    if (inp) {
        inp.classList.remove("input-error");
        if (inp.value?.trim()) inp.classList.add("input-ok");
        else inp.classList.remove("input-ok");
    }
}
function showFieldErr(fieldId, errId, msg)  { showError(fieldId, errId, msg); }
function clearFieldError(fieldId, errId)     { clearError(fieldId, errId); }
function markInputOk(el)   { if (el) { el.classList.add("input-ok"); el.classList.remove("input-error"); } }
function markFieldGreen(id){ const el=document.getElementById(id); if(el) el.classList.add("input-ok"); }

function showMsg(containerId, cssClass, msg) {
    const el = document.getElementById(containerId);
    if (el) { el.className = cssClass; el.textContent = msg; }
}
function clearMsg(containerId) {
    const el = document.getElementById(containerId);
    if (el) { el.className = ""; el.textContent = ""; }
}
function populateSelect(id, list, valKey, labelKey, placeholder, selected) {
    const sel = document.getElementById(id); if (!sel) return;
    sel.innerHTML = `<option value="" disabled ${!selected?"selected":""}>— ${placeholder} —</option>`;
    list.forEach(item => { const o = document.createElement("option"); o.value = item[valKey]; o.textContent = item[labelKey]; if (selected && item[valKey] == selected) o.selected = true; sel.appendChild(o); });
}
function populateGotraSelect(id, list, selected) {
    const sel = document.getElementById(id); if (!sel) return;
    sel.innerHTML = `<option value="" disabled ${!selected?"selected":""}>— Select Gotra —</option>`;
    list.forEach(item => { const o = document.createElement("option"); o.value = item.id; o.textContent = item.gotra_name; if (selected && item.id == selected) o.selected = true; sel.appendChild(o); });
    const other = document.createElement("option"); other.value = "__other__"; other.textContent = "➕ Other (Add New)";
    sel.appendChild(other);
}

/* ════════════════════════════════════════════════════════════
   DONOR PROFILE PHOTO  v12.0
   ════════════════════════════════════════════════════════════ */

// Inline SVG avatar data URIs — proper male/female human silhouettes
const _MALE_SVG   = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'
+ '<circle cx="60" cy="60" r="60" fill="#EDE9FE"/>'
+ '<circle cx="60" cy="42" r="19" fill="#4C3D8F"/>'
+ '<path d="M15 108 C15 78 35 68 60 68 C85 68 105 78 105 108 Q85 122 60 122 Q35 122 15 108 Z" fill="#4C3D8F"/>'
+ '</svg>'
)}`;

const _FEMALE_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'
+ '<circle cx="60" cy="60" r="60" fill="#FCE7F3"/>'
// Long hair behind head
+ '<ellipse cx="60" cy="36" rx="20" ry="24" fill="#BE185D"/>'
+ '<rect x="40" y="36" width="8" height="28" rx="4" fill="#BE185D"/>'
+ '<rect x="72" y="36" width="8" height="28" rx="4" fill="#BE185D"/>'
// Head (on top of hair)
+ '<circle cx="60" cy="36" r="15" fill="#DB2777"/>'
// Neck
+ '<rect x="54" y="49" width="12" height="9" rx="4" fill="#DB2777"/>'
// Dress / body (flared)
+ '<path d="M30 98 Q35 60 60 60 Q85 60 90 98 Z" fill="#DB2777"/>'
// Dress flare wider at bottom
+ '<path d="M26 98 Q32 72 48 68 Q36 85 36 98 Z" fill="#BE185D"/>'
+ '<path d="M94 98 Q88 72 72 68 Q84 85 84 98 Z" fill="#BE185D"/>'
// Collar V
+ '<path d="M54 58 L60 68 L66 58" fill="#EC4899"/>'
+ '</svg>'
)}`;

/**
 * Apply a photo/avatar value to the DP widget.
 * Accepts: "avatar:male" | "avatar:female" | "data:image/..." | null
 */
function applyDonorPhoto(value) {
    if (!value) { resetDonorPhoto(); return; }
    if (value === "avatar:male")   { _applyAvatarImg(_MALE_SVG,   null, ""); return; }
    if (value === "avatar:female") { _applyAvatarImg(_FEMALE_SVG, null, ""); return; }
    // Real captured photo
    _setDpImage(value);
    _setPhotoInput(value);
    _hideChooser();
    _setStatus("✅ Photo loaded.", "#2e7d32");
    _highlightCard("avc-camera");
}

/** Called from avatar chooser cards and the ♂/♀ quick buttons */
function setDonorAvatar(type) {
    const isMale = (type === "male");
    _applyAvatarImg(
        isMale ? _MALE_SVG : _FEMALE_SVG,
        null,
        ""
    );
    _setPhotoInput(isMale ? "avatar:male" : "avatar:female");
}

/**
 * Called when gender dropdown changes.
 * Auto-applies male/female avatar ONLY if no real photo has been captured/uploaded yet.
 */
function onGenderChange() {
    const gender = document.getElementById("gender")?.value;
    if (!gender) return;
    // If a real photo is already set (data URI, not an avatar), don't override it
    const currentPhoto = document.getElementById("donor_photo")?.value || "";
    if (currentPhoto.startsWith("data:image/") && !currentPhoto.startsWith("data:image/svg")) {
        return; // real captured/uploaded photo — leave it alone
    }
    setDonorAvatar(gender === "Female" ? "female" : "male");
}

/** Opens/toggles the avatar chooser panel when user clicks the DP circle */
function openPhotoChooser() {
    const chooser = document.getElementById("donor-avatar-chooser");
    if (!chooser) return;
    chooser.style.display = (chooser.style.display === "none") ? "flex" : "none";
}

/** POST to backend → opens OpenCV webcam window → returns base64 JPEG */
async function capturePhoto() {
    _setStatus('⏳ Requesting camera access…','#E8821A'); _highlightCard('avc-camera');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false}); }
    catch(err){ _setStatus('❌ '+(err.name==='NotAllowedError'?'Camera permission denied.':err.name==='NotFoundError'?'No camera found.':'Camera error: '+err.message),'#c62828'); return; }
    _setStatus('📷 Camera ready — click Capture or wait 10 s.','#E8821A');
    const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
    const vid=document.createElement('video'); vid.autoplay=true; vid.playsInline=true; vid.style.cssText='width:min(480px,90vw);border-radius:12px;background:#000;'; vid.srcObject=stream;
    const tmr=document.createElement('div'); tmr.style.cssText='color:#fff;font-size:14px;font-family:inherit;'; tmr.textContent='Auto-capture in 10 s…';
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:12px;';
    const bC=document.createElement('button'); bC.textContent='📷 Capture'; bC.style.cssText='padding:10px 28px;font-size:14px;font-weight:600;font-family:inherit;background:#E8821A;color:#fff;border:none;border-radius:10px;cursor:pointer;';
    const bX=document.createElement('button'); bX.textContent='✕ Cancel'; bX.style.cssText='padding:10px 20px;font-size:14px;font-family:inherit;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:10px;cursor:pointer;';
    row.append(bC,bX); ov.append(vid,tmr,row); document.body.appendChild(ov);
    let sec=10; const cd=setInterval(()=>{ sec--; tmr.textContent=sec>0?`Auto-capture in ${sec} s…`:'Capturing…'; if(sec<=0){clearInterval(cd);snap();} },1000);
    function snap(){ clearInterval(cd); const M=800; let w=vid.videoWidth||640,h=vid.videoHeight||480; if(w>M||h>M){if(w>=h){h=Math.round(h*M/w);w=M;}else{w=Math.round(w*M/h);h=M;}} const cv=document.createElement('canvas'); cv.width=w;cv.height=h; cv.getContext('2d').drawImage(vid,0,0,w,h); const u=cv.toDataURL('image/jpeg',0.85); cleanup(); _setDpImage(u);_setPhotoInput(u);_hideChooser(); _setStatus('✅ Photo captured!','#2e7d32'); _highlightCard('avc-camera'); }
    function cleanup(){ stream.getTracks().forEach(t=>t.stop()); ov.remove(); }
    bC.onclick=snap; bX.onclick=()=>{ clearInterval(cd); cleanup(); _setStatus('',''); document.querySelectorAll('.avatar-card').forEach(c=>c.classList.remove('selected')); };
    ov.addEventListener('click',e=>{ if(e.target===ov) bX.onclick(); });
}

/**
 * Upload a photo from the user's device.
 * Reads the selected file, resizes/compresses it to a max 400×400 JPEG
 * at 85% quality via an offscreen Canvas, then stores the base64 data URI
 * in the hidden donor_photo field and shows it as the DP.
 */
function uploadDonorPhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    // Validate it is actually an image
    if (!file.type.startsWith('image/')) {
        _setStatus('❌ Please select an image file (JPG, PNG, WEBP, etc.)', '#c62828');
        input.value = '';
        return;
    }

    // 10 MB hard limit — base64 of a 10 MB file is ~13.3 MB, which may stress
    // the MEDIUMTEXT column (16 MB limit). Keep well below that.
    if (file.size > 10 * 1024 * 1024) {
        _setStatus('❌ Image too large (max 10 MB). Please choose a smaller file.', '#c62828');
        input.value = '';
        return;
    }

    _setStatus('⏳ Processing image…', '#E8821A');
    _highlightCard('avc-upload');

    const reader = new FileReader();
    reader.onload = function(e) {
        const original = new Image();
        original.onload = function() {
            // ── Resize to max 400×400 maintaining aspect ratio ──────────────
            const MAX = 400;
            let w = original.width;
            let h = original.height;
            if (w > MAX || h > MAX) {
                if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                else        { w = Math.round(w * MAX / h); h = MAX; }
            }

            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(original, 0, 0, w, h);

            // ── Convert to JPEG base64 data URI ──────────────────────────────
            const dataUri = canvas.toDataURL('image/jpeg', 0.85);

            _setDpImage(dataUri);
            _setPhotoInput(dataUri);
            _hideChooser();
            _setStatus('✅ Photo uploaded! Click 🖼 to change.', '#2e7d32');
            _highlightCard('avc-upload');

            // Reset the file input so the same file can be re-selected if needed
            input.value = '';
        };
        original.onerror = function() {
            _setStatus('❌ Could not read image. Please try another file.', '#c62828');
            input.value = '';
        };
        original.src = e.target.result;
    };
    reader.onerror = function() {
        _setStatus('❌ Failed to read file. Please try again.', '#c62828');
        input.value = '';
    };
    reader.readAsDataURL(file);
}

/** Reset photo widget to blank state (used by clearDonorForm) */
function resetDonorPhoto() {
    const imgEl      = document.getElementById("donor-photo-img");
    const placeholder= document.getElementById("donor-photo-placeholder");
    const chooser    = document.getElementById("donor-avatar-chooser");
    if (imgEl)       { imgEl.src = ""; imgEl.style.display = "none"; }
    if (placeholder)   placeholder.style.display = "block";
    _setPhotoInput(null);
    document.querySelectorAll(".avatar-card").forEach(c => c.classList.remove("selected"));
    if (chooser) chooser.style.display = "flex";
    _setStatus("", "");
}

// ── private helpers ──────────────────────────────────────────
function _applyAvatarImg(src, cardId, statusMsg) {
    _setDpImage(src);
    _hideChooser();
    _setStatus(statusMsg, "#2e7d32");
    _highlightCard(cardId);
}

function _setDpImage(src) {
    const imgEl      = document.getElementById("donor-photo-img");
    const placeholder= document.getElementById("donor-photo-placeholder");
    if (!imgEl) return;
    imgEl.src = src;
    imgEl.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
}

function _setPhotoInput(val) {
    const el = document.getElementById("donor_photo");
    if (el) el.value = val || "";
}

function _hideChooser() {
    const chooser = document.getElementById("donor-avatar-chooser");
    if (chooser) chooser.style.display = "none";
}

function _setStatus(msg, color) {
    const el = document.getElementById("photo-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || "#8B5E3C";
}

function _highlightCard(cardId) {
    document.querySelectorAll(".avatar-card").forEach(c => c.classList.remove("selected"));
    const card = document.getElementById(cardId);
    if (card) card.classList.add("selected");
}

// ═══════════════════════════════════════════════════════════════
//  MAP MODULE — Pure Vanilla JS Tile Map  (zero external library)
//  Tiles: OpenStreetMap | Geocoding: Nominatim | Both fetched by the browser.
// ═══════════════════════════════════════════════════════════════

let _vm=null; const _TS=256;
function _ll2w(lat,lng,z){const s=_TS*Math.pow(2,z),x=(lng+180)/360*s,r=lat*Math.PI/180,y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*s;return{x,y};}
function _w2ll(wx,wy,z){const s=_TS*Math.pow(2,z),lng=wx/s*360-180,n=Math.PI-2*Math.PI*wy/s,lat=180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));return{lat,lng};}
function _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function _vmRender(){
    const m=_vm;if(!m)return;
    const W=m.box.clientWidth||600,H=m.box.clientHeight||320,c=_ll2w(m.lat,m.lng,m.zoom);
    const tx0=Math.floor((c.x-W/2)/_TS),ty0=Math.floor((c.y-H/2)/_TS),tx1=Math.ceil((c.x+W/2)/_TS),ty1=Math.ceil((c.y+H/2)/_TS);
    const n=Math.pow(2,m.zoom),wanted={};
    for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++)if(ty>=0&&ty<n)wanted[tx+','+ty]={tx,ty};
    [...m.tilesEl.children].forEach(img=>{if(!wanted[img.dataset.key])img.remove();});
    const exist={};[...m.tilesEl.children].forEach(img=>{exist[img.dataset.key]=true;});
    Object.values(wanted).forEach(({tx,ty})=>{
        const key=tx+','+ty;if(exist[key])return;
        const ntx=((tx%n)+n)%n,sub=['a','b','c'][(Math.abs(tx)+Math.abs(ty))%3];
        const img=document.createElement('img');
        img.src=`https://${sub}.tile.openstreetmap.org/${m.zoom}/${ntx}/${ty}.png`;
        img.dataset.key=key;img.dataset.tx=tx;img.dataset.ty=ty;
        img.style.cssText=`position:absolute;width:${_TS}px;height:${_TS}px;border:none;`;img.draggable=false;m.tilesEl.appendChild(img);
    });
    [...m.tilesEl.children].forEach(img=>{img.style.left=(+img.dataset.tx*_TS-c.x+W/2)+'px';img.style.top=(+img.dataset.ty*_TS-c.y+H/2)+'px';});
    _vmPin();
}
function _vmPin(){
    const m=_vm;if(!m||!m.pinEl)return;
    const W=m.box.clientWidth||600,H=m.box.clientHeight||320,c=_ll2w(m.lat,m.lng,m.zoom),p=_ll2w(m.pinLat,m.pinLng,m.zoom);
    const px=p.x-c.x+W/2,py=p.y-c.y+H/2;
    m.pinEl.style.left=(px-14)+'px';m.pinEl.style.top=(py-36)+'px';
    if(m.popup){m.popup.style.left=px+'px';m.popup.style.top=(py-44)+'px';}
}
function _vmCreate(lat,lng,zoom){
    const box=document.getElementById('donor-map');if(!box)return;
    box.innerHTML='';box.style.cssText+=';position:relative;overflow:hidden;cursor:grab;user-select:none;touch-action:none;';
    const tilesEl=document.createElement('div');tilesEl.style.cssText='position:absolute;inset:0;';box.appendChild(tilesEl);
    const attr=document.createElement('div');
    attr.innerHTML='© <a href="https://www.openstreetmap.org/copyright" target="_blank" style="color:#1a73e8;">OpenStreetMap</a>';
    attr.style.cssText='position:absolute;bottom:4px;right:6px;font-size:9.5px;background:rgba(255,255,255,.8);padding:2px 5px;border-radius:3px;z-index:10;';
    box.appendChild(attr);
    const zb=document.createElement('div');zb.style.cssText='position:absolute;top:10px;left:10px;z-index:10;display:flex;flex-direction:column;gap:2px;';
    ['+','−'].forEach((lbl,i)=>{
        const btn=document.createElement('button');btn.textContent=lbl;
        btn.style.cssText='width:28px;height:28px;font-size:16px;font-weight:700;background:#fff;border:1px solid #bbb;border-radius:4px;cursor:pointer;color:#333;line-height:1;';
        btn.onclick=e=>{e.stopPropagation();const nz=_clamp(_vm.zoom+(i?-1:1),3,19);if(nz!==_vm.zoom){_vm.zoom=nz;_vmRender();}};zb.appendChild(btn);
    });
    box.appendChild(zb);
    const pinEl=document.createElement('div');
    pinEl.style.cssText='position:absolute;z-index:20;cursor:grab;width:28px;height:40px;touch-action:none;';
    pinEl.innerHTML=`<svg viewBox="0 0 28 40" width="28" height="40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C8.48 0 4 4.48 4 10c0 7.5 10 20 10 20s10-12.5 10-20C24 4.48 19.52 0 14 0z" fill="#E8821A" stroke="#a05010" stroke-width="1.2"/><circle cx="14" cy="10" r="5" fill="#fff" opacity="0.9"/></svg>`;
    box.appendChild(pinEl);
    const popup=document.createElement('div');popup.textContent='Drag pin to exact location';
    popup.style.cssText='position:absolute;z-index:21;background:#fff;border:1.5px solid #E8821A;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;color:#3B1F0B;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.18);transform:translate(-50%,-100%);margin-top:-8px;';
    box.appendChild(popup);
    _vm={box,tilesEl,pinEl,popup,lat,lng,zoom,pinLat:lat,pinLng:lng};
    let pan=null;
    const panS=(cx,cy)=>{pan={cx,cy,lat:_vm.lat,lng:_vm.lng};box.style.cursor='grabbing';};
    const panM=(cx,cy)=>{if(!pan)return;const cv=_ll2w(pan.lat,pan.lng,_vm.zoom),nw=_w2ll(cv.x-(cx-pan.cx),cv.y-(cy-pan.cy),_vm.zoom);_vm.lat=_clamp(nw.lat,-85,85);_vm.lng=nw.lng;_vmRender();};
    const panE=()=>{pan=null;box.style.cursor='grab';};
    box.addEventListener('mousedown',e=>{if(pinEl.contains(e.target))return;panS(e.clientX,e.clientY);});
    window.addEventListener('mousemove',e=>{if(pan){e.preventDefault();panM(e.clientX,e.clientY);}});
    window.addEventListener('mouseup',()=>panE());
    box.addEventListener('touchstart',e=>{if(pinEl.contains(e.target))return;const t=e.touches[0];panS(t.clientX,t.clientY);},{passive:true});
    box.addEventListener('touchmove',e=>{const t=e.touches[0];panM(t.clientX,t.clientY);},{passive:true});
    box.addEventListener('touchend',()=>panE());
    box.addEventListener('wheel',e=>{e.preventDefault();const nz=_clamp(_vm.zoom+(e.deltaY<0?1:-1),3,19);if(nz!==_vm.zoom){_vm.zoom=nz;_vmRender();}},{passive:false});
    let pd=null;
    pinEl.addEventListener('mousedown',e=>{e.stopPropagation();pd={cx:e.clientX,cy:e.clientY,lat:_vm.pinLat,lng:_vm.pinLng};pinEl.style.cursor='grabbing';popup.style.display='none';});
    window.addEventListener('mousemove',e=>{if(!pd)return;e.preventDefault();const cv=_ll2w(_vm.lat,_vm.lng,_vm.zoom),po=_ll2w(pd.lat,pd.lng,_vm.zoom),nw=_w2ll(po.x+(e.clientX-pd.cx),po.y+(e.clientY-pd.cy),_vm.zoom);_vm.pinLat=_clamp(nw.lat,-85,85);_vm.pinLng=nw.lng;_vmPin();});
    window.addEventListener('mouseup',()=>{if(!pd)return;pd=null;pinEl.style.cursor='grab';_setCoords(_vm.pinLat,_vm.pinLng);_setMapStatus('📍 Location updated. Coordinates saved.','#2e7d32');popup.style.display='';_vmPin();});
    pinEl.addEventListener('touchstart',e=>{e.stopPropagation();const t=e.touches[0];pd={cx:t.clientX,cy:t.clientY,lat:_vm.pinLat,lng:_vm.pinLng};popup.style.display='none';},{passive:true});
    window.addEventListener('touchmove',e=>{if(!pd)return;const t=e.touches[0],cv=_ll2w(_vm.lat,_vm.lng,_vm.zoom),po=_ll2w(pd.lat,pd.lng,_vm.zoom),nw=_w2ll(po.x+(t.clientX-pd.cx),po.y+(t.clientY-pd.cy),_vm.zoom);_vm.pinLat=_clamp(nw.lat,-85,85);_vm.pinLng=nw.lng;_vmPin();},{passive:true});
    window.addEventListener('touchend',()=>{if(!pd)return;pd=null;_setCoords(_vm.pinLat,_vm.pinLng);_setMapStatus('📍 Location updated. Coordinates saved.','#2e7d32');popup.style.display='';_vmPin();});
    _vmRender();
}
function _vmMoveTo(lat,lng,zoom){if(!_vm){_vmCreate(lat,lng,zoom);return;}_vm.lat=lat;_vm.lng=lng;_vm.zoom=zoom;_vm.pinLat=lat;_vm.pinLng=lng;_vmRender();}
function _lazyInitMap(){
    const s=document.getElementById('donor-map-section');if(s)s.style.display='block';
    if(_vm){setTimeout(_vmRender,120);return;}
    const sLat=parseFloat(document.getElementById('donor_latitude')?.value),sLng=parseFloat(document.getElementById('donor_longitude')?.value);
    if(sLat&&sLng){_vmCreate(sLat,sLng,17);_setCoords(sLat,sLng);_setMapStatus('📍 Saved location loaded. Drag pin to adjust.','#2e7d32');return;}
    geocodeAddressFields();
}
function onPincodeBlurMap(){const p=(document.getElementById('address_pincode')||{}).value||'';if(p.length===6)geocodeAddressFields();}
let _geocodeDebounceTimer=null;
function _debouncedGeocode(d=700){clearTimeout(_geocodeDebounceTimer);_geocodeDebounceTimer=setTimeout(()=>{const s=document.getElementById('step-2');if(s&&s.classList.contains('active'))geocodeAddressFields();},d);}
function _getAddrField(id){return((document.getElementById(id)||{}).value||'').trim();}

async function geocodeAddressFields(){
    const step2=document.getElementById('step-2');if(step2&&!step2.classList.contains('active'))return;
    const section=document.getElementById('donor-map-section');if(section)section.style.display='block';

    const line1   = _getAddrField('address_line1');
    const line2   = _getAddrField('address_line2');
    const city    = _getAddrField('address_city');
    const state   = _getAddrField('address_state');
    const pincode = _getAddrField('address_pincode');

    if(!line1&&!line2&&!city&&!state&&!pincode){
        _vmCreate(20.5937,78.9629,5);
        _setMapStatus('Enter your address above to auto-locate.','#999');
        return;
    }

    _setMapStatus('🔍 Locating your address…','#8B5E3C');

    // Call our backend proxy — avoids browser User-Agent restrictions and CORS issues
    try {
        const params = new URLSearchParams();
        if(line1)   params.set('line1',   line1);
        if(line2)   params.set('line2',   line2);
        if(pincode) params.set('pincode', pincode);
        if(city)    params.set('city',    city);
        if(state)   params.set('state',   state);

        console.info('[Map] Calling /geocode with:', Object.fromEntries(params));
        const res  = await fetch(`${API_BASE}/geocode?${params}`);
        const data = await res.json();
        console.info('[Map] /geocode response:', data);

        if(data.lat && data.lng){
            // Zoom and message depend on how precise the match was
            const zoom = data.precision==='full'    ? 16
                       : data.precision==='pincode' ? 14
                       : data.precision==='city'    ? 13
                       : 11;
            const msg  = data.precision==='full'    ? '📍 Address located! Drag pin to your exact door.'
                       : data.precision==='pincode' ? '📍 Pincode area found. Drag pin to your exact location.'
                       : data.precision==='city'    ? '📍 City located. Drag pin to your exact address.'
                       : '📍 State located. Please drag pin to your exact location.';
            const col  = data.precision==='full'    ? '#2e7d32' : '#e67e22';
            _vmMoveTo(data.lat, data.lng, zoom);
            _setCoords(data.lat, data.lng);
            _setMapStatus(msg, col);
        } else {
            _vmCreate(20.5937,78.9629,5);
            _setCoords(20.5937,78.9629);
            _setMapStatus('⚠️ Could not locate address. Drag pin to your exact location.','#c0392b');
        }
    } catch(e) {
        console.warn('[Map] Geocode proxy error:', e.message);
        _vmCreate(20.5937,78.9629,5);
        _setMapStatus('⚠️ Could not reach server. Drag pin to your exact location.','#c0392b');
    }
}
function _setCoords(lat,lng){const l=document.getElementById('donor_latitude'),g=document.getElementById('donor_longitude');if(l)l.value=lat.toFixed(7);if(g)g.value=lng.toFixed(7);const b=document.getElementById('map-coords-label');if(b)b.textContent=`Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;}
function _clearCoords(){['donor_latitude','donor_longitude'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const b=document.getElementById('map-coords-label');if(b)b.textContent='';}
function _setMapStatus(msg,color){const el=document.getElementById('map-status');if(!el)return;el.textContent=msg;el.style.color=color||'#8B5E3C';}
function _buildMapUrl(lat,lng){return(lat&&lng)?`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`:null;}

// ═══════════════════════════════════════════════════════════════
//  ADMIN — REPORT TAB
// ═══════════════════════════════════════════════════════════════
let _reportRows=[];
function initReportTab(){
    const sel=document.getElementById('rpt_seva_id');if(!sel)return;
    const cur=sel.value;sel.innerHTML='<option value="">— All Sevas —</option>';
    (_sevaList||[]).forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.seva_name;sel.appendChild(o);});
    if(cur)sel.value=cur;
    const today=new Date(),y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,'0'),d=String(today.getDate()).padStart(2,'0');
    const fromEl=document.getElementById('rpt_from_date'),toEl=document.getElementById('rpt_to_date');
    if(fromEl&&!fromEl.value)fromEl.value=`${y}-${m}-01`;
    if(toEl&&!toEl.value)toEl.value=`${y}-${m}-${d}`;
}
function clearReportResult(){
    const r=document.getElementById('rpt-results'),s=document.getElementById('rpt-summary'),e=document.getElementById('rpt-export-row');
    if(r)r.innerHTML='';if(s)s.style.display='none';if(e)e.style.display='none';_reportRows=[];
}
async function loadSevaReport(){
    const fromDate=(document.getElementById('rpt_from_date')||{}).value||'',toDate=(document.getElementById('rpt_to_date')||{}).value||'',sevaId=(document.getElementById('rpt_seva_id')||{}).value||'';
    const statusEl=document.getElementById('rpt-status'),resultsEl=document.getElementById('rpt-results'),summaryEl=document.getElementById('rpt-summary'),exportRow=document.getElementById('rpt-export-row');
    if(!fromDate||!toDate){if(statusEl){statusEl.textContent='⚠ Select both dates.';statusEl.style.color='#c62828';}return;}
    if(fromDate>toDate){if(statusEl){statusEl.textContent='⚠ From must be ≤ To.';statusEl.style.color='#c62828';}return;}
    if(statusEl){statusEl.textContent='⏳ Loading…';statusEl.style.color='#8B5E3C';}
    if(resultsEl)resultsEl.innerHTML='';if(summaryEl)summaryEl.style.display='none';if(exportRow)exportRow.style.display='none';_reportRows=[];
    let url=`${API_BASE}/admin/reports/seva-donations?admin_username=${encodeURIComponent(_adminUsername)}&from_date=${fromDate}&to_date=${toDate}`;
    if(sevaId)url+=`&seva_id=${sevaId}`;
    try{
        const res=await fetch(url),data=await res.json();
        if(!res.ok){if(statusEl){statusEl.textContent='❌ '+(data.detail||'Failed.');statusEl.style.color='#c62828';}return;}
        if(statusEl)statusEl.textContent='';_reportRows=data.records||[];
        if(summaryEl){const tot=_reportRows.reduce((s,r)=>s+r.donation_amount,0);summaryEl.innerHTML=`<strong>${data.total}</strong> record${data.total!==1?'s':''} &nbsp;|&nbsp; Total: <strong>₹${tot.toLocaleString('en-IN',{minimumFractionDigits:0})}</strong>`;summaryEl.style.display='block';}
        if(!_reportRows.length){if(resultsEl)resultsEl.innerHTML='<p style="color:#8B5E3C;font-size:13px;padding:8px 0;">No records found.</p>';return;}
        const TH='padding:7px 8px;font-weight:600;white-space:nowrap;border-bottom:2px solid rgba(245,200,66,.3);',TD='padding:6px 8px;border-bottom:1px solid rgba(232,130,26,.12);color:#3B1F0B;vertical-align:top;';
        const rows=_reportRows.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fdf6ec'};"><td style="${TD}">${i+1}</td><td style="${TD}"><strong>${r.seva_name}</strong></td><td style="${TD}">${r.seva_type}</td><td style="${TD}">${r.donor_name}</td><td style="${TD}">${r.seva_person_name||'—'}</td><td style="${TD}">${r.seva_date}</td><td style="${TD};text-align:right;">₹${parseFloat(r.donation_amount).toLocaleString('en-IN',{minimumFractionDigits:0})}</td><td style="${TD}">${r.receipt_no}</td></tr>`).join('');
        if(resultsEl)resultsEl.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11.5px;font-family:inherit;"><thead><tr style="background:#3B1F0B;color:#F5C842;text-align:left;"><th style="${TH}">#</th><th style="${TH}">Seva</th><th style="${TH}">Type</th><th style="${TH}">Donor</th><th style="${TH}">Seva Person</th><th style="${TH}">Date</th><th style="${TH};text-align:right;">Amount</th><th style="${TH}">Receipt</th></tr></thead><tbody>${rows}</tbody></table>`;
        if(exportRow)exportRow.style.display='flex';
    }catch(err){if(statusEl){statusEl.textContent='❌ '+err.message;statusEl.style.color='#c62828';}}
}
async function exportReportExcel(){
    if(!_reportRows.length)return;
    const btn=document.getElementById('rpt-export-btn');if(btn){btn.disabled=true;btn.textContent='⏳ Preparing…';}
    try{
        if(typeof XLSX==='undefined')await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
        const from=(document.getElementById('rpt_from_date')||{}).value||'from',to=(document.getElementById('rpt_to_date')||{}).value||'to';
        const hdr=['#','Seva','Type','Donor','WhatsApp','Email','Seva Person','Date','Amount (₹)','Receipt','TxnID','Booked'];
        const rows=_reportRows.map((r,i)=>[i+1,r.seva_name,r.seva_type,r.donor_name,r.whatsapp_number||'',r.email||'',r.seva_person_name||'',r.seva_date,r.donation_amount,r.receipt_no,r.transaction_id||'',r.created_at]);
        const ws=XLSX.utils.aoa_to_sheet([hdr,...rows]);
        ws['!cols']=[{wch:4},{wch:18},{wch:10},{wch:20},{wch:15},{wch:22},{wch:20},{wch:12},{wch:12},{wch:16},{wch:16},{wch:12}];
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Seva Report');
        XLSX.writeFile(wb,`seva_report_${from}_to_${to}.xlsx`);
    }catch(e){alert('Excel error: '+e.message);}
    finally{if(btn){btn.disabled=false;btn.textContent='⬇ Export Excel';}}
}

function printReportTable(){
    if(!_reportRows.length){ alert('Generate the report first.'); return; }
    var btn = document.getElementById('rpt-print-btn');
    if(btn){ btn.disabled=true; btn.textContent='Opening...'; }
    var from = (document.getElementById('rpt_from_date')||{}).value||'';
    var to   = (document.getElementById('rpt_to_date')  ||{}).value||'';
    var sevaFilter = document.getElementById('rpt_seva_id');
    var sevaLabel  = (sevaFilter && sevaFilter.value)
        ? ((sevaFilter.options[sevaFilter.selectedIndex]||{}).text||'All Sevas')
        : 'All Sevas';
    var tot = _reportRows.reduce(function(s,r){ return s+parseFloat(r.donation_amount||0); },0);
    var rowsHtml = _reportRows.map(function(r,i){
        return '<tr style="background:'+(i%2===0?'#fff':'#fdf6ec')+';"><td style="padding:3pt 4pt;">'+(i+1)+'</td>'
            +'<td style="padding:3pt 4pt;"><b>'+(r.seva_name||'')+'</b></td>'
            +'<td style="padding:3pt 4pt;">'+(r.seva_type||'')+'</td>'
            +'<td style="padding:3pt 4pt;">'+(r.donor_name||'')+'</td>'
            +'<td style="padding:3pt 4pt;">'+(r.whatsapp_number||'-')+'</td>'
            +'<td style="padding:3pt 4pt;">'+(r.seva_person_name||'-')+'</td>'
            +'<td style="padding:3pt 4pt;">'+(r.seva_date||'')+'</td>'
            +'<td style="padding:3pt 4pt;text-align:right;">Rs.'+parseFloat(r.donation_amount||0).toLocaleString('en-IN',{minimumFractionDigits:0})+'</td>'
            +'<td style="padding:3pt 4pt;">'+(r.receipt_no||'')+'</td></tr>';
    }).join('');
    var grandTotal = 'Rs.'+tot.toLocaleString('en-IN',{minimumFractionDigits:0});
    var printedOn  = new Date().toLocaleString('en-IN');
    var totalRec   = _reportRows.length;
    var css = '*{margin:0;padding:0;box-sizing:border-box;}'
        +'body{font-family:"Segoe UI",Arial,sans-serif;font-size:8pt;color:#222;padding:5mm;}'
        +'.hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #E8821A;padding-bottom:4pt;margin-bottom:5pt;}'
        +'.t1{font-size:11pt;font-weight:700;color:#3B1F0B;}'
        +'.t2{font-size:8.5pt;font-weight:600;color:#E8821A;margin-top:1pt;}'
        +'.rgt{font-size:6.5pt;color:#555;text-align:right;line-height:1.7;}'
        +'.summ{background:#FFF3DC;border:1px solid #E8821A;border-radius:3pt;padding:3pt 8pt;margin-bottom:5pt;font-size:7.5pt;color:#5C3D2E;}'
        +'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7pt;}'
        +'col.c1{width:3%}col.c2{width:14%}col.c3{width:7%}col.c4{width:14%}'
        +'col.c5{width:11%}col.c6{width:13%}col.c7{width:9%}col.c8{width:9%}col.c9{width:14%}'
        +'thead tr{background:#3B1F0B;color:#F5C842;}'
        +'th{padding:3.5pt 4pt;font-weight:600;text-align:left;white-space:nowrap;}'
        +'td{border-bottom:1px solid rgba(232,130,26,.15);vertical-align:top;word-break:break-word;}'
        +'tfoot tr{background:#f0f0f0;font-weight:700;}'
        +'.foot{margin-top:4pt;font-size:6pt;color:#aaa;text-align:center;border-top:1px dashed #ddd;padding-top:2pt;}'
        +'@media print{html,body{margin:0!important;padding:4mm!important;}@page{size:A4 landscape;margin:5mm;}}';
    var html = '<!DOCTYPE html><html><head>'
        +'<meta charset="UTF-8"><title>Seva Report '+from+' to '+to+'</title>'
        +'<style>'+css+'</style></head><body>'
        +'<div class="hdr"><div><div class="t1">Jagannath Temple</div><div class="t2">Seva Donation Report</div></div>'
        +'<div class="rgt">Period: <b>'+from+'</b> to <b>'+to+'</b><br>Seva: <b>'+sevaLabel+'</b><br>Printed: '+printedOn+'</div></div>'
        +'<div class="summ"><b>'+totalRec+'</b> record'+(totalRec!==1?'s':'')+' &nbsp;|&nbsp; Total: <b>'+grandTotal+'</b></div>'
        +'<table><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"><col class="c8"><col class="c9"></colgroup>'
        +'<thead><tr><th>#</th><th>Seva Name</th><th>Type</th><th>Donor</th><th>WhatsApp</th><th>Seva Person</th><th>Date</th><th style="text-align:right;">Amount</th><th>Receipt No.</th></tr></thead>'
        +'<tbody>'+rowsHtml+'</tbody>'
        +'<tfoot><tr><td colspan="7" style="text-align:right;padding:3pt 5pt;">Grand Total</td>'
        +'<td style="text-align:right;padding:3pt 5pt;color:#2e7d32;">'+grandTotal+'</td><td></td></tr></tfoot>'
        +'</table>'
        +'<div class="foot">Jagannath Temple &nbsp;|&nbsp; '+printedOn+' &nbsp;|&nbsp; '+totalRec+' records</div>'
        +'<'+'script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},1000);},400);};<'+'/script>'
        +'</body></html>';
    var win = window.open('','_blank');
    if(!win){
        if(btn){ btn.disabled=false; btn.textContent='Print Report'; }
        alert('Pop-up blocked! In Chrome: click the icon in address bar and select "Always allow pop-ups from localhost"');
        return;
    }
    win.document.write(html);
    win.document.close();
    if(btn){ btn.disabled=false; btn.textContent='Print Report'; }
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN — LABEL PRINT TAB
//
//  Flow: search donors by name/phone → click donor → see their
//  seva donations listed with checkboxes → click "Generate Labels"
//  → one 12×8cm label per selected seva (all selected by default).
//  QR code encodes the OSM map URL for donor lat/lng.
// ═══════════════════════════════════════════════════════════════
let _lpCurrentDonor = null;   // { id, name, phone, email, ... }
let _lpSevaRecords  = [];     // seva donations for selected donor
let _lpLabelRows    = [];     // records for which labels were generated
let _lpSearchTimer  = null;

function initLabelPrintTab(){
    _lpCurrentDonor = null; _lpSevaRecords = []; _lpLabelRows = [];
    const dl=document.getElementById('lp-donor-list'); if(dl) dl.innerHTML='';
    const sd=document.getElementById('lp-selected-donor'); if(sd) sd.style.display='none';
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    const st=document.getElementById('lp-status'); if(st) st.textContent='';
    const si=document.getElementById('lp_search'); if(si) si.value='';
    const dr=document.getElementById('lp-date-result-list'); if(dr) dr.innerHTML='';
    // Default dates: today and 30 days ago
    const today=new Date(), prior=new Date(); prior.setDate(today.getDate()-30);
    const fmt=d=>d.toISOString().split('T')[0];
    const fd=document.getElementById('lp_from_date'); if(fd) fd.value=fmt(prior);
    const td=document.getElementById('lp_to_date');   if(td) td.value=fmt(today);
    lpSwitchMode('search');
}

/* ── Toggle between search-by-donor and filter-by-date modes ── */
function lpSwitchMode(mode){
    const secSearch=document.getElementById('lp-section-search');
    const secDate  =document.getElementById('lp-section-date');
    const btnSearch=document.getElementById('lp-mode-search');
    const btnDate  =document.getElementById('lp-mode-date');
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    const st=document.getElementById('lp-status'); if(st) st.textContent='';
    if(mode==='search'){
        if(secSearch) secSearch.style.display='block';
        if(secDate)   secDate.style.display='none';
        if(btnSearch){btnSearch.style.background='#E8821A';btnSearch.style.color='#fff';}
        if(btnDate)  {btnDate.style.background='#fff';btnDate.style.color='#E8821A';}
    } else {
        if(secSearch) secSearch.style.display='none';
        if(secDate)   secDate.style.display='block';
        if(btnSearch){btnSearch.style.background='#fff';btnSearch.style.color='#E8821A';}
        if(btnDate)  {btnDate.style.background='#E8821A';btnDate.style.color='#fff';}
        _lpCurrentDonor=null; _lpSevaRecords=[];
        const sd=document.getElementById('lp-selected-donor'); if(sd) sd.style.display='none';
        const dl=document.getElementById('lp-donor-list'); if(dl) dl.innerHTML='';
    }
}

function lpClearDateResults(){
    const dr=document.getElementById('lp-date-result-list'); if(dr) dr.innerHTML='';
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    const st=document.getElementById('lp-status'); if(st) st.textContent='';
    _lpLabelRows=[];
}

async function lpSearchByDate(){
    const fromDate=(document.getElementById('lp_from_date')||{}).value||'';
    const toDate  =(document.getElementById('lp_to_date')||{}).value||'';
    const dr=document.getElementById('lp-date-result-list');
    const st=document.getElementById('lp-status');
    if(!fromDate||!toDate){if(st){st.textContent='⚠ Please select both From and To dates.';st.style.color='#c62828';}return;}
    if(fromDate>toDate){if(st){st.textContent='⚠ From date must be on or before To date.';st.style.color='#c62828';}return;}
    if(dr) dr.innerHTML='<p style="font-size:12px;color:#8B5E3C;padding:6px 0;">⏳ Loading records…</p>';
    if(st){st.textContent='';st.style.color='#8B5E3C';}
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    _lpLabelRows=[];
    try{
        const url=`${API_BASE}/admin/reports/seva-donations?admin_username=${encodeURIComponent(_adminUsername)}&from_date=${fromDate}&to_date=${toDate}`;
        const res=await fetch(url);
        const data=await res.json();
        if(!res.ok){if(dr)dr.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${data.detail||'Failed.'}</p>`;return;}
        const records=data.records||[];
        _lpSevaRecords=records;
        if(!records.length){
            if(dr)dr.innerHTML='<p style="font-size:12px;color:#8B5E3C;padding:6px 0;">No seva donations found for this date range.</p>';
            return;
        }
        if(dr){
            dr.innerHTML=`
            <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">${records.length} record${records.length!==1?'s':''} found — select to generate labels:</div>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;color:#8B5E3C;cursor:pointer;">
                <input type="checkbox" id="lp_date_chk_all" style="accent-color:#E8821A;" checked onchange="lpDateToggleAll(this.checked)"> Select All / Deselect All
            </label>
            ${records.map(r=>`
            <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #f0e8d8;border-radius:6px;margin-bottom:5px;cursor:pointer;background:#fff;font-size:12px;color:#3B1F0B;"
                onmouseover="this.style.background='#FFF8E7'" onmouseout="this.style.background='#fff'">
                <input type="checkbox" id="lp_date_chk_${r.id}" value="${r.id}" checked style="width:14px;height:14px;accent-color:#E8821A;cursor:pointer;">
                <div style="flex:1;">
                    <strong>${r.seva_name}</strong>
                    <span style="color:#E8821A;font-size:11px;"> [${r.seva_type}]</span>
                    <span style="float:right;font-size:11px;color:#8B5E3C;">${r.seva_date}</span><br>
                    <span style="color:#8B5E3C;font-size:11px;">${r.donor_name} | ${r.whatsapp_number||'—'} | ₹${parseFloat(r.donation_amount).toLocaleString('en-IN')}</span>
                </div>
            </label>`).join('')}
            <button class="btn-primary" style="width:100%;font-size:12px;padding:8px;margin-top:6px;" onclick="lpGenerateDateLabels()">🏷 Generate Labels for Selected</button>`;
        }
    }catch(e){if(dr)dr.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${e.message}</p>`;}
}

function lpDateToggleAll(checked){
    (_lpSevaRecords||[]).forEach(r=>{
        const chk=document.getElementById('lp_date_chk_'+r.id);
        if(chk) chk.checked=checked;
    });
}

async function lpGenerateDateLabels(){
    const statusEl=document.getElementById('lp-status');
    const preview =document.getElementById('lp-preview');
    const actions =document.getElementById('lp-actions');
    const selected=(_lpSevaRecords||[]).filter(r=>document.getElementById('lp_date_chk_'+r.id)?.checked);
    if(!selected.length){if(statusEl){statusEl.textContent='⚠ Select at least one record.';statusEl.style.color='#c62828';}return;}
    if(statusEl){statusEl.textContent='⏳ Generating labels…';statusEl.style.color='#8B5E3C';}
    if(preview) preview.innerHTML='';
    if(actions) actions.style.display='none';
    _lpLabelRows=selected;
    if(preview) preview.innerHTML=await _buildLabelsHTML(_lpLabelRows);
    if(actions) actions.style.display='flex';
    if(statusEl){statusEl.textContent=`✅ ${_lpLabelRows.length} label${_lpLabelRows.length!==1?'s':''} generated — scroll to preview below.`;statusEl.style.color='#2e7d32';}
}

function lpSearchDonors(){
    clearTimeout(_lpSearchTimer);
    _lpSearchTimer = setTimeout(async()=>{
        const q = (document.getElementById('lp_search')||{}).value||'';
        const dl = document.getElementById('lp-donor-list'); if(!dl) return;
        if(q.trim().length < 2){ dl.innerHTML='<p style="font-size:12px;color:#aaa;padding:6px 0;">Type at least 2 characters to search.</p>'; return; }
        dl.innerHTML='<p style="font-size:12px;color:#8B5E3C;padding:6px 0;">⏳ Searching…</p>';
        try{
            const res=await fetch(`${API_BASE}/admin/donors?admin_username=${encodeURIComponent(_adminUsername)}&search=${encodeURIComponent(q.trim())}`);
            const data=await res.json();
            if(!res.ok){dl.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${data.detail||'Search failed.'}</p>`;return;}
            if(!data.length){dl.innerHTML='<p style="font-size:12px;color:#8B5E3C;padding:6px 0;">No donors found.</p>';return;}
            dl.innerHTML = data.map(d=>{
                const nm=[d.first_name,d.middle_name,d.last_name].filter(Boolean).join(' ');
                const cnt=d.seva_donation_count||0;
                return `<div onclick="lpSelectDonor(${d.id},'${nm.replace(/'/g,"\\'")}','${(d.whatsapp_number||'').replace(/'/g,"\\'")}','${(d.email||'').replace(/'/g,"\\'")}',${cnt})"
                    style="padding:9px 12px;border-bottom:1px solid #f0e8d8;cursor:pointer;font-size:13px;transition:background .15s;"
                    onmouseover="this.style.background='#FFF8E7'" onmouseout="this.style.background='#fff'">
                    <strong>${nm}</strong>
                    <span style="color:#E8821A;margin-left:8px;">${d.whatsapp_number||''}</span>
                    <span style="float:right;font-size:11px;color:#aaa;">${cnt} seva${cnt!==1?'s':''}</span>
                    ${d.email?`<div style="font-size:11px;color:#8B5E3C;">${d.email}</div>`:''}
                </div>`;
            }).join('');
        }catch(e){dl.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${e.message}</p>`;}
    }, 350);
}

async function lpSelectDonor(id, name, phone, email, sevaCount){
    // Hide search list, show selected donor panel
    const dl=document.getElementById('lp-donor-list'); if(dl) dl.innerHTML='';
    const si=document.getElementById('lp_search'); if(si) si.value='';
    const sd=document.getElementById('lp-selected-donor'); if(sd) sd.style.display='block';
    const dn=document.getElementById('lp-donor-name'); if(dn) dn.textContent=name;
    const dm=document.getElementById('lp-donor-meta'); if(dm) dm.textContent=(phone?phone:'')+(email?' · '+email:'');
    const sl=document.getElementById('lp-seva-list'); if(sl) sl.innerHTML='<p style="font-size:12px;color:#8B5E3C;">⏳ Loading seva donations…</p>';
    const st=document.getElementById('lp-status'); if(st) st.textContent='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    _lpCurrentDonor={id,name,phone,email}; _lpSevaRecords=[];

    try{
        const res=await fetch(`${API_BASE}/admin/donors/${id}/seva-labels?admin_username=${encodeURIComponent(_adminUsername)}`);
        const data=await res.json();
        if(!res.ok){if(sl)sl.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${data.detail||'Failed.'}</p>`;return;}
        _lpSevaRecords=data.records||[];
        if(!_lpSevaRecords.length){
            if(sl)sl.innerHTML='<p style="font-size:12px;color:#8B5E3C;padding:6px 0;">No seva donations found for this donor.</p>';
            return;
        }
        // Render seva list with checkboxes (all checked by default)
        if(sl){
            sl.innerHTML=`
            <div style="font-size:11px;color:#8B5E3C;margin-bottom:6px;">Select seva donations to print labels for:</div>
            ${_lpSevaRecords.map((r,i)=>`
            <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #f0e8d8;border-radius:6px;margin-bottom:5px;cursor:pointer;background:#fff;font-size:12px;color:#3B1F0B;"
                onmouseover="this.style.background='#FFF8E7'" onmouseout="this.style.background='#fff'">
                <input type="checkbox" id="lp_chk_${r.id}" value="${r.id}" checked style="width:14px;height:14px;accent-color:#E8821A;cursor:pointer;">
                <div style="flex:1;">
                    <strong>${r.seva_name}</strong> <span style="color:#E8821A;font-size:11px;">[${r.seva_type}]</span><br>
                    <span style="color:#8B5E3C;">₹${parseFloat(r.donation_amount).toLocaleString('en-IN')} &nbsp;|&nbsp; ${r.seva_date} &nbsp;|&nbsp; Seva Person: ${r.seva_person_name||'—'}</span>
                </div>
            </label>`).join('')}
            <button class="btn-primary" style="width:100%;font-size:12px;padding:8px;margin-top:6px;" onclick="lpGenerateLabels()">🏷 Generate Labels for Selected</button>`;
        }
    }catch(e){if(sl)sl.innerHTML=`<p style="font-size:12px;color:#c62828;">❌ ${e.message}</p>`;}
}

function lpClearDonor(){
    _lpCurrentDonor=null; _lpSevaRecords=[]; _lpLabelRows=[];
    const sd=document.getElementById('lp-selected-donor'); if(sd) sd.style.display='none';
    const pr=document.getElementById('lp-preview'); if(pr) pr.innerHTML='';
    const ac=document.getElementById('lp-actions'); if(ac) ac.style.display='none';
    const st=document.getElementById('lp-status'); if(st) st.textContent='';
}

async function lpGenerateLabels(){
    const statusEl=document.getElementById('lp-status'),preview=document.getElementById('lp-preview'),actions=document.getElementById('lp-actions');
    // Get selected seva IDs
    const selected=_lpSevaRecords.filter(r=>document.getElementById('lp_chk_'+r.id)?.checked);
    if(!selected.length){if(statusEl){statusEl.textContent='⚠ Select at least one seva donation.';statusEl.style.color='#c62828';}return;}
    if(statusEl){statusEl.textContent='⏳ Generating labels…';statusEl.style.color='#8B5E3C';}
    if(preview)preview.innerHTML='';
    if(actions)actions.style.display='none';
    _lpLabelRows=selected;

    if(preview)preview.innerHTML=await _buildLabelsHTML(_lpLabelRows);
    if(actions)actions.style.display='flex';
    if(statusEl)statusEl.textContent=`✅ ${_lpLabelRows.length} label${_lpLabelRows.length!==1?'s':''} generated — scroll to preview below.`;
}

/* ═══ Build printable label HTML ════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   LABEL PRINT — 9cm × 6cm, 2 cols, 1.5cm col-gap, 1cm row-gap
   A4 page (210×297mm, margin 8mm) fits exactly 2×4 = 8 labels
═══════════════════════════════════════════════════════════ */
function _lpSharedCss(){
    return `
    *{box-sizing:border-box;margin:0;padding:0;}

    /* Grid: 2 cols × 4 rows = 8 per A4 */
    .lp-page{
        display:grid;
        grid-template-columns:9cm 9cm;
        column-gap:1.5cm;
        row-gap:1cm;
        padding:6mm;
        background:#f5f0e8;
        width:fit-content;
    }

    /* Fixed 9×6cm — hard height so 4 rows fit one page */
    .lp-lbl{
        width:9cm;
        height:6cm;
        background:#fff;
        border:1.5px solid #3B1F0B;
        border-radius:4px;
        padding:5pt 6pt;
        display:flex;
        flex-direction:row;
        gap:4pt;
        overflow:hidden;
        font-family:'Segoe UI',Arial,sans-serif;
        font-size:6pt;
        color:#3B1F0B;
        line-height:1.3;
    }

    /* Left content column */
    .lp-body{
        flex:1;
        min-width:0;
        display:flex;
        flex-direction:column;
        gap:1.8pt;
        overflow:hidden;
    }

    /* Header row */
    .lp-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:3pt;
        border-bottom:1.5px solid #E8821A;
        padding-bottom:2pt;
        margin-bottom:2pt;
        flex-shrink:0;
    }
    .lp-temple{font-size:6.5pt;font-weight:700;color:#3B1F0B;}
    .lp-badge{background:#E8821A;color:#fff;font-size:5pt;font-weight:700;padding:1pt 5pt;border-radius:6pt;white-space:nowrap;flex-shrink:0;}

    /* Seva name */
    .lp-seva{font-size:6.5pt;font-weight:700;color:#E8821A;margin-bottom:1pt;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

    /* Key-value rows */
    .lp-row{display:flex;gap:2pt;font-size:5.5pt;line-height:1.25;}
    .lp-k{font-weight:700;min-width:40pt;color:#8B5E3C;flex-shrink:0;font-size:5pt;}
    .lp-v{word-break:break-word;flex:1;overflow:hidden;}
    .lp-v a{color:#1a73e8;font-size:4.5pt;word-break:break-all;}

    /* Divider */
    .lp-hr{border:none;border-top:1px dashed #e0c870;margin:1.5pt 0;flex-shrink:0;}

    /* Footer */
    .lp-foot{margin-top:auto;padding-top:1.5pt;font-size:4.5pt;color:#bbb;flex-shrink:0;}

    /* Right QR column */
    .lp-qr{
        flex-shrink:0;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
        gap:2pt;
        padding-top:2pt;
        width:54pt;
    }
    .lp-qr img{width:52pt;height:52pt;display:block;}
    .lp-qr-lbl{font-size:4.5pt;color:#8B5E3C;text-align:center;line-height:1.25;max-width:54pt;}
    .lp-no-qr{width:52pt;font-size:4.5pt;color:#ccc;text-align:center;padding-top:14pt;line-height:1.4;}

    /* Print / PDF rules */
    @media print{
        html,body{margin:0!important;padding:0!important;background:#fff!important;}
        .lp-page{
            display:grid;
            grid-template-columns:9cm 9cm;
            column-gap:1.5cm;
            row-gap:1cm;
            padding:8mm;
            background:#fff!important;
            width:auto;
        }
        .lp-lbl{
            width:9cm;
            height:6cm;
            break-inside:avoid;
            page-break-inside:avoid;
        }
        @page{size:A4 portrait;margin:0;}
    }`;
}

async function _buildLabelsHTML(rows){
    const css=`<style>${_lpSharedCss()}</style>`;
    let html=css+'<div class="lp-page" id="lp-print-area">';
    for(const r of rows){
        const addr=[r.address_line1,r.address_line2,r.address_city,r.address_state,r.address_pincode].filter(Boolean).join(', ')||'—';
        const mapUrl=_buildMapUrl(r.latitude,r.longitude);
        let qrHtml='<div class="lp-no-qr">No location<br>data</div>';
        if(mapUrl){
            const qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=78x78&color=3B1F0B&bgcolor=ffffff&qzone=1&data='+encodeURIComponent(mapUrl);
            qrHtml=`<img src="${qrSrc}" width="52" height="52" alt="QR" onerror="this.parentElement.innerHTML='<div class=\\'lp-no-qr\\'>QR<br>unavailable</div>'">`
                  +`<div class="lp-qr-lbl">📍 Scan to open<br>donor location</div>`;
        }
        const hinduRow=(()=>{
            if(r.seva_calendar_type==='Hindu'){
                let parts=[];
                if(r.hindu_purnima_name)  parts.push(r.hindu_purnima_name+' Pournami');
                if(r.hindu_amavasya_name) parts.push(r.hindu_amavasya_name+' Amavasai');
                if(r.hindu_krishna_tithi) parts.push('Krishna — '+r.hindu_krishna_tithi);
                if(r.hindu_shukla_tithi)  parts.push('Shukla — '+r.hindu_shukla_tithi);
                if(parts.length) return `<div class="lp-row"><span class="lp-k">Hindu Date:</span><span class="lp-v" style="color:#8B5E3C;font-style:italic;">${parts.join(' | ')}</span></div>`;
            }
            return '';
        })();
        html+=`
<div class="lp-lbl">
  <div class="lp-body">
    <div class="lp-head">
      <span class="lp-temple">🛕 Jagannath Temple</span>
      <span class="lp-badge">${r.seva_type}</span>
    </div>
    <div class="lp-seva">${r.seva_name}</div>
    <div class="lp-row"><span class="lp-k">Seva Date:</span><span class="lp-v">${r.seva_date}</span></div>
    ${hinduRow}
    <hr class="lp-hr">
    <div class="lp-row"><span class="lp-k">Donor:</span><span class="lp-v"><strong>${r.donor_name}</strong></span></div>
    <div class="lp-row"><span class="lp-k">Mobile:</span><span class="lp-v">${r.whatsapp_number||'—'}</span></div>
    <div class="lp-row"><span class="lp-k">Seva Person:</span><span class="lp-v">${r.seva_person_name||'—'}</span></div>
    <hr class="lp-hr">
    <div class="lp-row"><span class="lp-k">Address:</span><span class="lp-v">${addr}</span></div>
    ${mapUrl?`<div class="lp-row"><span class="lp-k">Map:</span><span class="lp-v"><a href="${mapUrl}" target="_blank">${mapUrl}</a></span></div>`:''}
    <div class="lp-foot">Receipt: ${r.receipt_no}${r.transaction_id?' | Txn: '+r.transaction_id:''}</div>
  </div>
  <div class="lp-qr">${qrHtml}</div>
</div>`;
    }
    return html+'</div>';
}

function _openPrintWindow(title, bodyContent){
    const win=window.open('','_blank');
    if(!win){alert('Pop-up blocked. Please allow pop-ups for this site.');return;}
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${_lpSharedCss()}</style>
</head><body>
${bodyContent}
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),900);},500);}<\/script>
</body></html>`);
    win.document.close();
}

function printLabels(){
    const preview=document.getElementById('lp-preview');
    if(!preview||!preview.innerHTML.trim()){alert('Generate labels first.');return;}
    _openPrintWindow('Seva Labels — Jagannath Temple', preview.innerHTML);
}

function downloadLabelsPDF(){
    const preview=document.getElementById('lp-preview');
    if(!preview||!preview.innerHTML.trim()){alert('Generate labels first.');return;}
    _openPrintWindow('Seva Labels PDF — Jagannath Temple', preview.innerHTML);
}

/* ═══════════════════════════════════════════════════════════════
   FAQ CHATBOT WIDGET  —  faq_routes.py integration
   Endpoints: POST /faq/session  |  POST /faq/ask  |  GET /faq/items
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── State ────────────────────────────────────────────────── */
    let _faqOpen       = false;
    let _faqSessionId  = null;
    let _faqUserName   = '';
    let _faqItems      = [];   // cached FAQ items for chips
    let _faqTypingEl   = null; // current typing indicator node
    let _faqSending    = false;

    /* ── Toggle open / close ─────────────────────────────────── */
    window.faqToggle = function () {
        _faqOpen = !_faqOpen;
        const win = document.getElementById('faq-chat-window');
        win.classList.toggle('faq-open', _faqOpen);
        if (_faqOpen && !_faqSessionId) {
            // Pre-fill name from donor form if available
            const fn = (document.getElementById('first_name') || {}).value || '';
            const ln = (document.getElementById('last_name')  || {}).value || '';
            if (fn) document.getElementById('faq-reg-name').value = (fn + ' ' + ln).trim();
            const ph = (document.getElementById('phone_number') || {}).value || '';
            if (ph) document.getElementById('faq-reg-phone').value = ph;
            setTimeout(() => {
                const inp = document.getElementById('faq-reg-name');
                if (inp && !inp.value) inp.focus();
            }, 320);
        }
    };

    /* ── Input helpers ───────────────────────────────────────── */
    window.faqClearErr = function (inputId, errId) {
        const i = document.getElementById(inputId);
        const e = document.getElementById(errId);
        if (i) i.classList.remove('faq-err');
        if (e) e.textContent = '';
    };

    window.faqAutoResize = function (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 90) + 'px';
    };

    /* ── Start session (POST /faq/session) ────────────────────── */
    window.faqStartSession = async function () {
        const nameEl  = document.getElementById('faq-reg-name');
        const phoneEl = document.getElementById('faq-reg-phone');
        const statusEl = document.getElementById('faq-reg-status');
        const btn     = document.getElementById('faq-start-btn');

        const name  = nameEl.value.trim();
        const phone = phoneEl.value.trim();

        let ok = true;
        if (!name) {
            nameEl.classList.add('faq-err');
            document.getElementById('faq-err-name').textContent = 'Name is required.';
            ok = false;
        }
        if (!phone || phone.replace(/[\s\+\-\(\)]/g, '').length < 7) {
            phoneEl.classList.add('faq-err');
            document.getElementById('faq-err-phone').textContent = 'Enter a valid phone number.';
            ok = false;
        }
        if (!ok) return;

        btn.disabled = true;
        statusEl.textContent = '⏳ Starting session…';

        try {
            const res  = await fetch('/faq/session', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name, phone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to start session.');

            _faqSessionId = data.session_id;
            _faqUserName  = data.name || name;

            statusEl.textContent = '';
            _faqSwitchToChat();
        } catch (err) {
            statusEl.textContent = '❌ ' + err.message;
            btn.disabled = false;
        }
    };

    /* ── Switch to chat UI ───────────────────────────────────── */
    async function _faqSwitchToChat() {
        document.getElementById('faq-register-panel').style.display = 'none';
        const panel = document.getElementById('faq-chat-panel');
        panel.style.display = 'flex';

        // Set session name label
        document.getElementById('faq-session-name').innerHTML =
            '🙏 &nbsp;' + _faqEscape(_faqUserName);

        // Load FAQ items for chips (once)
        if (_faqItems.length === 0) await _faqLoadItems();

        // Welcome message
        _faqAppendBot(
            '🙏 Jai Jagannath, **' + _faqUserName + '**!\n\n' +
            'I\'m your Temple Help Desk assistant. You can ask me about seva, gotra, nakshatra, ' +
            'donations, OTP, or any field in the form.\n\nTap a quick question below or type your own! 🌺',
            []
        );
    }

    /* ── Load FAQ items → chips ──────────────────────────────── */
    async function _faqLoadItems() {
        try {
            const res  = await fetch('/faq/items');
            const data = await res.json();
            _faqItems  = data || [];
            _faqRenderChips(_faqItems.slice(0, 12)); // show first 12 as chips
        } catch (_) {
            /* silently fail — chips are optional */
        }
    }

    function _faqRenderChips(items) {
        const row = document.getElementById('faq-chips-row');
        if (!row) return;
        row.innerHTML = items.map(item =>
            `<button class="faq-chip" onclick="faqAskChip(${JSON.stringify(item.question)})">${_faqEscape(item.question)}</button>`
        ).join('');
    }

    /* ── Chip click ──────────────────────────────────────────── */
    window.faqAskChip = function (question) {
        const inp = document.getElementById('faq-question-input');
        if (!inp) return;
        inp.value = question;
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 90) + 'px';
        inp.focus();
        faqSend();
    };

    /* ── Send message (POST /faq/ask) ────────────────────────── */
    window.faqSend = async function () {
        if (_faqSending) return;
        const input = document.getElementById('faq-question-input');
        const question = input.value.trim();
        if (!question || !_faqSessionId) return;

        _faqSending = true;
        const sendBtn = document.getElementById('faq-send-btn');
        sendBtn.disabled = true;
        input.value = '';
        input.style.height = 'auto';

        // Append user bubble
        _faqAppendUser(question);

        // Typing indicator
        _faqShowTyping();

        try {
            const res  = await fetch('/faq/ask', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ session_id: _faqSessionId, question }),
            });
            const data = await res.json();
            _faqHideTyping();

            if (!res.ok) throw new Error(data.detail || 'Something went wrong.');

            _faqAppendBot(data.answer, data.related || []);
        } catch (err) {
            _faqHideTyping();
            _faqAppendError('❌ ' + err.message);
        } finally {
            _faqSending = false;
            sendBtn.disabled = false;
            input.focus();
        }
    };

    /* ── Reset session ───────────────────────────────────────── */
    window.faqResetSession = function () {
        if (!confirm('Start a new chat session?')) return;
        _faqSessionId = null;
        _faqUserName  = '';
        document.getElementById('faq-messages').innerHTML     = '';
        document.getElementById('faq-register-panel').style.display = '';
        document.getElementById('faq-chat-panel').style.display     = 'none';
        document.getElementById('faq-reg-status').textContent       = '';
        document.getElementById('faq-start-btn').disabled           = false;
        document.getElementById('faq-reg-name').value               = '';
        document.getElementById('faq-reg-phone').value              = '';
        faqClearErr('faq-reg-name',  'faq-err-name');
        faqClearErr('faq-reg-phone', 'faq-err-phone');
    };

    /* ── DOM helpers ─────────────────────────────────────────── */
    function _faqAppendUser(text) {
        const msgs = document.getElementById('faq-messages');
        const el   = document.createElement('div');
        el.className = 'faq-bubble faq-bubble-user';
        el.textContent = text;
        msgs.appendChild(el);
        _faqScroll();
    }


    /* ═══ Shared bot avatar — 46px DP, right side of bubble ═══ */
    function _faqMakeAvatar() {
        const wrap = document.createElement('div');
        wrap.className = 'faq-bot-avatar';
        const img  = document.createElement('img');
        img.src    = 'https://image.pollinations.ai/prompt/Lord%20Jagannath%20deity%20golden%20ornate%20temple%20icon%20divine%20circular%20avatar%20India%20sacred?model=gpt-image-1&width=200&height=200&nologo=true&seed=108';
        img.alt    = 'Jagannath';
        img.onerror = function() { this.parentElement.textContent = '🛕'; };
        wrap.appendChild(img);
        return wrap;
    }

    function _faqAppendBot(text, related) {
        const msgs = document.getElementById('faq-messages');
        const row  = document.createElement('div');
        row.className = 'faq-bot-row';

        const bubble = document.createElement('div');
        bubble.className = 'faq-bubble faq-bubble-bot';
        const safe = _faqEscape(text)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        bubble.innerHTML = safe;

        if (related && related.length > 0) {
            const relDiv = document.createElement('div');
            relDiv.className = 'faq-related-chips';
            const lbl = document.createElement('span');
            lbl.className = 'faq-related-label';
            lbl.textContent = '\uD83D\uDD17 ALSO SEE';
            relDiv.appendChild(lbl);
            related.forEach(function(r) {
                const btn = document.createElement('button');
                btn.className = 'faq-related-chip';
                btn.textContent = r.question;
                btn.onclick = function() { window.faqAskChip(r.question); };
                relDiv.appendChild(btn);
            });
            bubble.appendChild(relDiv);
        }

        row.appendChild(bubble);           /* left  (order:1) */
        row.appendChild(_faqMakeAvatar()); /* right (order:2) */
        msgs.appendChild(row);
        _faqScroll();
    }

    function _faqAppendError(text) {
        const msgs = document.getElementById('faq-messages');
        const el   = document.createElement('div');
        el.className = 'faq-error-bubble';
        el.textContent = text;
        msgs.appendChild(el);
        _faqScroll();
    }

    function _faqShowTyping() {
        const msgs = document.getElementById('faq-messages');
        const row  = document.createElement('div');
        row.className = 'faq-bot-row';
        const bubble = document.createElement('div');
        bubble.className = 'faq-bubble faq-bubble-bot';
        bubble.style.padding = '0';
        bubble.innerHTML = '<div class="faq-typing"><span></span><span></span><span></span></div>';
        row.appendChild(bubble);
        row.appendChild(_faqMakeAvatar());
        msgs.appendChild(row);
        _faqTypingEl = row;
        _faqScroll();
    }

    function _faqHideTyping() {
        if (_faqTypingEl) {
            _faqTypingEl.remove();
            _faqTypingEl = null;
        }
    }

    function _faqScroll() {
        const msgs = document.getElementById('faq-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    function _faqEscape(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── Close on backdrop click for accessibility ───────────── */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _faqOpen) faqToggle();
    });

})();