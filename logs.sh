#!/usr/bin/env bash
# logs.sh — read MetaPeek's request log in a hurry.
#
# QUICK START
#   ./logs.sh                        the 200 most recent requests, newest first
#   ./logs.sh 50                     the 50 most recent
#   ./logs.sh 2026-08-24             every request on that day
#   ./logs.sh denied                 only the requests that were rate-limited, with the bucket that stopped them
#   ./logs.sh hosts                  which sites people analyzed most, with counts
#   ./logs.sh stats                  totals by scope, tier, and allow/deny
#   ./logs.sh tail                   watch new requests arrive live (Ctrl-C to stop)
#   ./logs.sh help                   this text
#   Tables open in a pager: arrow keys scroll (right too — long lines are not wrapped), q quits.
#
# WHERE TO RUN IT
#   Any checkout of this repo, on any machine. There is no server to SSH into: the log lives in
#   Supabase, and this script reads it over HTTPS with the same credentials the app uses.
#
# WHAT THE LOG IS
#   Every rate-limit decision writes one row to the Supabase `request_log` table, through the
#   same RPC round-trip that checks the limits — so denied requests are logged too (that is
#   where the abuse signal lives). Nothing on the site serves this; the secret key is the only
#   way in. docs/plans/2026-07-17-rate-limiting-and-fixes-design.md has the full story.
#     at            when the request arrived (shown in America/Chicago)
#     scope         "api" for a plain fetch/analyze, "spa" for a headless-Chromium render
#     path          the API route that was called
#     target_host   the site being analyzed (target_url holds the full URL)
#     tier          "trusted" (*.illinois.gov, *.icjia.app) or "default" (everyone else)
#     allowed       false when a rate limit stopped the request
#     violated_key  which bucket stopped it — m:/d: per-IP minute/day, g:/sg: the site-wide budget
#     ip_hash       truncated SHA-256 of the IP; raw addresses are never stored
#     user_agent    what the client claimed to be
#   Rows are purged after 90 days by pg_cron. Requests served while Supabase was unreachable
#   fall back to an in-memory limiter and are NOT logged — a quiet stretch can mean an outage.
#
# CREDENTIALS
#   Read from .env beside this script (SUPABASE_URL and SUPABASE_SECRET_KEY), or from the
#   environment if already set. The secret key is the sb_secret_… one from
#   Supabase → Project Settings → API Keys — never the publishable/anon key. Without it
#   PostgREST returns nothing: the table is RLS-enabled with no policies, service-role only.
#
# COMMANDS
#   ./logs.sh [recent [N]] [FMT]     the N most recent requests (default 200), newest first
#   ./logs.sh day [DATE] [FMT]       every request on one day (default: today)
#   ./logs.sh denied [DATE] [FMT]    only the rate-limited requests (all days if DATE is omitted)
#   ./logs.sh hosts [DATE] [FMT]     target hosts by request count, busiest first
#   ./logs.sh stats [DATE]           totals by scope, tier, and allow/deny
#   ./logs.sh grep PATTERN [DATE]    requests whose target URL or user agent contains PATTERN
#   ./logs.sh tail [SECONDS]         poll for new rows (default every 10s; Ctrl-C to stop)
#   ./logs.sh help                   this text (also -h, --help)
#   Shortcuts: a bare DATE means "day DATE"; a bare number means "recent N".
#
# DATE — a calendar day in America/Chicago, written YYYY-MM-DD:
#   four-digit year, two-digit month, two-digit day, joined by dashes.
#     2026-08-24      yes
#     today           yes — the word
#     yesterday       yes — the word
#     2026-8-24       no  — pad the month and the day with zeros
#     08/24/2026      no  — year first, dashes, no slashes
#   Examples:
#     ./logs.sh day 2026-08-24
#     ./logs.sh denied yesterday --md
#     ./logs.sh grep googlebot today
#
# FMT — how a table is printed (recent / day / denied / hosts)
#   --table   aligned columns for reading in the terminal   (default at a terminal)
#   --csv     comma-separated                                (default when piped or redirected)
#   --tsv     tab-separated — pastes into Excel / Numbers / Sheets as columns
#   --md      a Markdown table — pastes into GitHub, Slack, docs
#   --copy    put the output on the clipboard instead of the screen (TSV unless a FMT is given)
#   Examples:
#     ./logs.sh --md                          the 200 most recent as a Markdown table
#     ./logs.sh denied --copy                 every denied request, as TSV, on the clipboard
#     ./logs.sh day today > today.csv         the raw rows (piped, so --csv is the default)
#
# REQUIREMENTS
#   bash, curl, and python3 (present on macOS and on any Linux box). Output is paged with
#   $PAGER (default: less -S).
#
# ENVIRONMENT OVERRIDES — rarely needed
#   SUPABASE_URL / SUPABASE_SECRET_KEY   credentials (else read from .env beside this script)
#   LOGS_DRY_RUN=1                       print the PostgREST URL instead of fetching (debugging)
#   LOGS_SKIP_ENV_FILE=1                 ignore .env and use only the environment
set -euo pipefail

