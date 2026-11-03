"""Regenerate both pinned M2.1 code sets. Input directory holds the four original downloads."""
from pathlib import Path
import hashlib
import json
import re
import sys
import tarfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
inputs = Path(sys.argv[1])
digests = {
    "tz.tar.gz": "114543d9f19a6bfeb5bca43686aea173d38755a3db1f2eec112647ae92c6f544",
    "language.txt": "755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1",
    "currency.xml": "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
    "cldr.xml": "fb054c9f9a95f0c4da9dd1e5e0ef6dd208b6f9a73f45303011be247277d81bef",
}
for filename, digest in digests.items():
    if hashlib.sha256((inputs / filename).read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Input digest mismatch: {filename}")
zones = {"UTC"}
with tarfile.open(inputs / "tz.tar.gz") as tz:
    for area in "africa antarctica asia australasia europe northamerica southamerica".split():
        for line in tz.extractfile(area).read().decode().splitlines():
            parts = line.split()
            if parts[:1] == ["Zone"] and "/" in parts[1]:
                zones.add(parts[1])
langs, regions = set(), set()
for block in (inputs / "language.txt").read_text(encoding="utf-8").split("%%"):
    fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
    code = fields.get("Subtag", "")
    if "Deprecated" in fields or "Private use" in fields.get("Description", ""):
        continue
    if fields.get("Type") == "language" and fields.get("Scope", "individual") in ("individual", "macrolanguage") and re.fullmatch("[a-z]{2,3}", code):
        langs.add(code)
    if fields.get("Type") == "region" and re.fullmatch("[A-Z]{2}", code):
        regions.add(code)
as_of = "2026-11-03"
tender = {c.attrib["iso4217"] for c in ET.parse(inputs / "cldr.xml").findall(".//currencyData/region/currency")
          if c.get("tender", "true") == "true" and c.get("from", "") <= as_of <= c.get("to", "9999")}
currencies = {c.findtext("Ccy") for c in ET.parse(inputs / "currency.xml").findall(".//CcyNtry")
              if c.find("CcyNm").get("IsFund") != "true" and c.findtext("Ccy") in tender}
sets = dict(zone=zones, language=langs, region=regions, currency=currencies)
if not {"America/Toronto", "Africa/Johannesburg"} <= zones or not {"CAD", "ZAR", "XOF"} <= currencies:
    raise SystemExit("Incomplete reference inputs")
asset = {key: " ".join(sorted(values)) for key, values in sets.items()}
(root / "app/lib/settings-catalogue.json").write_text(json.dumps(asset, indent=2) + "\n", encoding="utf-8", newline="\n")
migration = next((root / "supabase/migrations").glob("*_tenant_business_settings.sql"))
start, end = "-- BEGIN GENERATED CATALOGUE", "-- END GENERATED CATALOGUE"
sql = migration.read_text(encoding="utf-8")
inserts = []
for key, values in asset.items():
    if not re.fullmatch(r"[A-Za-z0-9_ /+-]+", values):
        raise SystemExit("Unexpected registry character")
    inserts.append(f"insert into private.settings_reference(kind,code) select '{key}', unnest(string_to_array('{values}', ' '));")
migration.write_text(sql[:sql.index(start)] + "\n".join([start, *inserts, end]) + sql[sql.index(end)+len(end):], encoding="utf-8", newline="\n")
print({key: len(values) for key, values in sets.items()})
