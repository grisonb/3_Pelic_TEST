#!/usr/bin/env python3
"""
TEST SIA VAC v4 — résolution réelle de l'URL d'une VAC depuis le catalogue SIA.

Objectif :
- ne plus construire ni deviner l'URL du PDF ;
- interroger le catalogue SIA pour LFBD ;
- repérer le résultat "AD-2.LFBD.pdf" ;
- extraire toutes les URL/chemins associés au résultat ;
- tester les candidats et identifier automatiquement un vrai PDF ;
- produire un diagnostic exploitable si le lien est généré dynamiquement.

Aucun inventaire complet.
Aucune modification de NPF.
Aucune publication des VAC.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SIA = "https://www.sia.aviation-civile.gouv.fr"
ICAO = "LFBD"
TARGET = f"AD-2.{ICAO}.pdf"

SEARCH_URLS = [
    f"{SIA}/catalogsearch/result/?q={ICAO}",
    f"{SIA}/catalogsearch/result/?c=8&format=pdf&q={ICAO}",
    f"{SIA}/catalogsearch/result/index/?c=8&format=pdf&q={ICAO}",
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 "
    "NPF-Q400-VAC-technical-test/4.0"
)

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
              "application/pdf;q=0.8,*/*;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Cache-Control": "no-cache",
}


def normalize_candidate(value: str, base_url: str) -> list[str]:
    """Transforme un attribut/fragment en éventuelles URL HTTP."""
    if not value:
        return []

    value = html.unescape(value).strip()
    values = [value]

    # Extrait aussi les URL/chemins noyés dans onclick, JSON, JS, etc.
    patterns = [
        r'https?://[^\s"\'<>\\]+',
        r'/(?:documents|media|pub|catalog|download|files?)/[^\s"\'<>\\]+',
    ]
    for pat in patterns:
        values.extend(re.findall(pat, value, flags=re.I))

    out = []
    for v in values:
        v = v.strip(" '\"\t\r\n,;()[]{}")
        if not v:
            continue

        if v.startswith("http://") or v.startswith("https://"):
            u = v
        elif v.startswith("/"):
            u = urljoin(base_url, v)
        else:
            continue

        if u.startswith(SIA):
            out.append(u)

    return out


def collect_candidates_from_tag(tag, base_url: str) -> list[str]:
    candidates = []

    nodes = [tag]
    nodes.extend(tag.find_all(True))

    for node in nodes:
        for key, val in node.attrs.items():
            if isinstance(val, list):
                vals = [str(x) for x in val]
            else:
                vals = [str(val)]
            for v in vals:
                candidates.extend(normalize_candidate(v, base_url))

    # HTML brut du bloc : utile pour les URLs dans scripts/JSON.
    candidates.extend(normalize_candidate(str(tag), base_url))

    # Déduplication en conservant l'ordre.
    seen = set()
    unique = []
    for u in candidates:
        if u not in seen:
            seen.add(u)
            unique.append(u)
    return unique


def score_candidate(url: str) -> int:
    u = url.lower()
    score = 0
    if "lfbd" in u:
        score += 20
    if ".pdf" in u:
        score += 15
    if "atlas" in u or "vac" in u:
        score += 10
    if "/media/" in u:
        score += 8
    if "/documents/" in u or "download" in u:
        score += 6
    if "catalogsearch" in u:
        score -= 8
    return score


def test_candidate(session: requests.Session, url: str) -> dict:
    result = {
        "url": url,
        "status": None,
        "final_url": "",
        "content_type": "",
        "size_header": "",
        "pdf_header_ok": False,
        "first_bytes_hex": "",
        "error": "",
    }

    try:
        with session.get(
            url,
            headers={**HEADERS, "Range": "bytes=0-4095"},
            stream=True,
            allow_redirects=True,
            timeout=(15, 40),
        ) as r:
            result["status"] = r.status_code
            result["final_url"] = r.url
            result["content_type"] = r.headers.get("Content-Type", "")
            result["size_header"] = (
                r.headers.get("Content-Range")
                or r.headers.get("Content-Length")
                or ""
            )

            chunk = next(r.iter_content(chunk_size=4096), b"")
            result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
            result["first_bytes_hex"] = chunk[:16].hex()

    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"

    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    s = requests.Session()
    s.headers.update(HEADERS)

    all_candidates = []
    diagnostics = []
    found_target = False

    for idx, search_url in enumerate(SEARCH_URLS, 1):
        print(f"[recherche {idx}] {search_url}")

        try:
            r = s.get(search_url, timeout=(15, 40), allow_redirects=True)
            r.raise_for_status()
        except Exception as exc:
            diagnostics.append({
                "search_url": search_url,
                "error": f"{type(exc).__name__}: {exc}",
            })
            continue

        html_text = r.text
        (out / f"catalogue_lfbd_{idx}.html").write_text(
            html_text, encoding="utf-8", errors="replace"
        )

        soup = BeautifulSoup(html_text, "html.parser")
        target_nodes = soup.find_all(
            string=lambda x: x and TARGET.lower() in str(x).lower()
        )

        diag = {
            "search_url": search_url,
            "final_url": r.url,
            "status": r.status_code,
            "target_occurrences": len(target_nodes),
            "fragments": [],
        }

        print(f"  occurrences de {TARGET}: {len(target_nodes)}")

        for n, node in enumerate(target_nodes[:10], 1):
            found_target = True
            cur = node.parent

            # Monte plusieurs niveaux pour capturer le bloc complet du résultat.
            ancestors = []
            for level in range(8):
                if cur is None:
                    break
                ancestors.append(cur)
                cur = cur.parent

            # Choisit le premier ancêtre ayant une quantité raisonnable de HTML.
            chosen = ancestors[0] if ancestors else None
            for anc in ancestors:
                txt = " ".join(anc.stripped_strings)
                if TARGET.lower() in txt.lower() and len(str(anc)) < 25000:
                    chosen = anc
                if len(txt) > 500 and TARGET.lower() in txt.lower():
                    break

            if chosen is None:
                continue

            fragment_html = str(chosen)
            fragment_file = out / f"fragment_lfbd_{idx}_{n}.html"
            fragment_file.write_text(
                fragment_html, encoding="utf-8", errors="replace"
            )

            candidates = collect_candidates_from_tag(chosen, r.url)
            all_candidates.extend(candidates)

            diag["fragments"].append({
                "file": fragment_file.name,
                "candidate_count": len(candidates),
                "candidates": candidates,
            })

        # Recherche globale de chemins suspects dans le HTML autour de LFBD.
        lower = html_text.lower()
        pos = lower.find(TARGET.lower())
        if pos >= 0:
            context = html_text[max(0, pos - 12000): pos + 12000]
            context_file = out / f"context_lfbd_{idx}.txt"
            context_file.write_text(
                context, encoding="utf-8", errors="replace"
            )
            globals_here = normalize_candidate(context, r.url)
            all_candidates.extend(globals_here)
            diag["context_file"] = context_file.name
            diag["context_candidates"] = globals_here

        diagnostics.append(diag)

    # Déduplique et trie les candidats les plus probables d'abord.
    seen = set()
    unique = []
    for u in all_candidates:
        if u not in seen:
            seen.add(u)
            unique.append(u)

    unique.sort(key=score_candidate, reverse=True)

    print(f"\nCandidats URL uniques : {len(unique)}")

    tested = []
    valid_pdf = None

    # Évite de marteler le SIA : 30 candidats maximum.
    for i, url in enumerate(unique[:30], 1):
        print(f"[test {i:02d}] {url}")
        result = test_candidate(s, url)
        tested.append(result)
        print(
            f"  HTTP={result['status']} "
            f"type={result['content_type']} "
            f"PDF={result['pdf_header_ok']}"
        )

        if result["pdf_header_ok"]:
            valid_pdf = result
            print("  >>> PDF VAC RÉEL IDENTIFIÉ")
            break

    payload = {
        "target": TARGET,
        "search_diagnostics": diagnostics,
        "candidate_count": len(unique),
        "candidates": unique,
        "tested": tested,
        "valid_pdf": valid_pdf,
    }
    (out / "diagnostic_lfbd.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Test GitHub Actions → SIA / VAC — v4 URL réelle",
        "",
        f"- Cible : **{TARGET}**",
        f"- Le nom de la VAC apparaît dans le catalogue : "
        f"**{'OUI' if found_target else 'NON'}**",
        f"- URL candidates extraites : **{len(unique)}**",
        f"- URL candidates testées : **{len(tested)}**",
        "",
    ]

    if valid_pdf:
        lines += [
            "## ✅ Résultat",
            "",
            "**Un vrai PDF VAC SIA a été trouvé et lu depuis GitHub Actions.**",
            "",
            f"- URL : `{valid_pdf['final_url'] or valid_pdf['url']}`",
            f"- HTTP : `{valid_pdf['status']}`",
            f"- Content-Type : `{valid_pdf['content_type']}`",
            f"- Taille annoncée : `{valid_pdf['size_header']}`",
            "",
            "Cette URL ne sera pas codée en dur dans NPF : le système définitif "
            "devra la résoudre dynamiquement depuis les données SIA.",
        ]
    else:
        lines += [
            "## ⚠️ Résultat",
            "",
            "Le catalogue SIA a été lu mais aucun candidat testé n'a encore produit "
            "un PDF `%PDF-`.",
            "",
            "Les fichiers de diagnostic joints à l'artifact contiennent le HTML "
            "et le fragment exact du résultat LFBD. Ils permettront de déterminer "
            "comment le SIA encode réellement le lien de téléchargement.",
        ]

    (out / "summary.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )

    print("\n=== TERMINÉ ===")
    print(f"Cible visible dans catalogue : {found_target}")
    print(f"Candidats : {len(unique)}")
    print(f"PDF réel trouvé : {bool(valid_pdf)}")

    # Le job reste vert dès lors que le catalogue a bien été analysé :
    # même sans PDF résolu, l'artifact contient le diagnostic nécessaire.
    return 0 if found_target else 3


if __name__ == "__main__":
    raise SystemExit(main())