TZ_LOCAL="America/Chicago"
RECENT_DEFAULT=200   # rows shown by a bare ./logs.sh
HOSTS_DEFAULT=2000   # rows scanned when tallying hosts / stats
TAIL_DEFAULT=10      # seconds between polls in tail mode
COMMANDS="recent day denied hosts stats grep tail help"
SELF="${BASH_SOURCE[0]:-$0}"

here() { cd "$(dirname "$SELF")" 2>/dev/null && pwd; }

# The help text IS the comment block above (so the two cannot drift apart).
usage() { sed -n '2,/^set -euo/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'; }
die() { echo "logs.sh: $*" >&2; exit 1; }

# --- credentials ------------------------------------------------------------------
# .env fills only what the environment left empty, so an exported value always wins.
load_env() {
  local env_file; env_file="$(here)/.env"
  if [ -z "${LOGS_SKIP_ENV_FILE:-}" ] && [ -f "$env_file" ]; then
    local key value
    while IFS='=' read -r key value; do
      case "$key" in
        SUPABASE_URL|SUPABASE_SECRET_KEY) ;;
        *) continue ;;
      esac
      value="${value%\"}"; value="${value#\"}"     # strip optional quotes
      value="${value%\'}"; value="${value#\'}"
      [ -n "$value" ] && [ -z "${!key:-}" ] && export "$key=$value"
    done < <(grep -E '^[[:space:]]*(SUPABASE_URL|SUPABASE_SECRET_KEY)=' "$env_file" | sed 's/^[[:space:]]*//')
  fi
  # Report everything that is missing at once — fixing one only to be told about
  # the other is a needless second trip to the .env file.
  local missing=()
  [ -n "${SUPABASE_URL:-}" ] || missing+=("SUPABASE_URL")
  [ -n "${SUPABASE_SECRET_KEY:-}" ] || missing+=("SUPABASE_SECRET_KEY")
  if [ ${#missing[@]} -gt 0 ]; then
    die "missing ${missing[*]} — set them in $(here)/.env (see .env.example) or in your environment. SUPABASE_SECRET_KEY is the sb_secret_… key from Supabase → Project Settings → API Keys; the publishable/anon key will not work, because request_log is service-role only"
  fi
}

# --- dates (macOS and GNU date both) ----------------------------------------------
today() { TZ="$TZ_LOCAL" date +%F; }
yesterday() {
  if TZ="$TZ_LOCAL" date -d "yesterday" +%F >/dev/null 2>&1; then
    TZ="$TZ_LOCAL" date -d "yesterday" +%F
  else
    TZ="$TZ_LOCAL" date -v-1d +%F
  fi
}
is_date() { [[ "${1:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; }
is_date_word() { [ "${1:-}" = today ] || [ "${1:-}" = yesterday ]; }
is_count() { [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]; }

resolve_date() {
  case "${1:-}" in
    today) today ;;
    yesterday) yesterday ;;
    *)
      is_date "${1:-}" || die "DATE must be YYYY-MM-DD (for example $(today)), or the word today or yesterday — got '${1:-}'. ./logs.sh help has more."
      echo "$1" ;;
  esac
}

# The day after DATE — the exclusive upper bound of a day query.
next_day() {
  if TZ="$TZ_LOCAL" date -d "$1 + 1 day" +%F >/dev/null 2>&1; then
    TZ="$TZ_LOCAL" date -d "$1 + 1 day" +%F
  else
    TZ="$TZ_LOCAL" date -j -v+1d -f "%Y-%m-%d" "$1" +%F
  fi
}

# Midnight of DATE in Chicago, as an ISO timestamp with the offset that was in
# effect that day (so a CST date is not shifted by an hour of CDT).
day_start() {
  if TZ="$TZ_LOCAL" date -d "$1 00:00:00" +%Y-%m-%dT%H:%M:%S%z >/dev/null 2>&1; then
    TZ="$TZ_LOCAL" date -d "$1 00:00:00" +%Y-%m-%dT%H:%M:%S%z
  else
    TZ="$TZ_LOCAL" date -j -f "%Y-%m-%d %H:%M:%S" "$1 00:00:00" +%Y-%m-%dT%H:%M:%S%z
  fi
}

# --- output sinks -----------------------------------------------------------------
page() { if [ -t 1 ]; then ${PAGER:-less -S}; else cat; fi; }

clipboard_tool() {
  if command -v pbcopy >/dev/null 2>&1; then echo "pbcopy"
  elif command -v wl-copy >/dev/null 2>&1; then echo "wl-copy"
  elif command -v xclip >/dev/null 2>&1; then echo "xclip -selection clipboard"
  elif command -v xsel >/dev/null 2>&1; then echo "xsel --clipboard --input"
  else return 1; fi
}

# Copy stdin to the clipboard and say how much was copied; fall back to OSC 52
# (the terminal's own clipboard) and finally to just printing it.
clip() {
  local tool content lines
  content="$(cat)"
  lines=$(printf '%s\n' "$content" | wc -l | tr -d ' ')
  if tool="$(clipboard_tool)"; then
    printf '%s\n' "$content" | $tool
    echo "copied $lines line(s) to the clipboard ($tool)" >&2
  elif [ -t 1 ]; then
    printf '\033]52;c;%s\a' "$(printf '%s\n' "$content" | base64 | tr -d '\n')"
    printf '%s\n' "$content"
    echo "no clipboard program on this machine — sent $lines line(s) to your terminal's clipboard (OSC 52; some terminals ignore it) and printed it above so you can select and copy (use --md for a cleaner copy)" >&2
  else
    printf '%s\n' "$content"
    echo "no clipboard program on this machine; printed $lines line(s) instead" >&2
  fi
}

# --- PostgREST ---------------------------------------------------------------------
# fetch QUERY_STRING -> the matching request_log rows as JSON.
# LOGS_DRY_RUN=1 prints the URL instead, so the filters can be inspected (and tested)
# without credentials or network.
fetch() {
  local url="${SUPABASE_URL%/}/rest/v1/request_log?$1"
  if [ -n "${LOGS_DRY_RUN:-}" ]; then
    # The URL goes to stderr so it survives the pipe into render(), which is
    # handed an empty result set and prints its usual "nothing on file".
    echo "$url" >&2
    printf '[]'
    return 0
  fi
  command -v curl >/dev/null 2>&1 || die "curl is required"
  local body status
  body="$(curl -sS -w $'\n%{http_code}' \
    -H "apikey: $SUPABASE_SECRET_KEY" \
    -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Accept: application/json" \
    "$url")" || die "could not reach $SUPABASE_URL — check the network and SUPABASE_URL"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  case "$status" in
    200) printf '%s' "$body" ;;
    401|403) die "Supabase rejected the key (HTTP $status). request_log is service-role only — use the sb_secret_… key, not the publishable/anon one" ;;
    404) die "no request_log table at $SUPABASE_URL (HTTP 404) — is SUPABASE_URL pointing at the right project?" ;;
    *) die "Supabase returned HTTP $status: $(printf '%s' "$body" | head -c 300)" ;;
  esac
}

