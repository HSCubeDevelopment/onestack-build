#!/usr/bin/env python3
"""Export the legacy In N Out Supabase tables to the CSVs the fleet import/refresh SQL expects.

Feeds both import-innout-fleet.sql (initial load) and refresh-innout-fleet.sql (re-runnable refresh).
Read-only against the source. Pages through PostgREST, which caps a response at 1000 rows.

env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the legacy project's), OUT_DIR (defaults to this
directory — refresh-innout.sh points it at .innout-work/).

OUTPUT IS CUSTOMER PII (driver/owner names, phone numbers, free-text notes) and is gitignored.
Never commit it, and never write it outside the work directory.
"""
import csv
import json
import os
import subprocess
import sys
import urllib.parse

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT = os.environ.get("OUT_DIR") or os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
PAGE = 1000

# (filename, table, ordered columns) — column order must match the \copy target list in the SQL.
SPECS = [
    ("veh.csv", "vehicles", [
        "id", "rego", "rego_raw", "make", "model", "vehicle_type", "status",
        "is_company_car", "notes", "created_at", "updated_at"]),
    ("mov.csv", "vehicle_movements", [
        "id", "driver_name", "driver_phone", "owner_name", "owner_phone", "cars_in_rego",
        "cars_in_rego_raw", "cars_out_vehicle_id", "cars_out_rego", "cars_out_rego_raw", "purpose",
        "moved_at", "status", "needs_review", "review_reason", "notes", "staff_name",
        "created_at", "updated_at"]),
    ("ret.csv", "vehicle_returns", [
        "id", "movement_id", "returned_vehicle_id", "returned_rego", "returned_rego_raw",
        "driver_name", "mobile_number", "returned_at", "bond_status", "notes", "needs_review",
        "review_reason", "staff_name", "created_at", "updated_at"]),
    ("bok.csv", "bookings", [
        "id", "vehicle_id", "vehicle_rego", "booking_name", "booking_mobile", "start_at",
        "expected_return_at", "purpose", "status", "notes", "created_at", "updated_at"]),
]

PHOTO_COLS = ["id", "vehicle_id", "movement_id", "return_id", "booking_id",
              "photo_type", "storage_path", "notes", "uploaded_at"]


def fetch(table, cols, offset, limit):
    # curl rather than urllib: this python.org build has no CA bundle installed.
    q = urllib.parse.urlencode({"select": ",".join(cols), "order": "id"})
    out = subprocess.run(
        ["curl", "-sS", "--fail", "--max-time", "120",
         f"{URL}/rest/v1/{table}?{q}",
         "-H", f"apikey: {KEY}",
         "-H", f"Authorization: Bearer {KEY}",
         "-H", "Range-Unit: items",
         "-H", f"Range: {offset}-{offset + limit - 1}"],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def page_all(table, cols):
    rows, offset = [], 0
    while True:
        batch = fetch(table, cols, offset, PAGE)
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE
        print(f"    …{len(rows)}", file=sys.stderr)


def norm(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


for fname, table, cols in SPECS:
    print(f"  {table} -> {fname}")
    rows = page_all(table, cols)
    with open(os.path.join(OUT, fname), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in rows:
            w.writerow([norm(r.get(c)) for c in cols])
    print(f"    {len(rows)} rows")

# photos.jsonl feeds the byte-copy step (one JSON object per line).
print("  photos -> photos.jsonl")
photos = page_all("photos", PHOTO_COLS)
with open(os.path.join(OUT, "photos.jsonl"), "w", encoding="utf-8") as fh:
    for p in photos:
        fh.write(json.dumps(p) + "\n")
print(f"    {len(photos)} rows")
