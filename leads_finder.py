#!/usr/bin/env python3
"""
Outdated Website Lead Finder

Finds small businesses with outdated websites for web design outreach.
Searches DuckDuckGo (Google fallback), checks Wayback Machine, and scans
each site for outdated signals. Scores leads 0-100 and exports to CSV.
"""

import argparse
import csv
import re
import ssl
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from colorama import Fore, Style, init as colorama_init

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CURRENT_YEAR = datetime.now().year
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15
WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx"

# Outdated-text patterns
OUTDATED_PATTERNS = [
    re.compile(r"\bflash\s*player\b", re.I),
    re.compile(r"\binternet\s*explorer\b", re.I),
    re.compile(r"\bIE\s*[6-9]\b"),
    re.compile(r"\bNetscape\b", re.I),
    re.compile(r"\bGeoCities\b", re.I),
    re.compile(r"\bunder\s*construction\b", re.I),
    re.compile(r"\bbest\s*viewed\s*(in|with)\b", re.I),
    re.compile(r"\b(click|tap)\s*here\s*to\s*enter\b", re.I),
]

# Copyright year regex
COPYRIGHT_RE = re.compile(
    r"(?:©|\bcopyright\b|\(c\))\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?", re.I
)


# ---------------------------------------------------------------------------
# Search helpers
# ---------------------------------------------------------------------------
def search_duckduckgo(query: str, max_results: int) -> list[str]:
    """Search DuckDuckGo and return a list of URLs."""
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            return [r["href"] for r in results if "href" in r]
    except Exception as exc:
        print(f"{Fore.YELLOW}DuckDuckGo search failed: {exc}{Style.RESET_ALL}")
        return []


def search_google(query: str, max_results: int) -> list[str]:
    """Fallback: search Google and return a list of URLs."""
    try:
        from googlesearch import search

        return list(search(query, num_results=max_results))
    except Exception as exc:
        print(f"{Fore.YELLOW}Google search failed: {exc}{Style.RESET_ALL}")
        return []


def find_websites(niche: str, location: str, max_results: int) -> list[str]:
    """Return unique website URLs for the given niche + location."""
    query = f"{niche} {location} website"
    print(f"\n{Fore.CYAN}Searching DuckDuckGo for: {query}{Style.RESET_ALL}")
    urls = search_duckduckgo(query, max_results)

    if not urls:
        print(f"{Fore.CYAN}Trying Google fallback...{Style.RESET_ALL}")
        urls = search_google(query, max_results)

    # Deduplicate by domain
    seen_domains: set[str] = set()
    unique: list[str] = []
    for url in urls:
        domain = urlparse(url).netloc.lower()
        if domain and domain not in seen_domains:
            seen_domains.add(domain)
            unique.append(url)
    return unique[:max_results]