# Day bounds as PostgREST filters, URL-encoded (the + in an offset would otherwise
# be read as a space).
day_filter() {
  local start end
  start="$(day_start "$1")"
  end="$(day_start "$(next_day "$1")")"
  echo "at=gte.$(urlencode "$start")&at=lt.$(urlencode "$end")"
}

urlencode() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

# --- rendering (python3: real JSON parsing, aligned columns, Markdown escaping) -----
# render FORMAT MODE  (reads JSON rows on stdin)
#   MODE: rows|hosts|stats
# The Python program itself arrives on stdin (the heredoc), so the rows cannot
# also be piped in — they go to a temp file that Python opens by path.
render() {
  command -v python3 >/dev/null 2>&1 || die "python3 is required"
  local tmp; tmp="$(mktemp "${TMPDIR:-/tmp}/metapeek-logs.XXXXXX")"
  trap 'rm -f "$tmp"' RETURN
  cat > "$tmp"
  LOGS_TZ="$TZ_LOCAL" python3 - "$@" "$tmp" <<'PY'
import json, os, sys
from collections import Counter
from datetime import datetime, timezone

fmt, mode, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8") as fh:
    raw = fh.read().strip()
rows = json.loads(raw) if raw else []
if isinstance(rows, dict):                       # a PostgREST error object
    print(rows.get("message", rows), file=sys.stderr)
    sys.exit(1)

def local(ts):
    """ISO timestamp -> 'YYYY-MM-DD HH:MM:SS' in the log's local zone."""
    if not ts:
        return ""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return ts
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:                                          # zoneinfo: stdlib on 3.9+
        from zoneinfo import ZoneInfo
        dt = dt.astimezone(ZoneInfo(os.environ.get("LOGS_TZ", "UTC")))
    except Exception:
        dt = dt.astimezone()
    return dt.strftime("%Y-%m-%d %H:%M:%S")

if mode == "stats":
    total = len(rows)
    denied = [r for r in rows if r.get("allowed") is False]
    print(f"{total} request(s)" + (f", {len(denied)} denied" if denied else ", none denied"))
    print()
    for label, key in (("scope", "scope"), ("tier", "tier")):
        counts = Counter(r.get(key) or "(unset)" for r in rows)
        if counts:
            print(f"by {label}:")
            for name, n in counts.most_common():
                print(f"  {name:<12} {n}")
            print()
    if denied:
        # The bucket prefix is the useful part: m:/d: is one IP, g:/sg: is everyone.
        def bucket(key):
            if not key:
                return "(unknown)"
            p = key.split(":", 1)[0]
            return {
                "m": "per-IP minute", "d": "per-IP day",
                "sm": "per-IP minute (spa)", "sd": "per-IP day (spa)",
                "g": "site-wide day", "sg": "site-wide day (spa)",
            }.get(p, p)
        print("denied by bucket:")
        for name, n in Counter(bucket(r.get("violated_key")) for r in denied).most_common():
            print(f"  {name:<22} {n}")
    sys.exit(0)

if mode == "hosts":
    counts = Counter(r.get("target_host") or "(none)" for r in rows)
    denied = Counter(
        (r.get("target_host") or "(none)") for r in rows if r.get("allowed") is False
    )
    header = ["host", "requests", "denied"]
    body = [[h, str(n), str(denied.get(h, 0))] for h, n in counts.most_common()]
    caption = f"{len(counts)} host(s) across {len(rows)} request(s), busiest first"
else:
    header = ["at", "scope", "tier", "ok", "host", "path", "violated", "agent"]
    body = []
    for r in rows:
        body.append([
            local(r.get("at")),
            r.get("scope") or "",
            r.get("tier") or "",
            "no" if r.get("allowed") is False else "yes",
            r.get("target_host") or "",
            r.get("path") or "",
            r.get("violated_key") or "",
            (r.get("user_agent") or "")[:60],
        ])
    caption = f"{len(body)} request(s), newest first"

if not body:
    print("no matching requests on file", file=sys.stderr)
    sys.exit(0)

one_line = lambda c: c.replace("\r", " ").replace("\n", " ")

if fmt == "csv":
    import csv
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(header); w.writerows(body)
elif fmt == "tsv":
    print(caption, file=sys.stderr)
    for r in [header] + body:
        print("\t".join(one_line(c).replace("\t", " ") for c in r))
elif fmt == "md":
    print(caption, file=sys.stderr)
    esc = lambda c: one_line(c).replace("|", "\\|")
    print("| " + " | ".join(esc(c) for c in header) + " |")
    print("|" + "|".join("---" for _ in header) + "|")
    for r in body:
        print("| " + " | ".join(esc(c) for c in r) + " |")
else:
    print(caption); print()
    disp = [header] + [[one_line(c) for c in r] for r in body]
    n = len(header)
    widths = [max(len(r[i]) if i < len(r) else 0 for r in disp) for i in range(n)]
    for k, r in enumerate(disp):
        print("  ".join((r[i] if i < len(r) else "").ljust(widths[i]) for i in range(n)).rstrip())
        if k == 0:
            print("  ".join("-" * w for w in widths))
PY
}

