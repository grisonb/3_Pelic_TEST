#!/usr/bin/env python3
"""Construit une base JSON offline de lieux-dits BAN pour NPF-Q400.

Usage :
    python tools/build_localites_offline.py --department 33

Le script télécharge le fichier officiel BAN du département, conserve les
localités géolocalisées, supprime les voies et équipements évidents, regroupe
les variantes directionnelles et produit un JSON lisible par lignes.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any

URL_TEMPLATE = (
    "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/"
    "lieux-dits-{department}-beta.csv.gz"
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
    r"(?:[-\s]+)(?:nord(?:[- ]?est|[- ]?ouest)?|sud(?:[- ]?est|[- ]?ouest)?|est|ouest)$",
    re.IGNORECASE,
)


def simplify(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value).strip().lower()
    return re.sub(r"\s+", " ", value)


def pick(row: dict[str, str], *names: str) -> str:
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
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
    if not normalized:
        return True
    if normalized in NON_LOCALITY_EXACT:
        return True
    prefixes = ROAD_PREFIXES + NON_LOCALITY_PREFIXES
    return any(normalized.startswith(simplify(prefix)) for prefix in prefixes)


def canonical_name(name: str) -> str:
    return DIRECTION_SUFFIX.sub("", name).strip(" -_")


def download_csv_gz(department: str) -> bytes:
    url = URL_TEMPLATE.format(department=department)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "NPF-Q400-localites-builder/1.1"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def build_records(payload: bytes, department: str) -> list[dict[str, Any]]:
    with gzip.GzipFile(fileobj=io.BytesIO(payload)) as gz:
        text = io.TextIOWrapper(gz, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text, delimiter=";")
        rows = list(reader)

    records: dict[tuple[str, str, str], dict[str, Any]] = {}

    for row in rows:
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
        primary = canonical_name(name)
        normalized = simplify(primary)
        if len(normalized) < 2:
            continue

        key = (normalized, insee, commune)
        candidate = {
            "n": primary,
            "c": commune,
            "i": insee,
            "d": department,
            "a": round(lat, 6),
            "o": round(lon, 6),
            "k": normalized,
        }

        existing = records.get(key)
        if existing is None or len(primary) < len(existing["n"]):
            records[key] = candidate

    return sorted(records.values(), key=lambda item: (item["k"], item["c"], item["i"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--department", default="33")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    department = str(args.department).upper()
    output = args.output or Path(f"data/localites/localites-{department}.json")
    output.parent.mkdir(parents=True, exist_ok=True)

    payload = download_csv_gz(department)
    records = build_records(payload, department)
    document = {
        "version": 2,
        "department": department,
        "source": URL_TEMPLATE.format(department=department),
        "count": len(records),
        "items": records,
    }
    output.write_text(
        json.dumps(document, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    blagon = [item for item in records if item["k"] == "blagon"]
    print(f"Entrées : {len(records)}")
    print(f"Poids JSON : {output.stat().st_size} octets")
    print(f"Blagon : {blagon or 'absent'}")
    print(output)


if __name__ == "__main__":
    main()
