"""Download and validate the public MEDA calibrated ATS product index.

The index describes Perseverance air-temperature files; it is not itself a
temperature time series and its measurements are specific to Jezero Crater.
"""

from __future__ import annotations

import csv
import hashlib
import argparse
import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

INDEX_URL = "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/logs/mars2020_meda_calibrated_ATS.csv"
MAX_INDEX_BYTES = 2_000_000
REQUIRED_COLUMNS = {"midpoint", "urn", "title", "start time", "stop time", "start_sol_number", "stop_sol_number"}


class MedaIngestionError(ValueError):
    """Raised when the MEDA archive index is unavailable or malformed."""


def _parse_index(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.reader(source)
        try:
            header = [value.strip().lower() for value in next(reader)]
        except StopIteration as error:
            raise MedaIngestionError("MEDA archive index is empty") from error
        columns = {name: index for index, name in enumerate(header) if name}
        missing = REQUIRED_COLUMNS - columns.keys()
        if missing:
            raise MedaIngestionError(f"MEDA archive index is missing columns: {', '.join(sorted(missing))}")

        records: list[dict[str, str]] = []
        for row in reader:
            if not row or not any(cell.strip() for cell in row):
                continue
            get = lambda key: row[columns[key]].strip() if columns[key] < len(row) else ""
            urn = get("urn")
            if not urn.startswith("urn:nasa:pds:mars2020_meda:"):
                raise MedaIngestionError("MEDA index contains a row with an unexpected product identifier")
            records.append({
                "midpoint_utc": get("midpoint"),
                "product_urn": urn,
                "title": get("title"),
                "start_time_utc": get("start time"),
                "stop_time_utc": get("stop time"),
                "start_sol": get("start_sol_number"),
                "stop_sol": get("stop_sol_number"),
                "solar_longitude_start_deg": get("start_solar_longitude"),
                "solar_longitude_stop_deg": get("stop_solar_longitude"),
            })
        if not records:
            raise MedaIngestionError("MEDA index contains no product records")
        return records


def ingest_meda_index(raw_dir: str | Path) -> dict[str, Any]:
    """Fetch the small official index, validate it, and save a provenance manifest."""
    root = Path(raw_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    index_path = root / "mars2020_meda_calibrated_ATS.csv"
    manifest_path = root / "meda-ats-index.manifest.json"

    request = urllib.request.Request(INDEX_URL, headers={"User-Agent": "MARSCOPE/0.1 science-data-ingestion"})
    with tempfile.NamedTemporaryFile(dir=root, prefix="meda-index-", delete=False) as temporary:
        staged_path = Path(temporary.name)
        size = 0
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                while chunk := response.read(64 * 1024):
                    size += len(chunk)
                    if size > MAX_INDEX_BYTES:
                        raise MedaIngestionError("MEDA index exceeds the 2 MB safety limit")
                    temporary.write(chunk)
            records = _parse_index(staged_path)
            digest = hashlib.sha256(staged_path.read_bytes()).hexdigest()
            os.replace(staged_path, index_path)
        except Exception:
            staged_path.unlink(missing_ok=True)
            raise

    return _write_manifest(root, index_path, records, size, digest)


def register_local_meda_index(raw_dir: str | Path) -> dict[str, Any]:
    """Validate an already-downloaded official index and record its provenance."""
    root = Path(raw_dir).expanduser().resolve()
    index_path = root / "mars2020_meda_calibrated_ATS.csv"
    if not index_path.is_file() or index_path.stat().st_size > MAX_INDEX_BYTES:
        raise MedaIngestionError("Expected a MEDA ATS CSV index no larger than 2 MB")
    records = _parse_index(index_path)
    return _write_manifest(root, index_path, records, index_path.stat().st_size, hashlib.sha256(index_path.read_bytes()).hexdigest())


def _write_manifest(root: Path, index_path: Path, records: list[dict[str, str]], size: int, digest: str) -> dict[str, Any]:
    manifest_path = root / "meda-ats-index.manifest.json"
    manifest = {
        "dataset_id": "meda",
        "product_id": "Mars 2020 MEDA calibrated ATS index",
        "source": "NASA PDS Atmospheres Node",
        "source_url": INDEX_URL,
        "site": "Perseverance landing site, Jezero Crater",
        "content": "Index of calibrated air-temperature product files; observations are not included in this index file.",
        "record_count": len(records),
        "first_record_midpoint_utc": records[0]["midpoint_utc"],
        "latest_record": records[-1],
        "bytes": size,
        "sha256": digest,
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "validation": "CSV schema, PDS product URNs, and non-empty records passed; measurement files have not been downloaded or interpreted.",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def load_meda_index(raw_dir: str | Path, limit: int = 8) -> dict[str, Any]:
    """Return a small latest-first archive index response from a validated local copy."""
    root = Path(raw_dir).expanduser().resolve()
    index_path = root / "mars2020_meda_calibrated_ATS.csv"
    manifest_path = root / "meda-ats-index.manifest.json"
    if not index_path.is_file() or not manifest_path.is_file():
        raise FileNotFoundError("MEDA ATS index is not ingested; run app.services.meda_ingestion")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(index_path.read_bytes()).hexdigest()
    if digest != manifest.get("sha256"):
        raise MedaIngestionError("Local MEDA index does not match its provenance manifest")
    records = _parse_index(index_path)
    return {
        "dataset_id": "meda",
        "dataset_name": "Mars 2020 MEDA calibrated air-temperature archive index",
        "status": "locally-ingested-index",
        "site": "Perseverance landing site, Jezero Crater",
        "site_coordinates_areocentric_deg": {"latitude": 18.4447, "longitude_east": 77.4508},
        "not_current_conditions": True,
        "measurements_included": False,
        "source_url": INDEX_URL,
        "manifest": manifest,
        "records": list(reversed(records[-limit:])),
    }


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description="Ingest NASA PDS MEDA calibrated ATS product index")
    parser.add_argument("--raw-dir", default=str(project_root / "data" / "raw" / "meda"))
    args = parser.parse_args()
    print(json.dumps(ingest_meda_index(args.raw_dir), indent=2))