# --- commands -----------------------------------------------------------------------
# Each runs inside out="$(cmd_…)" in main, and bash switches errexit OFF inside a
# command substitution — so a die() nested in a further $(…) only ends that inner
# subshell. Every such call carries an explicit `|| exit $?` to stop the command
# there, with one message, instead of carrying on with an empty value.
cmd_recent() {  # $1 count, $2 format
  local n="${1:-$RECENT_DEFAULT}"
  is_count "$n" || die "N must be a whole number, 1 or more (for example: ./logs.sh recent 100) — got '$n'"
  fetch "select=*&order=at.desc&limit=$n" | render "$2" rows
}

cmd_day() {  # $1 date, $2 format
  local d; d="$(resolve_date "${1:-today}")" || exit $?
  local filter; filter="$(day_filter "$d")" || exit $?
  fetch "select=*&$filter&order=at.desc&limit=10000" | render "$2" rows
}

cmd_denied() {  # $1 date (optional), $2 format
  local q="select=*&allowed=is.false&order=at.desc&limit=10000"
  if [ -n "${1:-}" ]; then
    local d filter
    d="$(resolve_date "$1")" || exit $?
    filter="$(day_filter "$d")" || exit $?
    q="$q&$filter"
  fi
  fetch "$q" | render "$2" rows
}

