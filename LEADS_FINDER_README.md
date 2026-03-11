# Outdated Website Lead Finder

A Python automation tool that finds small businesses with outdated websites so you can pitch them a redesign.

## What It Does

Given a niche and city, the script:

1. Searches **DuckDuckGo** (Google as fallback) for business websites
2. Checks the **Wayback Machine CDX API** (free, no key needed) for last archived date
3. Visits each live site and scans for outdated signals:
   - No HTTPS
   - No mobile viewport tag
   - Old copyright year (3+ years ago)
   - Flash/IE references in page text
4. Scores each lead **0-100** and grades it HOT / WARM / COOL / COLD
5. Exports all results to a **CSV file**

## Setup

```bash
pip install -r requirements.txt
```

## Usage

### Search by niche and location

```bash
python leads_finder.py --niche "plumber" --location "Dallas TX"
python leads_finder.py --niche "dentist" --location "Austin TX"
python leads_finder.py --niche "law firm" --location "Miami FL" --years 2
python leads_finder.py --niche "restaurant" --location "Chicago IL" --results 30
```

### Check specific URLs

```bash
python leads_finder.py --urls "https://example.com,https://another-site.com"
```

### Check URLs from a file

```bash
python leads_finder.py --url-file urls.txt
```

## CLI Arguments

| Argument | Default | Description |
|---|---|---|
| `--niche` | `plumber` | Type of business to search for |
| `--location` | `Dallas TX` | City and state to target |
| `--years` | `3` | Min years since last update to flag as outdated |
| `--results` | `20` | Max number of websites to check |
| `--urls` | *(none)* | Comma-separated URLs to check directly (skips search) |
| `--url-file` | *(none)* | Path to a `.txt` file with one URL per line |

## Scoring

| Signal | Points |
|---|---|
| Wayback archive is 6+ years old | 35 |
| Wayback archive is 4-5 years old | 25 |
| Wayback archive is 3-4 years old | 15 |
| No HTTPS | 20 |
| No mobile viewport meta tag | 20 |
| Copyright year is 3+ years old | 15 |
| Outdated text (Flash, IE, etc.) | up to 15 |
| Site is offline or broken | 10 |

| Grade | Score | Action |
|---|---|---|
| HOT | 70-100 | Contact immediately |
| WARM | 45-69 | High priority outreach |
| COOL | 20-44 | Low priority |
| COLD | 0-19 | Skip |

## Output CSV

File is named like: `leads_plumber_dallas_tx_20250311_142301.csv`

Columns: `grade`, `score`, `url`, `page_title`, `last_archived`, `days_since_archived`, `has_https`, `has_mobile_meta`, `copyright_year`, `contact_email`, `reasons`, `text_snippet`

## Dependencies

All free, no API keys required:

- `requests` - HTTP requests
- `beautifulsoup4` - HTML parsing
- `duckduckgo-search` - Search without an API key
- `googlesearch-python` - Google fallback search
- `colorama` - Colored terminal output
- [Wayback Machine CDX API](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server) - Archive date lookups
