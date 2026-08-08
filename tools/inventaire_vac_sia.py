#!/usr/bin/env python3
"""
TEST SIA VAC v5 — résolution stricte d'une vraie VAC Atlas VAC.

But :
- rechercher LFBD dans le catalogue officiel SIA ;
- sélectionner UNIQUEMENT la ligne :
      AIP - AD-2.LFBD.pdf
      AIP Atlas VAC
- ignorer tous les SUP AIP, AIP France, VACH, amendements, etc. ;
- télécharger le PDF via le lien exact fourni par cette ligne ;
- vérifier HTTP 200, Content-Type, en-tête %PDF-, taille et SHA-256.

Aucun inventaire complet.
Aucune modification de NPF.
Aucune publication des VAC.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SIA = "https://www.sia.aviation-civile.gouv.fr"
ICAO = "LFBD"
TARGET_LABEL = f"AIP - AD-2.{ICAO}.pdf"
TARGET_CATEGORY = "AIP Atlas VAC"

SEARCH_URL = (
    f"{SIA}/catalogsearch/result/"
    f"?c=8&format=pdf&q={ICAO}"
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 "
    "NPF-Q400-VAC-technical-test/5.0"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Cache-Control": "no-cache",
}


def human_bytes(n: int) -> str:
    value = float(n)
    for unit in ("o", "Ko", "Mo", "Go"):
        if value < 1024 or unit == "Go":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{n} o"


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


def resolve_exact_vac_url(session: requests.Session, diagnostic_dir: Path) -> dict:
    """
    Le catalogue SIA présente chaque document sous forme d'une ligne <tr>.
    On sélectionne uniquement la ligne dont :
    - le texte du lien est exactement "AIP - AD-2.LFBD.pdf"
    - la catégorie est exactement "AIP Atlas VAC"
    """
    r = session.get(
        SEARCH_URL,
        headers={**HEADERS, "Accept": "text/html,*/*;q=0.8"},
        timeout=(15, 40),
        allow_redirects=True,
    )
    r.raise_for_status()

    diagnostic_dir.mkdir(parents=True, exist_ok=True)
    (diagnostic_dir / "catalogue_lfbd.html").write_text(
        r.text, encoding="utf-8", errors="replace"
    )

    soup = BeautifulSoup(r.text, "html.parser")
    inspected = []

    for row in soup.select("tr.tr_ligne_document"):
        link = row.select_one("a.lien_document[href]")
        if not link:
            continue

        label = clean_text(link.get_text(" ", strip=True))

        description_cell = row.select_one("td.td_description_ligne_document")
        category = ""
        if description_cell:
            divs = description_cell.find_all("div", recursive=False)
            if divs:
                category = clean_text(divs[-1].get_text(" ", strip=True))

        href = urljoin(r.url, link.get("href", ""))

        inspected.append(
            {
                "label": label,
                "category": category,
                "href": href,
            }
        )

        if label == TARGET_LABEL and category == TARGET_CATEGORY:
            return {
                "found": True,
                "search_url": r.url,
                "label": label,
                "category": category,
                "download_url": href,
                "inspected": inspected,
            }

    return {
        "found": False,
        "search_url": r.url,
        "label": "",
        "category": "",
        "download_url": "",
        "inspected": inspected,
    }


def download_pdf(session: requests.Session, url: str, target: Path) -> dict:
    result = {
        "request_url": url,
        "status": None,
        "final_url": "",
        "content_type": "",
        "size_bytes": 0,
        "pdf_header_ok": False,
        "sha256": "",
        "error": "",
    }

    try:
        sha = hashlib.sha256()
        total = 0
        first = True

        with session.get(
            url,
            headers={**HEADERS, "Accept": "application/pdf,*/*;q=0.8"},
            stream=True,
            allow_redirects=True,
            timeout=(15, 60),
        ) as r:
            result["status"] = r.status_code
            result["final_url"] = r.url
            result["content_type"] = r.headers.get("Content-Type", "")
            r.raise_for_status()

            with target.open("wb") as f:
                for chunk in r.iter_content(chunk_size=256 * 1024):
                    if not chunk:
                        continue

                    if first:
                        result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
                        first = False

                    f.write(chunk)
                    sha.update(chunk)
                    total += len(chunk)

        result["size_bytes"] = total
        result["sha256"] = sha.hexdigest() if total else ""

        if total == 0:
            result["error"] = "Fichier vide"
        elif not result["pdf_header_ok"]:
            result["error"] = "Le fichier ne commence pas par %PDF-"

    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        target.unlink(missing_ok=True)

    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    s = requests.Session()
    s.headers.update(HEADERS)

    print("=== TEST SIA VAC v5 — LFBD STRICT ===")
    print(f"Cible exacte : {TARGET_LABEL}")
    print(f"Catégorie exacte : {TARGET_CATEGORY}")

    try:
        resolved = resolve_exact_vac_url(s, out)
    except Exception as exc:
        summary = (
            "# Test GitHub Actions → SIA / VAC — v5 strict\n\n"
            f"❌ Erreur lors de la lecture du catalogue SIA : "
            f"`{type(exc).__name__}: {exc}`\n"
        )
        (out / "summary.md").write_text(summary, encoding="utf-8")
        return 2

    (out / "resolution_lfbd.json").write_text(
        json.dumps(resolved, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if not resolved["found"]:
        lines = [
            "# Test GitHub Actions → SIA / VAC — v5 strict",
            "",
            f"❌ La ligne exacte `{TARGET_LABEL}` / `{TARGET_CATEGORY}` "
            "n'a pas été trouvée.",
            "",
            f"Lignes du catalogue inspectées : **{len(resolved['inspected'])}**",
        ]
        (out / "summary.md").write_text(
            "\n".join(lines) + "\n", encoding="utf-8"
        )
        return 3

    print("Ligne Atlas VAC exacte trouvée.")
    print(f"URL SIA : {resolved['download_url']}")

    pdf_target = out / f"{ICAO}.pdf"
    pdf = download_pdf(s, resolved["download_url"], pdf_target)

    valid = (
        pdf["status"] == 200
        and pdf["pdf_header_ok"]
        and pdf["size_bytes"] > 0
        and not pdf["error"]
    )

    payload = {
        "resolution": resolved,
        "pdf": pdf,
        "valid": valid,
    }
    (out / "resultat_lfbd.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Test GitHub Actions → SIA / VAC — v5 strict",
        "",
        f"- OACI : **{ICAO}**",
        f"- Document demandé : **{TARGET_LABEL}**",
        f"- Catégorie exigée : **{TARGET_CATEGORY}**",
        f"- Ligne exacte trouvée : **OUI**",
        f"- URL de téléchargement SIA : `{resolved['download_url']}`",
        "",
        "## PDF téléchargé",
        "",
        f"- HTTP : **{pdf['status']}**",
        f"- URL finale : `{pdf['final_url']}`",
        f"- Content-Type : `{pdf['content_type']}`",
        f"- Taille : **{human_bytes(pdf['size_bytes'])}**",
        f"- En-tête `%PDF-` : **{'OUI' if pdf['pdf_header_ok'] else 'NON'}**",
        f"- SHA-256 : `{pdf['sha256']}`",
        "",
        "## Conclusion",
        "",
    ]

    if valid:
        lines.append(
            "✅ **La vraie VAC LFBD de l'Atlas VAC a été téléchargée "
            "et validée depuis GitHub Actions.**"
        )
    else:
        lines.append(
            "❌ La ligne Atlas VAC a été trouvée mais son téléchargement "
            "n'a pas produit un PDF valide."
        )
        if pdf["error"]:
            lines.append(f"\nErreur : `{pdf['error']}`")

    (out / "summary.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )

    print("=== TERMINÉ ===")
    print(f"PDF valide : {valid}")
    print(f"Taille : {pdf['size_bytes']} octets")

    return 0 if valid else 4


if __name__ == "__main__":
    raise SystemExit(main())