cmd_hosts() {  # $1 date (optional), $2 format
  local q="select=target_host,allowed&order=at.desc&limit=$HOSTS_DEFAULT"
  if [ -n "${1:-}" ]; then
    local d filter
    d="$(resolve_date "$1")" || exit $?
    filter="$(day_filter "$d")" || exit $?
    q="select=target_host,allowed&$filter&order=at.desc&limit=10000"
  fi
  fetch "$q" | render "$2" hosts
}

cmd_stats() {  # $1 date (optional)
  local q="select=scope,tier,allowed,violated_key&order=at.desc&limit=$HOSTS_DEFAULT"
  if [ -n "${1:-}" ]; then
    local d filter
    d="$(resolve_date "$1")" || exit $?
    filter="$(day_filter "$d")" || exit $?
    q="select=scope,tier,allowed,violated_key&$filter&order=at.desc&limit=10000"
  fi
  fetch "$q" | render table stats
}

cmd_grep() {  # $1 pattern, $2 date (optional), $3 format
  local pattern="${1:-}"
  [ -n "$pattern" ] || die "usage: grep PATTERN [DATE] (for example: ./logs.sh grep googlebot $(today))"
  local enc; enc="$(urlencode "*${pattern}*")"
  local q="select=*&or=(target_url.ilike.${enc},user_agent.ilike.${enc})&order=at.desc&limit=10000"
  if [ -n "${2:-}" ]; then
    local d filter
    d="$(resolve_date "$2")" || exit $?
    filter="$(day_filter "$d")" || exit $?
    q="$q&$filter"
  fi
  fetch "$q" | render "${3:-table}" rows
}

