#!/usr/bin/env python3
"""Construit la base JSON hors ligne des localités BAN pour NPF-Q400.

Exemples :
    python tools/build_localites_offline.py --department 33
    python tools/build_localites_offline.py --all

La base est découpée par département afin de limiter la mémoire utilisée par
la PWA. Un index national décrit les fichiers, leur poids et le nombre
d'entrées. Les fichiers sont compacts et directement exploitables hors ligne.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

URL_TEMPLATE = (
    "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/"
    "lieux-dits-{department}-beta.csv.gz"
)

DEPARTMENTS = (
    [f"{number:02d}" for number in range(1, 20)]
    + ["2A", "2B"]
    + [f"{number:02d}" for number in range(21, 96)]
    + ["971", "972", "973", "974", "975", "976"]
)

ROAD_PREFIXES = (
    "route ", "rue ", "chemin ", "avenue ", "boulevard ", "impasse ",
    "allée ", "allee ", "place ", "quai ", "lotissement ", "résidence ",
    "residence ", "voie ", "sentier ", "passage ", "cours ",
)

NON_LOCALITY_PREFIXES = (
    "accès ", "acces ", "aire de ", "autoroute ", "bretelle ",
    "centre commercial", "centre culturel", "centre de secours",
    "centre de tri", "centre technique", "centre zone", "cimetière",
    "cimetiere", "collège", "college", "complexe sportif",
    "défibril", "defibril", "école", "ecole", "église", "eglise",
    "ehpad", "embarcadère", "embarcadere", "espace ", "esplanade ",
    "garderie", "gare ", "gendarmerie", "giratoire ", "groupe scolaire",
    "hôpital", "hopital", "hyper ", "jardin ", "karting ", "mail ",
    "mairie", "maison de retraite", "parking ", "parc de stationnement",
    "parcours sportif", "parvis ", "piste cyclable", "ponton ",
    "promenade ", "rond-point ", "rond point ", "salle des fêtes",
    "salle des fetes", "services techniques", "skatepark", "square ",
    "stade ", "station d'épuration", "station d epuration", "supérette",
    "superette", "terrain de boule", "tennis club", "terrasse ",
    "traverse ", "za ", "zae ", "zi ", "zone artisanale",
    "zone commerciale", "zone d'activité", "zone d activite",
)

NON_LOCALITY_EXACT = {
    "mairie", "ecole", "eglise", "college", "cimetiere", "gare",
    "pharmacie", "stade", "square", "garderie", "petanque",
    "boulodrome", "radioelectrique", "reserve incendie",
}

DIRECTION_SUFFIX = re.compile(
    r"(?:[-\s]+)(?:nord(?:[- ]?est|[- ]?ouest)?|"
    r"sud(?:[- ]?est|[- ]?ouest)?|est|ouest)$",
    re.IGNORECASE,
)


def simplify(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value).strip().lower()
    return re.sub(r"\s+", " ", value)


def pick(row: dict[str, str], *names: str) -> str:
    lowered = {str(key).strip().lower(): value for key, value in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value not in (None, ""):
            return str(value).strip()
    return ""


def parse_float(value: str) -> float | None:
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


def is_non_locality_name(name: str) -> bool:
    normalized = simplify(name)
    if not normalized or normalized in NON_LOCALITY_EXACT:
        return True
    prefixes = ROAD_PREFIXES + NON_LOCALITY_PREFIXES
    return any(normalized.startswith(simplify(prefix)) for prefix in prefixes)


def split_direction(name: str) -> tuple[str, bool]:
    base = DIRECTION_SUFFIX.sub("", name).strip(" -_")
    return base, simplify(base) != simplify(name)


def download_csv_gz(department: str) -> bytes:
    url = URL_TEMPLATE.format(department=department)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "NPF-Q400-localites-builder/2.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{department}: téléchargement impossible ({exc.code})") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{department}: téléchargement impossible ({exc.reason})") from exc


def read_candidates(payload: bytes, department: str) -> list[dict[str, Any]]:
    with gzip.GzipFile(fileobj=io.BytesIO(payload)) as gz:
        raw = gz.read()

    if not raw.strip():
        return []

    text = io.StringIO(raw.decode("utf-8-sig"), newline="")
    reader = csv.DictReader(text, delimiter=";")
    candidates: list[dict[str, Any]] = []

    for row in reader:
        name = pick(
            row,
            "nom_lieu_dit",
            "nom_lieudit",
            "nom_ld",
            "nom_voie",
            "libelle_acheminement",
            "nom",
        )
        if not name or is_non_locality_name(name):
            continue

        lat = parse_float(pick(row, "lat", "latitude", "y"))
        lon = parse_float(pick(row, "lon", "lng", "longitude", "x"))
        if lat is None or lon is None:
            continue

        commune = pick(row, "nom_commune", "commune", "libelle_commune")
        insee = pick(row, "code_insee", "code_commune_insee", "code_commune")
        normalized = simplify(name)
        if len(normalized) < 2:
            continue

        base_name, has_direction = split_direction(name)
        candidates.append(
            {
                "name": name.strip(),
                "normalized": normalized,
                "base_name": base_name,
                "base_normalized": simplify(base_name),
                "has_direction": has_direction,
                "commune": commune,
                "insee": insee,
                "department": department,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
            }
        )

    return candidates


def build_records(payload: bytes, department: str) -> list[dict[str, Any]]:
    candidates = read_candidates(payload, department)

    exact_names = {
        (item["normalized"], item["insee"], item["commune"])
        for item in candidates
    }

    records: dict[tuple[str, str, str], dict[str, Any]] = {}

    for item in candidates:
        use_base = (
            item["has_direction"]
            and (
                item["base_normalized"],
                item["insee"],
                item["commune"],
            )
            in exact_names
        )
        display_name = item["base_name"] if use_base else item["name"]
        normalized = simplify(display_name)
        key = (normalized, item["insee"], item["commune"])

        candidate = {
            "n": display_name,
            "c": item["commune"],
            "i": item["insee"],
            "d": department,
            "a": item["lat"],
            "o": item["lon"],
            "k": normalized,
        }

        existing = records.get(key)
        if existing is None:
            records[key] = candidate
        elif item["has_direction"] is False and display_name == item["name"]:
            records[key] = candidate

    return sorted(records.values(), key=lambda item: (item["k"], item["c"], item["i"]))


def write_department(department: str, output_dir: Path) -> dict[str, Any]:
    payload = download_csv_gz(department)
    records = build_records(payload, department)
    output = output_dir / f"localites-{department}.json"
    document = {
        "version": 3,
        "department": department,
        "source": URL_TEMPLATE.format(department=department),
        "count": len(records),
        "items": records,
    }
    output.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return {
        "department": department,
        "file": output.name,
        "count": len(records),
        "bytes": output.stat().st_size,
    }


def build_all(output_dir: Path, workers: int) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {
            executor.submit(write_department, department, output_dir): department
            for department in DEPARTMENTS
        }
        for future in as_completed(futures):
            department = futures[future]
            try:
                result = future.result()
                results.append(result)
                print(
                    f"{department}: {result['count']} entrées, "
                    f"{result['bytes']} octets"
                )
            except Exception as exc:
                errors.append(f"{department}: {exc}")

    if errors:
        raise RuntimeError("\n".join(errors))

    return sorted(results, key=lambda item: DEPARTMENTS.index(item["department"]))


def write_index(output_dir: Path, results: list[dict[str, Any]]) -> Path:
    total_count = sum(item["count"] for item in results)
    total_bytes = sum(item["bytes"] for item in results)
    index = {
        "version": 3,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Base Adresse Nationale — fichiers lieux-dits départementaux",
        "department_count": len(results),
        "total_count": total_count,
        "total_bytes": total_bytes,
        "departments": results,
    }
    path = output_dir / "localites-index.json"
    path.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return path


def write_report(output_dir: Path, results: list[dict[str, Any]]) -> Path:
    total_count = sum(item["count"] for item in results)
    total_bytes = sum(item["bytes"] for item in results)
    empty = [item["department"] for item in results if item["count"] == 0]
    blagon_path = output_dir / "localites-33.json"
    blagon_found = False
    if blagon_path.exists():
        data = json.loads(blagon_path.read_text(encoding="utf-8"))
        blagon_found = any(item.get("k") == "blagon" for item in data["items"])

    lines = [
        "BASE LOCALE NPF-Q400 — FRANCE ENTIÈRE",
        "",
        f"Fichiers départementaux : {len(results)}",
        f"Localités conservées : {total_count}",
        f"Poids JSON total : {total_bytes} octets",
        f"Départements sans entrée : {', '.join(empty) if empty else 'aucun'}",
        f"Contrôle Blagon (33) : {'OK' if blagon_found else 'ABSENT'}",
        "",
        "Source : Base Adresse Nationale, fichiers lieux-dits départementaux.",
        "Format : JSON compact, version 3.",
    ]
    path = output_dir.parent / "RAPPORT_BASE_LOCALITES_FRANCE.txt"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--department")
    group.add_argument("--all", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=Path("data/localites"))
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.all:
        results = build_all(output_dir, args.workers)
        index_path = write_index(output_dir, results)
        report_path = write_report(output_dir, results)
        print(f"Index : {index_path}")
        print(f"Rapport : {report_path}")
        print(f"Total : {sum(item['count'] for item in results)} entrées")
        print(f"Poids : {sum(item['bytes'] for item in results)} octets")
        return

    department = str(args.department).upper()
    if department not in DEPARTMENTS:
        raise SystemExit(f"Département non pris en charge : {department}")
    result = write_department(department, output_dir)
    print(f"{department}: {result['count']} entrées")
    print(output_dir / result["file"])


if __name__ == "__main__":
    main()
