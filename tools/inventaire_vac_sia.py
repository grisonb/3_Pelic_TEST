#!/usr/bin/env python3
"""
TEST SIA VAC v3 — test rapide GitHub Actions -> SIA.

Objectif unique :
- vérifier qu'un runner GitHub Actions peut télécharger réellement plusieurs PDF VAC SIA ;
- contrôler HTTP 200, en-tête %PDF-, taille et SHA-256 ;
- terminer rapidement.

Aucun inventaire complet.
Aucune modification de NPF.
Aucune publication des VAC.

Le workflow existant test-sia-vac.yml peut rester inchangé.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import requests

SIA_BASE = (
    "https://www.sia.aviation-civile.gouv.fr/"
    "media/dvd/eAIP_14_MAY_2026/"
    "Atlas-VAC/PDF_AIPparSSection/VAC/AD/"
)

TEST_ICAO = ("LFBD", "LFBO", "LFCR", "LFMT", "LFMA")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 "
    "NPF-Q400-VAC-technical-test/3.0"
)


def human_bytes(n: int) -> str:
    value = float(n)
    for unit in ("o", "Ko", "Mo", "Go"):
        if value < 1024 or unit == "Go":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{n} o"


def download_one(icao: str, out_dir: Path) -> dict:
    url = SIA_BASE + f"AD-2.{icao}.pdf"
    target = out_dir / f"{icao}.pdf"

    result = {
        "icao": icao,
        "url": url,
        "status": None,
        "final_url": "",
        "content_type": "",
        "size_bytes": 0,
        "pdf_header_ok": False,
        "sha256": "",
        "error": "",
    }

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
    }

    try:
        sha = hashlib.sha256()
        total = 0
        first_chunk = True

        with requests.get(
            url,
            headers=headers,
            stream=True,
            allow_redirects=True,
            timeout=(15, 45),
        ) as r:
            result["status"] = r.status_code
            result["final_url"] = r.url
            result["content_type"] = r.headers.get("Content-Type", "")

            r.raise_for_status()

            with target.open("wb") as f:
                for chunk in r.iter_content(chunk_size=256 * 1024):
                    if not chunk:
                        continue

                    if first_chunk:
                        result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
                        first_chunk = False

                    f.write(chunk)
                    sha.update(chunk)
                    total += len(chunk)

        result["size_bytes"] = total
        result["sha256"] = sha.hexdigest()

        if total == 0:
            result["error"] = "Fichier vide"
        elif not result["pdf_header_ok"]:
            result["error"] = "Le fichier ne commence pas par %PDF-"

    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        try:
            target.unlink(missing_ok=True)
        except Exception:
            pass

    return result


def write_summary(out_dir: Path, results: list[dict]) -> None:
    good = [
        r for r in results
        if r["status"] == 200
        and r["pdf_header_ok"]
        and r["size_bytes"] > 0
        and not r["error"]
    ]

    total = sum(r["size_bytes"] for r in good)

    lines = [
        "# Test GitHub Actions → SIA / VAC — v3 rapide",
        "",
        f"- VAC testées : **{len(results)}**",
        f"- Téléchargements PDF valides : **{len(good)}**",
        f"- Échecs : **{len(results) - len(good)}**",
        f"- Taille totale des PDF valides : **{human_bytes(total)}**",
        "",
        "## Résultats",
        "",
        "| OACI | HTTP | Taille | PDF valide | SHA-256 |",
        "|---|---:|---:|:---:|---|",
    ]

    for r in results:
        lines.append(
            f"| {r['icao']} | {r['status']} | {human_bytes(r['size_bytes'])} "
            f"| {'✅' if r['pdf_header_ok'] else '❌'} "
            f"| `{r['sha256']}` |"
        )

    errors = [r for r in results if r["error"]]
    if errors:
        lines += ["", "## Erreurs", ""]
        for r in errors:
            lines.append(f"- **{r['icao']}** : {r['error']}")

    lines += ["", "## Conclusion", ""]

    if good:
        lines.append(
            "✅ **GitHub Actions peut télécharger et lire directement des PDF VAC du SIA.**"
        )
        if len(good) == len(results):
            lines.append("Les 5 VAC témoins ont été téléchargées et validées.")
        else:
            lines.append(
                "Au moins une VAC témoin fonctionne ; les éventuels échecs isolés "
                "sont à analyser séparément."
            )
    else:
        lines.append("❌ Aucun PDF VAC témoin n'a pu être téléchargé et validé.")

    (out_dir / "summary.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    sample_dir = out_dir / "echantillons"
    sample_dir.mkdir(parents=True, exist_ok=True)

    results = []

    print("=== TEST SIA VAC v3 RAPIDE ===")
    print("5 téléchargements maximum, aucun inventaire complet.")

    for icao in TEST_ICAO:
        print(f"\n[{icao}] téléchargement...")
        result = download_one(icao, sample_dir)
        results.append(result)

        print(
            f"[{icao}] HTTP={result['status']} "
            f"taille={result['size_bytes']} "
            f"PDF={result['pdf_header_ok']} "
            f"erreur={result['error'] or '-'}"
        )

    (out_dir / "resultats.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_summary(out_dir, results)

    good = [
        r for r in results
        if r["status"] == 200
        and r["pdf_header_ok"]
        and r["size_bytes"] > 0
        and not r["error"]
    ]

    print("\n=== TERMINÉ ===")
    print(f"PDF valides : {len(good)}/{len(results)}")
    print(f"Résultats : {out_dir}")

    return 0 if good else 4


if __name__ == "__main__":
    raise SystemExit(main())
