/**
 * Curated pools of synthetic-but-realistically-shaped reference data.
 *
 * Everything here is fictional. Names, businesses, addresses, and merchants are
 * generic combinations chosen to *look* like a real community-bank book without
 * referencing any real person or business.
 */

export const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph",
  "Jessica", "Thomas", "Sarah", "Daniel", "Karen", "Carlos", "Maria", "Aiden",
  "Sofia", "Marcus", "Aisha", "Wei", "Priya", "Liam", "Olivia", "Noah", "Emma",
  "Ethan", "Ava", "Diego", "Camila", "Hassan", "Fatima", "Grace", "Henry",
  "Nina", "Omar", "Ruth", "Samuel", "Tina", "Victor", "Wendy", "Yusuf",
];

export const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee",
  "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez",
  "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott",
  "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker",
  "Patel", "Kim", "Okafor", "Reyes",
];

/** City / state / approximate ZIP triples in community-bank-friendly markets. */
export const CITIES: { city: string; state: string; zip: string }[] = [
  { city: "Cedar Falls", state: "IA", zip: "50613" },
  { city: "Bozeman", state: "MT", zip: "59715" },
  { city: "Asheville", state: "NC", zip: "28801" },
  { city: "Bend", state: "OR", zip: "97701" },
  { city: "Athens", state: "GA", zip: "30601" },
  { city: "Lawrence", state: "KS", zip: "66044" },
  { city: "Burlington", state: "VT", zip: "05401" },
  { city: "Flagstaff", state: "AZ", zip: "86001" },
  { city: "Traverse City", state: "MI", zip: "49684" },
  { city: "Bentonville", state: "AR", zip: "72712" },
  { city: "Greenville", state: "SC", zip: "29601" },
  { city: "Stillwater", state: "OK", zip: "74074" },
  { city: "Dubuque", state: "IA", zip: "52001" },
  { city: "Missoula", state: "MT", zip: "59801" },
  { city: "Roanoke", state: "VA", zip: "24011" },
  { city: "Loveland", state: "CO", zip: "80537" },
  { city: "Fargo", state: "ND", zip: "58102" },
  { city: "Tupelo", state: "MS", zip: "38801" },
  { city: "Manhattan", state: "KS", zip: "66502" },
  { city: "Corvallis", state: "OR", zip: "97330" },
];

export const STREET_NAMES = [
  "Maple", "Oak", "Cedar", "Pine", "Elm", "Walnut", "Birch", "Willow",
  "Chestnut", "Sycamore", "Main", "Market", "Union", "Lincoln", "Jefferson",
  "Madison", "Franklin", "Highland", "Lakeview", "Riverside", "Sunset",
  "Prairie", "Meadow", "Spring", "Mill", "College", "Church", "Park",
];

export const STREET_SUFFIXES = ["St", "Ave", "Rd", "Dr", "Ln", "Blvd", "Ct", "Way"];

export const BUSINESS_NAME_PARTS = {
  prefixes: [
    "Cedar Valley", "Summit", "Riverbend", "Prairie", "Granite", "Lakeside",
    "Northgate", "Heartland", "Evergreen", "Copper Creek", "Maple Ridge",
    "Blue Sky", "Foundry", "Harbor", "Stonebridge", "Meridian", "Pioneer",
    "Highland", "Sunrise", "Willow Park",
  ],
  industries: [
    "Plumbing", "Construction", "Auto Repair", "Dental", "Consulting",
    "Landscaping", "Bakery", "Brewing", "Logistics", "Electric", "Roofing",
    "Family Medicine", "Veterinary", "Coffee Roasters", "Outfitters",
    "Properties", "Manufacturing", "Catering", "Fitness", "Print Shop",
  ],
  suffixes: ["LLC", "Inc.", "Co.", "Group", "Partners", "Holdings", "& Sons"],
};

/** Merchants for card/POS transactions, with merchant category codes. */
export const MERCHANTS: { name: string; mcc: string; category: string; min: number; max: number }[] = [
  { name: "Hy-Vee Grocery", mcc: "5411", category: "Grocery", min: 12, max: 240 },
  { name: "Shell Fuel", mcc: "5541", category: "Fuel", min: 25, max: 90 },
  { name: "Target Store", mcc: "5310", category: "Discount", min: 15, max: 320 },
  { name: "The Coffee Mill", mcc: "5814", category: "Dining", min: 4, max: 28 },
  { name: "Riverside Diner", mcc: "5812", category: "Dining", min: 18, max: 120 },
  { name: "Ace Hardware", mcc: "5251", category: "Home Improvement", min: 8, max: 180 },
  { name: "CVS Pharmacy", mcc: "5912", category: "Pharmacy", min: 6, max: 140 },
  { name: "Northgate Cinema", mcc: "7832", category: "Entertainment", min: 12, max: 75 },
  { name: "Summit Sporting Goods", mcc: "5941", category: "Retail", min: 20, max: 400 },
  { name: "Prairie Pet Supply", mcc: "5995", category: "Retail", min: 10, max: 160 },
  { name: "Streaming Plus", mcc: "5815", category: "Digital", min: 9, max: 20 },
  { name: "Metro Transit", mcc: "4111", category: "Transit", min: 2, max: 40 },
  { name: "Lakeside Auto Parts", mcc: "5533", category: "Automotive", min: 15, max: 350 },
  { name: "Bloom Florist", mcc: "5992", category: "Retail", min: 25, max: 150 },
  { name: "Campus Bookstore", mcc: "5942", category: "Retail", min: 18, max: 260 },
  { name: "Harbor Seafood Market", mcc: "5422", category: "Grocery", min: 14, max: 130 },
];

/** Counterparties for ACH credits (employers / income). */
export const ACH_CREDIT_SOURCES = [
  "ACME PAYROLL", "SUMMIT HEALTH PAYROLL", "PRAIRIE SCHOOLS DD", "STATE OF IOWA PAY",
  "RIVERBEND MFG PAYROLL", "GIG PLATFORM PAYOUT", "SOCIAL SECURITY ADMIN",
  "PENSION BENEFITS", "IRS TREAS 310 REFUND",
];

/** Counterparties for ACH debits (billers). */
export const ACH_DEBIT_BILLERS = [
  "CITY UTILITIES", "EVERGREEN INSURANCE", "NORTHSTAR MORTGAGE", "APEX WIRELESS",
  "STREAMING PLUS", "FITNESS CLUB DUES", "STUDENT LOAN SERV", "AUTO INS PREMIUM",
  "INTERNET & CABLE", "CARD PAYMENT THANK YOU",
];

/** Counterparties for wires (business-flavored). */
export const WIRE_COUNTERPARTIES = [
  "MERIDIAN SUPPLY CO", "STONEBRIDGE PROPERTIES", "PIONEER EQUIPMENT LEASING",
  "HARBOR IMPORT PARTNERS", "GRANITE TITLE & ESCROW", "FOUNDRY CAPITAL LLC",
  "BLUE SKY DISTRIBUTION", "COPPER CREEK CONTRACTORS",
];

export const BRANCHES = [
  "Main & 1st", "Westgate", "Downtown", "North Branch", "University Plaza",
  "Riverside", "Airport Road", "Eastside",
];