# Polls for rows newer than the last one seen. No streaming API here — the table is
# read over HTTPS — so this is a poll, not a true tail.
cmd_tail() {  # $1 seconds between polls
  local every="${1:-$TAIL_DEFAULT}"
  is_count "$every" || die "SECONDS must be a whole number, 1 or more (for example: ./logs.sh tail 30) — got '$every'"
  echo "polling $SUPABASE_URL every ${every}s for new requests (Ctrl-C to stop)" >&2
  local last=""
  while true; do
    local q="select=*&order=at.desc&limit=50"
    [ -n "$last" ] && q="select=*&at=gt.$(urlencode "$last")&order=at.desc&limit=200"
    local rows; rows="$(fetch "$q")"
    local newest
    newest="$(printf '%s' "$rows" | python3 -c 'import json,sys
rows=json.load(sys.stdin) or []
print(rows[0]["at"] if rows else "")' 2>/dev/null || echo "")"
    if [ -n "$newest" ]; then
      # First pass primes `last` quietly; later passes only print what is new.
      if [ -n "$last" ]; then
        printf '%s' "$rows" | render table rows | tail -n +3
      else
        printf '%s' "$rows" | render table rows
      fi
      last="$newest"
    fi
    sleep "$every"
  done
}

# --- dispatch -------------------------------------------------------------------------
main() {
  local cmd="" copy=0 fmt="" positional=()
  for a in "$@"; do
    case "$a" in
      --copy) copy=1 ;;
      --table|--csv|--tsv|--md) fmt="${a#--}" ;;
      -h|--help|help) usage; return 0 ;;
      --*) die "unknown option '$a' — the formats are --table, --csv, --tsv, --md, and --copy (./logs.sh help)" ;;
      *) positional+=("$a") ;;
    esac
  done
  cmd="${positional[0]:-recent}"
  positional=(${positional[@]+"${positional[@]:1}"})

  # Shortcuts: ./logs.sh 2026-08-24 (or today / yesterday) = day DATE; ./logs.sh 50 = recent 50.
  # Anything date-shaped routes to day too, even when malformed (2026-8-24), so
  # resolve_date can explain the format instead of "unknown command".
  if is_date "$cmd" || is_date_word "$cmd" || [[ "$cmd" =~ ^[0-9]+[-/] ]]; then
    positional=("$cmd" ${positional[@]+"${positional[@]}"}); cmd=day
  elif is_count "$cmd"; then
    positional=("$cmd" ${positional[@]+"${positional[@]}"}); cmd=recent
  fi

  case "$cmd" in
    recent|day|denied|hosts|stats|grep|tail) ;;
    *) die "unknown command '$cmd' — the commands are: $COMMANDS (./logs.sh help explains each)" ;;
  esac

  load_env

  # Default format: a table for a person at a terminal, CSV for a pipe, TSV for the
  # clipboard (it pastes into a spreadsheet as columns).
  if [ -z "$fmt" ]; then
    if [ "$copy" = 1 ]; then fmt="tsv"; elif [ -t 1 ]; then fmt="table"; else fmt="csv"; fi
  fi

  # tail follows the log; everything else is collected before it is shown, so a
  # failure leaves an error message on screen rather than an empty pager waiting for q.
  if [ "$cmd" = "tail" ]; then
    cmd_tail "${positional[0]:-}"
    return 0
  fi

  local out
  case "$cmd" in
    recent) out="$(cmd_recent "${positional[0]:-}" "$fmt")" ;;
    day)    out="$(cmd_day "${positional[0]:-}" "$fmt")" ;;
    denied) out="$(cmd_denied "${positional[0]:-}" "$fmt")" ;;
    hosts)  out="$(cmd_hosts "${positional[0]:-}" "$fmt")" ;;
    stats)  out="$(cmd_stats "${positional[0]:-}")" ;;
    grep)   out="$(cmd_grep "${positional[0]:-}" "${positional[1]:-}" "$fmt")" ;;
  esac
  [ -n "$out" ] || return 0   # nothing to show (the reason, if any, is already on stderr)

  local sink="page"; [ "$copy" = 1 ] && sink="clip"
  printf '%s\n' "$out" | $sink
}

main "$@"