# ---------------------------------------------------------------------------
# Wayback Machine helper
# ---------------------------------------------------------------------------
def get_last_archived_date(url: str) -> tuple[str | None, int | None]:
    """
    Query the Wayback Machine CDX API for the most recent snapshot.
    Returns (date_string, days_since) or (None, None).
    """
    domain = urlparse(url).netloc or url
    try:
        resp = requests.get(
            WAYBACK_CDX_URL,
            params={
                "url": domain,
                "output": "json",
                "limit": 1,
                "fl": "timestamp",
                "sort": "reverse",
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if len(data) < 2:
            return None, None
        timestamp = data[1][0]  # e.g. "20220315142301"
        dt = datetime.strptime(timestamp[:8], "%Y%m%d").replace(tzinfo=timezone.utc)
        date_str = dt.strftime("%Y-%m-%d")
        days_since = (datetime.now(timezone.utc) - dt).days
        return date_str, days_since
    except Exception:
        return None, None


# ---------------------------------------------------------------------------
# Site analysis
# ---------------------------------------------------------------------------
def fetch_page(url: str) -> tuple[requests.Response | None, str | None]:
    """Fetch a URL; return (response, error_message)."""
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        return resp, None
    except requests.exceptions.SSLError:
        # Try without SSL verification
        try:
            resp = requests.get(
                url, headers=headers, timeout=REQUEST_TIMEOUT,
                allow_redirects=True, verify=False,
            )
            return resp, "ssl_error"
        except Exception as exc:
            return None, str(exc)
    except Exception as exc:
        return None, str(exc)


def analyze_site(url: str, min_years: int) -> dict:
    """Analyze a single URL and return a lead dict."""
    lead: dict = {
        "url": url,
        "page_title": "",
        "last_archived": "",
        "days_since_archived": "",
        "has_https": "TRUE",
        "has_mobile_meta": "TRUE",
        "copyright_year": "",
        "contact_email": "",
        "reasons": [],
        "text_snippet": "",
        "score": 0,
    }

    # --- HTTPS check ---
    parsed = urlparse(url)
    if parsed.scheme != "https":
        lead["has_https"] = "FALSE"
        lead["score"] += 20
        lead["reasons"].append("No HTTPS")

    # --- Wayback Machine ---
    last_archived, days_since = get_last_archived_date(url)
    if last_archived:
        lead["last_archived"] = last_archived
        lead["days_since_archived"] = days_since
        years_old = (days_since or 0) / 365.25
        if years_old >= 6:
            lead["score"] += 35
            lead["reasons"].append(f"Archive {years_old:.0f}+ years old")
        elif years_old >= 4:
            lead["score"] += 25
            lead["reasons"].append(f"Archive {years_old:.0f}+ years old")
        elif years_old >= 3:
            lead["score"] += 15
            lead["reasons"].append(f"Archive {years_old:.0f}+ years old")

    # --- Fetch the live page ---
    resp, err = fetch_page(url)
    if resp is None:
        lead["score"] += 10
        lead["reasons"].append(f"Site offline/broken ({err})")
        lead["has_mobile_meta"] = "FALSE"
        return _grade(lead)

    if err == "ssl_error":
        lead["has_https"] = "FALSE"
        if "No HTTPS" not in lead["reasons"]:
            lead["score"] += 20
            lead["reasons"].append("SSL certificate error")

    # --- Parse HTML ---
    soup = BeautifulSoup(resp.text, "html.parser")

    # Title
    if soup.title and soup.title.string:
        lead["page_title"] = soup.title.string.strip()[:120]

    # Mobile viewport
    viewport = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    if not viewport:
        lead["has_mobile_meta"] = "FALSE"
        lead["score"] += 20
        lead["reasons"].append("No mobile viewport meta")

    # Visible text
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    lead["text_snippet"] = text[:200]

    # Copyright year
    matches = COPYRIGHT_RE.findall(text)
    if matches:
        years = []
        for start, end in matches:
            years.append(int(end) if end else int(start))
        latest = max(years)
        lead["copyright_year"] = str(latest)
        if CURRENT_YEAR - latest >= min_years:
            lead["score"] += 15
            lead["reasons"].append(f"Copyright year {latest}")

    # Outdated text patterns
    outdated_points = 0
    for pattern in OUTDATED_PATTERNS:
        if pattern.search(text):
            match_text = pattern.pattern.replace("\\b", "").replace("\\s*", " ")
            lead["reasons"].append(f"Outdated text: {match_text}")
            outdated_points += 5
            if outdated_points >= 15:
                break
    lead["score"] += outdated_points

    # Contact email
    email_match = re.search(
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text
    )
    if email_match:
        lead["contact_email"] = email_match.group(0)

    return _grade(lead)


def _grade(lead: dict) -> dict:
    """Assign a grade based on score."""
    score = min(lead["score"], 100)
    lead["score"] = score
    if score >= 70:
        lead["grade"] = "HOT"
    elif score >= 45:
        lead["grade"] = "WARM"
    elif score >= 20:
        lead["grade"] = "COOL"
    else:
        lead["grade"] = "COLD"
    lead["reasons"] = "; ".join(lead["reasons"]) if lead["reasons"] else ""
    return lead


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
GRADE_COLORS = {
    "HOT": Fore.RED,
    "WARM": Fore.GREEN,
    "COOL": Fore.YELLOW,
    "COLD": Fore.BLUE,
}
GRADE_ICONS = {
    "HOT": "\U0001f525",
    "WARM": "\u2705",
    "COOL": "\U0001f7e1",
    "COLD": "\u2744\ufe0f",
}

CSV_COLUMNS = [
    "grade", "score", "url", "page_title", "last_archived",
    "days_since_archived", "has_https", "has_mobile_meta",
    "copyright_year", "contact_email", "reasons", "text_snippet",
]


def print_lead(lead: dict) -> None:
    """Pretty-print a single lead to the terminal."""
    grade = lead["grade"]
    color = GRADE_COLORS.get(grade, "")
    icon = GRADE_ICONS.get(grade, "")
    print(
        f"  {color}{icon} [{grade}] Score: {lead['score']:>3}  "
        f"{lead['url']}{Style.RESET_ALL}"
    )
    if lead.get("page_title"):
        print(f"      Title: {lead['page_title']}")
    if lead.get("reasons"):
        print(f"      Reasons: {lead['reasons']}")
    if lead.get("contact_email"):
        print(f"      Email: {lead['contact_email']}")
    print()


def write_csv(leads: list[dict], niche: str, location: str) -> str:
    """Write leads to a CSV and return the filename."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_niche = re.sub(r"[^a-z0-9]+", "_", niche.lower()).strip("_")
    safe_loc = re.sub(r"[^a-z0-9]+", "_", location.lower()).strip("_")
    filename = f"leads_{safe_niche}_{safe_loc}_{ts}.csv"

    with open(filename, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for lead in sorted(leads, key=lambda x: x["score"], reverse=True):
            writer.writerow(lead)

    return filename


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    colorama_init()

    parser = argparse.ArgumentParser(
        description="Find small businesses with outdated websites."
    )
    parser.add_argument("--niche", default="plumber", help="Business niche to search")
    parser.add_argument("--location", default="Dallas TX", help="City and state")
    parser.add_argument(
        "--years", type=int, default=3,
        help="Min years since last update to flag as outdated",
    )
    parser.add_argument(
        "--results", type=int, default=20, help="Max websites to check",
    )
    parser.add_argument(
        "--urls", default=None,
        help="Comma-separated URLs to check directly (skips search)",
    )
    parser.add_argument(
        "--url-file", default=None,
        help="Path to a .txt file with one URL per line",
    )
    args = parser.parse_args()

    # Gather URLs
    urls: list[str] = []
    if args.urls:
        urls = [u.strip() for u in args.urls.split(",") if u.strip()]
    elif args.url_file:
        with open(args.url_file, encoding="utf-8") as fh:
            urls = [line.strip() for line in fh if line.strip()]
    else:
        urls = find_websites(args.niche, args.location, args.results)

    if not urls:
        print(f"{Fore.RED}No websites found. Try a different niche/location or use --urls.{Style.RESET_ALL}")
        sys.exit(1)

    print(f"\n{Fore.CYAN}Analyzing {len(urls)} website(s)...{Style.RESET_ALL}\n")

    leads: list[dict] = []
    for i, url in enumerate(urls, 1):
        # Ensure URL has a scheme
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        print(f"  [{i}/{len(urls)}] Checking {url} ...")
        try:
            lead = analyze_site(url, args.years)
            leads.append(lead)
            print_lead(lead)
        except Exception as exc:
            print(f"    {Fore.RED}Error: {exc}{Style.RESET_ALL}\n")

        # Small delay to be polite
        if i < len(urls):
            time.sleep(1)

    if not leads:
        print(f"{Fore.RED}No leads generated.{Style.RESET_ALL}")
        sys.exit(1)

    # Write CSV
    csv_file = write_csv(leads, args.niche, args.location)

    # Summary
    hot = [l for l in leads if l["grade"] == "HOT"]
    warm = [l for l in leads if l["grade"] == "WARM"]
    cool = [l for l in leads if l["grade"] == "COOL"]
    cold = [l for l in leads if l["grade"] == "COLD"]

    print(f"\n{'='*60}")
    print(f"{Fore.CYAN}  RESULTS SUMMARY{Style.RESET_ALL}")
    print(f"{'='*60}")
    print(f"  {Fore.RED}\U0001f525 HOT:  {len(hot)}{Style.RESET_ALL}")
    print(f"  {Fore.GREEN}\u2705 WARM: {len(warm)}{Style.RESET_ALL}")
    print(f"  {Fore.YELLOW}\U0001f7e1 COOL: {len(cool)}{Style.RESET_ALL}")
    print(f"  {Fore.BLUE}\u2744\ufe0f COLD: {len(cold)}{Style.RESET_ALL}")
    print(f"  Total: {len(leads)}")
    print(f"\n  CSV saved to: {Fore.GREEN}{csv_file}{Style.RESET_ALL}")
    print(f"  Columns: {', '.join(CSV_COLUMNS)}")
    print(f"{'='*60}\n")

    # Print top HOT and WARM leads
    top_leads = [l for l in leads if l["grade"] in ("HOT", "WARM")]
    top_leads.sort(key=lambda x: x["score"], reverse=True)
    if top_leads:
        print(f"{Fore.CYAN}  TOP LEADS TO CONTACT:{Style.RESET_ALL}\n")
        for lead in top_leads[:10]:
            print_lead(lead)


if __name__ == "__main__":
    main()
