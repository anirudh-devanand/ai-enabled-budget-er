"""Global deterministic rules: regex over the normalized descriptor.

First confident match wins. These cover Canadian staples and universal bank
patterns; per-household user rules (created from corrections) always run
before these and take precedence.
"""

import re
from dataclasses import dataclass

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("income", "Income"),
    ("transfers", "Transfers"),
    ("groceries", "Groceries"),
    ("dining", "Dining & Takeout"),
    ("transport", "Transportation"),
    ("housing", "Housing & Rent"),
    ("utilities", "Utilities & Bills"),
    ("subscriptions", "Subscriptions"),
    ("shopping", "Shopping"),
    ("health", "Health & Fitness"),
    ("entertainment", "Entertainment"),
    ("travel", "Travel"),
    ("fees", "Fees & Charges"),
    ("other", "Other"),
]


@dataclass(frozen=True)
class GlobalRule:
    pattern: re.Pattern[str]
    merchant: str | None
    category_slug: str
    confidence: float = 0.95


def _rule(
    pattern: str, merchant: str | None, category: str, confidence: float = 0.95
) -> GlobalRule:
    return GlobalRule(re.compile(pattern), merchant, category, confidence)


# Order matters: more specific patterns first (UBER EATS before UBER).
GLOBAL_RULES: list[GlobalRule] = [
    # Income / transfers / fees - bank-side patterns, no merchant.
    _rule(r"\b(PAYROLL|DIRECT DEPOSIT|PAY DEPOSIT|SALARY)\b", None, "income", 0.98),
    _rule(r"\bINTEREST (PAID|EARNED|CREDIT)\b", None, "income", 0.95),
    _rule(r"\bGC DEPOSIT\b|\bGOVERNMENT( OF)? CANADA\b|\bCANADA\s+(FED|PRO)\b", None, "income", 0.9),
    _rule(r"\bE[- ]?TRANSFER\b|\bETRNSFR\b|\bINTERAC TRANSFER\b", None, "transfers", 0.95),
    _rule(r"\b(TFR|TRANSFER)\b.*\b(TO|FROM)\b", None, "transfers", 0.9),
    _rule(r"\b(CREDIT CARD|CC|LOAN|MORTGAGE) PAYMENT\b|\bPAYMENT - THANK YOU\b", None, "transfers", 0.9),
    _rule(r"\b(NSF|OVERDRAFT|SERVICE CHARGE|MONTHLY (ACCOUNT )?FEE|ATM FEE|WIRE FEE)\b", None, "fees", 0.97),
    # Groceries.
    _rule(r"\bLOBLAWS?\b", "Loblaws", "groceries"),
    _rule(r"\bNO ?FRILLS\b", "No Frills", "groceries"),
    _rule(r"\bSOBEYS\b", "Sobeys", "groceries"),
    _rule(r"\bMETRO(?! PRESTO)\b", "Metro", "groceries", 0.85),
    _rule(r"\bFRESHCO\b", "FreshCo", "groceries"),
    _rule(r"\bSAVE ?ON ?FOODS\b", "Save-On-Foods", "groceries"),
    _rule(r"\bREAL CDN\.? SUPERSTORE\b|\bSUPERSTORE\b", "Real Canadian Superstore", "groceries"),
    _rule(r"\bT ?& ?T SUPERMARKET\b", "T&T Supermarket", "groceries"),
    _rule(r"\bCOSTCO WHOLESALE\b|\bCOSTCO\b", "Costco", "groceries", 0.85),
    _rule(r"\bWAL-?MART\b", "Walmart", "shopping", 0.8),
    _rule(r"\bINSTACART\b", "Instacart", "groceries"),
    # Dining & takeout.
    _rule(r"\bTIM HORTONS?\b|\bTIMHORTONS\b", "Tim Hortons", "dining"),
    _rule(r"\bSTARBUCKS\b", "Starbucks", "dining"),
    _rule(r"\bMCDONALD'?S?\b", "McDonald's", "dining"),
    _rule(r"\bA ?& ?W\b", "A&W", "dining"),
    _rule(r"\bSUBWAY\b", "Subway", "dining"),
    _rule(r"\bUBER\s*EATS\b|\bUBER \*?EATS\b", "Uber Eats", "dining"),
    _rule(r"\bSKIP ?THE ?DISHES\b|\bSKIPTHEDISHES\b", "SkipTheDishes", "dining"),
    _rule(r"\bDOORDASH\b", "DoorDash", "dining"),
    _rule(r"\bPIZZA PIZZA\b", "Pizza Pizza", "dining"),
    _rule(r"\bKFC\b", "KFC", "dining"),
    _rule(r"\bCHIPOTLE\b", "Chipotle", "dining"),
    # Transportation.
    _rule(r"\bUBER( TRIP| BV)?\b", "Uber", "transport", 0.85),
    _rule(r"\bLYFT\b", "Lyft", "transport"),
    _rule(r"\bPRESTO\b(?! CARD RELOAD FEE)", "PRESTO", "transport"),
    _rule(r"\bTTC\b", "TTC", "transport"),
    _rule(r"\bTRANSLINK\b|\bCOMPASS\b", "TransLink", "transport", 0.85),
    _rule(r"\bPETRO-?CAN(ADA)?\b", "Petro-Canada", "transport"),
    _rule(r"\bESSO\b", "Esso", "transport"),
    _rule(r"\bSHELL\b", "Shell", "transport", 0.85),
    _rule(r"\bCHEVRON\b", "Chevron", "transport"),
    _rule(r"\bGREEN P\b|\bIMPARK\b|\bPRECISE PARKLINK\b", None, "transport", 0.85),
    # Subscriptions & digital.
    _rule(r"\bNETFLIX\b", "Netflix", "subscriptions"),
    _rule(r"\bSPOTIFY\b", "Spotify", "subscriptions"),
    _rule(r"\bDISNEY ?(PLUS|\+)\b", "Disney+", "subscriptions"),
    _rule(r"\bCRAVE\b", "Crave", "subscriptions", 0.85),
    _rule(r"\bAPPLE\.COM(/| )?BILL\b|\bITUNES\b", "Apple", "subscriptions"),
    _rule(r"\bAMAZON PRIME\b|\bPRIME MEMBER\b", "Amazon Prime", "subscriptions"),
    _rule(r"\bYOUTUBE ?(PREMIUM|MUSIC)?\b", "YouTube", "subscriptions", 0.85),
    _rule(r"\bOPENAI\b|\bCHATGPT\b", "OpenAI", "subscriptions"),
    # Shopping.
    _rule(r"\bAMAZON\b|\bAMZN\b", "Amazon", "shopping"),
    _rule(r"\bSHOPPERS DRUG MART\b|\bSHOPPERSDRUGMART\b", "Shoppers Drug Mart", "shopping"),
    _rule(r"\bCANADIAN TIRE\b", "Canadian Tire", "shopping"),
    _rule(r"\bHOME DEPOT\b", "Home Depot", "shopping"),
    _rule(r"\bIKEA\b", "IKEA", "shopping"),
    _rule(r"\bBEST BUY\b", "Best Buy", "shopping"),
    _rule(r"\bDOLLARAMA\b", "Dollarama", "shopping"),
    _rule(r"\bWINNERS\b", "Winners", "shopping"),
    _rule(r"\bH ?& ?M\b", "H&M", "shopping"),
    _rule(r"\bUNIQLO\b", "Uniqlo", "shopping"),
    # Utilities & bills.
    _rule(r"\bROGERS\b", "Rogers", "utilities"),
    _rule(r"\bBELL( CANADA| MOBILITY)?\b", "Bell", "utilities", 0.85),
    _rule(r"\bTELUS\b", "Telus", "utilities"),
    _rule(r"\bFIDO\b", "Fido", "utilities"),
    _rule(r"\bKOODO\b", "Koodo", "utilities"),
    _rule(r"\bFREEDOM MOBILE\b", "Freedom Mobile", "utilities"),
    _rule(r"\bHYDRO[- ]?(ONE|QUEBEC|OTTAWA)?\b", None, "utilities", 0.85),
    _rule(r"\bENBRIDGE\b", "Enbridge", "utilities"),
    _rule(r"\bBC HYDRO\b", "BC Hydro", "utilities"),
    _rule(r"\bFORTISBC\b", "FortisBC", "utilities"),
    # Housing.
    _rule(r"\bRENT\b|\bLANDLORD\b|\bPROPERTY MGMT\b", None, "housing", 0.8),
    # Health & fitness.
    _rule(r"\bGOODLIFE( FITNESS)?\b", "GoodLife Fitness", "health"),
    _rule(r"\bPLANET FITNESS\b", "Planet Fitness", "health"),
    _rule(r"\bREXALL\b", "Rexall", "health"),
    _rule(r"\bLIFELABS\b", "LifeLabs", "health"),
    # Entertainment.
    _rule(r"\bCINEPLEX\b", "Cineplex", "entertainment"),
    _rule(r"\bSTEAM(GAMES| PURCHASE)?\b", "Steam", "entertainment", 0.85),
    _rule(r"\bPLAYSTATION\b|\bSONY INTERACTIVE\b", "PlayStation", "entertainment"),
    _rule(r"\bNINTENDO\b", "Nintendo", "entertainment"),
    _rule(r"\bTICKETMASTER\b", "Ticketmaster", "entertainment"),
    # Travel.
    _rule(r"\bAIR CANADA\b", "Air Canada", "travel"),
    _rule(r"\bWESTJET\b", "WestJet", "travel"),
    _rule(r"\bPORTER AIR(LINES)?\b", "Porter Airlines", "travel"),
    _rule(r"\bVIA RAIL\b", "VIA Rail", "travel"),
    _rule(r"\bAIRBNB\b", "Airbnb", "travel"),
    _rule(r"\bBOOKING\.COM\b", "Booking.com", "travel"),
    _rule(r"\bEXPEDIA\b", "Expedia", "travel"),
    # Fintech / bank counterparties.
    _rule(r"\bNEO FINANCIAL\b", "Neo Financial", "transfers", 0.8),
    _rule(r"\bWEALTHSIMPLE\b", "Wealthsimple", "transfers", 0.85),
    _rule(r"\bKOHO\b", "KOHO", "transfers", 0.85),
    _rule(r"\bPAYPAL\b", "PayPal", "shopping", 0.7),
]


def match_global_rule(normalized: str) -> GlobalRule | None:
    for rule in GLOBAL_RULES:
        if rule.pattern.search(normalized):
            return rule
    return None
