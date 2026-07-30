#!/usr/bin/env python3
"""Finalise la base nationale NPF-Q400 après génération BAN.

- regroupe systématiquement les variantes directionnelles ;
- déduplique les localités ;
- recalcule les compteurs et poids de l'index national ;
- met à jour le rapport de contrôle.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

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


def canonical_name(value: str) -> str:
    return DIRECTION_SUFFIX.sub("", value or "").strip(" -_")


def finalize_department(path: Path) -> dict[str, int | str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    records: dict[tuple[str, str, str], dict] = {}

    for item in document.get("items", []):
        display_name = canonical_name(str(item.get("n", "")))
        normalized = simplify(display_name)
        if len(normalized) < 2:
            continue

        candidate = dict(item)
        candidate["n"] = display_name
        candidate["k"] = normalized
        key = (normalized, str(candidate.get("i", "")), str(candidate.get("c", "")))
        existing = records.get(key)
        if existing is None or len(display_name) < len(str(existing.get("n", ""))):
            records[key] = candidate

    items = sorted(
        records.values(),
        key=lambda item: (item.get("k", ""), item.get("c", ""), item.get("i", "")),
    )
    document["version"] = 4
    document["count"] = len(items)
    document["items"] = items
    path.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return {
        "department": str(document.get("department", "")),
        "file": path.name,
        "count": len(items),
        "bytes": path.stat().st_size,
    }


def main() -> None:
    root = Path("data/localites")
    index_path = root / "localites-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))

    results = []
    for entry in index.get("departments", []):
        path = root / str(entry["file"])
        results.append(finalize_department(path))

    index["version"] = 4
    index["total_count"] = sum(int(item["count"]) for item in results)
    index["total_bytes"] = sum(int(item["bytes"]) for item in results)
    index["departments"] = results
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    gironde = json.loads((root / "localites-33.json").read_text(encoding="utf-8"))
    names = {item.get("k") for item in gironde.get("items", [])}
    empty = [item["department"] for item in results if int(item["count"]) == 0]
    report = [
        "BASE LOCALE NPF-Q400 — FRANCE ENTIÈRE",
        "",
        f"Fichiers départementaux : {len(results)}",
        f"Localités conservées : {index['total_count']}",
        f"Poids JSON total : {index['total_bytes']} octets",
        f"Départements sans entrée : {', '.join(empty) if empty else 'aucun'}",
        f"Contrôle Blagon (33) : {'OK' if 'blagon' in names else 'ABSENT'}",
        f"Contrôle Anseillan (33) : {'OK' if 'anseillan' in names else 'ABSENT'}",
        "",
        "Source : Base Adresse Nationale, fichiers lieux-dits départementaux.",
        "Format : JSON compact, version 4.",
    ]
    Path("RAPPORT_BASE_LOCALITES_FRANCE.txt").write_text(
        "\n".join(report) + "\n",
        encoding="utf-8",
    )

    if "blagon" not in names or "anseillan" not in names:
        raise SystemExit("Contrôle Gironde incomplet après finalisation")

    print(f"Départements : {len(results)}")
    print(f"Localités : {index['total_count']}")
    print(f"Poids : {index['total_bytes']} octets")
    print("Blagon : OK")
    print("Anseillan : OK")


if __name__ == "__main__":
    main()
