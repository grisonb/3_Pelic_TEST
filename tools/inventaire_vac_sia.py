#!/usr/bin/env python3
"""
Test technique GitHub Actions -> SIA pour les VAC France.

Version 2 : découverte robuste par préfixes OACI LFA ... LFZ.
Le premier essai fondé sur une recherche globale "AD-2" pouvait lire le SIA
mais ne retrouvait aucun lien VAC dans le HTML retourné.

But :
- vérifier qu'un runner GitHub peut joindre et lire les documents SIA ;
- inventorier les PDF "AIP Atlas VAC" de type AD-2.LFxx.pdf ;
- mesurer leur taille ;
- télécharger intégralement quelques VAC témoins ;
- produire CSV, JSON et résumé Markdown.

Aucune modification de NPF.
Aucune publication des PDF.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import string
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode, urljoin

import requests
from bs4 import BeautifulSoup

SIA = "https://www.sia.aviation-civile.gouv.fr"
CATALOG_PATH = "/catalogsearch/result/"
VAC_RE = re.compile(r"\bAD-2\.(LF[A-Z0-9]{2})\.pdf\b", re.I)
SAMPLE_ICAO = ("LFBD", "LFBO", "LFCR", "LFMT", "LFMA")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 "
    "NPF-Q400-VAC-technical-test/2.0"
)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
            "Cache-Control": "no-cache",
        }
    )
    return s


def catalog_url(query: str, page: int = 1, limit: int = 50) -> str:
    params = {
        "c": "8",
        "format": "pdf",
        "q": query,
        "page": str(page),
        "limit": str(limit),
    }
    return SIA + CATALOG_PATH + "?" + urlencode(params)


def filename_from_text(text: str) -> tuple[str, str] | None:
    m = VAC_RE.search(text or "")
    if not m:
        return None
    icao = m.group(1).upper()
    return icao, f"AD-2.{icao}.pdf"


def extract_candidates_from_page(html: str, page_url: str) -> dict[str, str]:
    """
    Extrait les couples OACI -> URL depuis une page de résultats SIA.

    Le HTML du catalogue a changé au fil du temps ; on essaie plusieurs formes :
    - nom du PDF directement dans le texte du lien ;
    - nom dans un descendant ou un voisin proche du lien ;
    - noeud texte contenant AD-2.LFxx.pdf, puis recherche du lien parent/proche.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}

    # 1) Liens dont le texte ou le conteneur proche contient le nom du PDF.
    for a in soup.find_all("a", href=True):
        texts = [" ".join(a.stripped_strings)]
        parent = a.parent
        for _ in range(4):
            if parent is None:
                break
            texts.append(" ".join(parent.stripped_strings))
            parent = parent.parent

        match = None
        for text in texts:
            match = filename_from_text(text)
            if match:
                break
        if not match:
            continue

        icao, _ = match
        href = urljoin(page_url, a.get("href", ""))
        if href.startswith("http"):
            found.setdefault(icao, href)

    # 2) Noeuds texte : utile si le nom n'est pas dans le <a> lui-même.
    for node in soup.find_all(string=VAC_RE):
        match = filename_from_text(str(node))
        if not match:
            continue
        icao, _ = match
        if icao in found:
            continue

        tag = node.parent
        candidates = []
        if tag is not None:
            if tag.name == "a" and tag.get("href"):
                candidates.append(tag)
            parent_a = tag.find_parent("a", href=True)
            if parent_a:
                candidates.append(parent_a)
            for parent in list(tag.parents)[:5]:
                a = parent.find("a", href=True)
                if a:
                    candidates.append(a)

        for a in candidates:
            href = urljoin(page_url, a.get("href", ""))
            if href.startswith("http"):
                found[icao] = href
                break

    return found


def exact_lookup(s: requests.Session, icao: str) -> str | None:
    """Résout une VAC précise par recherche exacte du code OACI."""
    url = catalog_url(icao, page=1, limit=50)
    r = s.get(url, timeout=40)
    r.raise_for_status()
    candidates = extract_candidates_from_page(r.text, r.url)
    if icao in candidates:
        return candidates[icao]

    # Recherche plus tolérante dans les liens autour du nom exact.
    soup = BeautifulSoup(r.text, "html.parser")
    exact_name = f"AD-2.{icao}.pdf".lower()
    for tag in soup.find_all(string=lambda x: x and exact_name in str(x).lower()):
        cur = tag.parent
        for _ in range(6):
            if cur is None:
                break
            if cur.name == "a" and cur.get("href"):
                return urljoin(r.url, cur["href"])
            a = cur.find("a", href=True)
            if a:
                return urljoin(r.url, a["href"])
            cur = cur.parent
    return None


def discover_vac_links(s: requests.Session, diagnostic_dir: Path) -> tuple[dict[str, str], dict]:
    """
    Découverte en deux temps :
    1. test de codes connus LFBD/LFBO/LFCR/LFMT/LFMA ;
    2. balayage des préfixes LFA à LFZ avec pagination.

    Les codes vus sans URL exploitable sont résolus ensuite par recherche exacte.
    """
    diagnostic_dir.mkdir(parents=True, exist_ok=True)
    found: dict[str, str] = {}
    seen_codes: set[str] = set()
    stats = {"samples": {}, "prefixes": {}, "unresolved": []}

    print("--- Test de quelques codes OACI connus ---")
    for icao in SAMPLE_ICAO:
        try:
            href = exact_lookup(s, icao)
            stats["samples"][icao] = bool(href)
            print(f"[exact] {icao}: {'OK' if href else 'NON TROUVÉ'}")
            if href:
                found[icao] = href
                seen_codes.add(icao)
        except Exception as exc:
            stats["samples"][icao] = False
            print(f"[exact] {icao}: ERREUR {type(exc).__name__}: {exc}")

    print("--- Balayage du catalogue par préfixes LFA ... LFZ ---")
    for letter in string.ascii_uppercase:
        prefix = "LF" + letter
        prefix_new = 0
        pages = 0
        no_new_pages = 0

        # 25 pages max par préfixe : très au-dessus de ce qui devrait être utile.
        for page in range(1, 26):
            url = catalog_url(prefix, page=page, limit=50)
            try:
                r = s.get(url, timeout=40)
                r.raise_for_status()
            except Exception as exc:
                print(f"[{prefix}] page {page}: ERREUR {type(exc).__name__}: {exc}")
                break

            pages += 1
            page_candidates = extract_candidates_from_page(r.text, r.url)

            # Même sans URL résolue, récupère tous les noms VAC visibles dans la page.
            page_codes = {m.group(1).upper() for m in VAC_RE.finditer(r.text)}
            page_codes.update(page_candidates.keys())
            page_codes = {c for c in page_codes if c.startswith(prefix)}

            added = 0
            for icao in sorted(page_codes):
                if icao not in seen_codes:
                    seen_codes.add(icao)
                    added += 1
                    prefix_new += 1
                if icao in page_candidates:
                    found.setdefault(icao, page_candidates[icao])

            print(
                f"[{prefix}] page {page:02d}: "
                f"codes={len(page_codes)} nouveaux={added} "
                f"liens={len(page_candidates)} total_codes={len(seen_codes)}"
            )

            # Conserve la première page d'un préfixe si elle ne contient aucun code,
            # pour faciliter le diagnostic sans avoir à relancer.
            if page == 1 and not page_codes:
                (diagnostic_dir / f"catalog_{prefix}_page1.html").write_text(
                    r.text, encoding="utf-8", errors="replace"
                )

            if added == 0:
                no_new_pages += 1
            else:
                no_new_pages = 0

            # Deux pages successives sans nouveau code = fin pratique de ce préfixe.
            if no_new_pages >= 2:
                break

            time.sleep(0.12)

        stats["prefixes"][prefix] = {
            "pages": pages,
            "new_codes": prefix_new,
        }

    print(f"Codes VAC détectés dans le HTML : {len(seen_codes)}")
    print(f"Liens directement résolus : {len(found)}")

    unresolved = sorted(seen_codes.difference(found))
    if unresolved:
        print(f"--- Résolution exacte de {len(unresolved)} codes sans lien ---")
        for i, icao in enumerate(unresolved, 1):
            try:
                href = exact_lookup(s, icao)
                if href:
                    found[icao] = href
                    print(f"[{i:03d}/{len(unresolved):03d}] {icao}: OK")
                else:
                    stats["unresolved"].append(icao)
                    print(f"[{i:03d}/{len(unresolved):03d}] {icao}: NON TROUVÉ")
            except Exception as exc:
                stats["unresolved"].append(icao)
                print(f"[{i:03d}/{len(unresolved):03d}] {icao}: ERREUR {exc}")
            time.sleep(0.08)

    return dict(sorted(found.items())), stats


def size_from_headers(headers: requests.structures.CaseInsensitiveDict) -> int | None:
    cr = headers.get("Content-Range")
    if cr:
        m = re.search(r"/(\d+)\s*$", cr)
        if m:
            return int(m.group(1))
    cl = headers.get("Content-Length")
    if cl and cl.isdigit():
        return int(cl)
    return None


def probe_one(item: tuple[str, str]) -> dict:
    icao, url = item
    s = session()
    result = {
        "icao": icao,
        "url": url,
        "status": None,
        "final_url": None,
        "content_type": None,
        "size_bytes": None,
        "method": None,
        "pdf_header_ok": False,
        "error": "",
    }
    try:
        h = s.head(url, allow_redirects=True, timeout=35)
        result["status"] = h.status_code
        result["final_url"] = h.url
        result["content_type"] = h.headers.get("Content-Type", "")
        size = size_from_headers(h.headers)
        if h.ok and size:
            result["size_bytes"] = size
            result["method"] = "HEAD"

        g = s.get(
            url,
            headers={"Range": "bytes=0-4095"},
            allow_redirects=True,
            stream=True,
            timeout=45,
        )
        result["status"] = g.status_code
        result["final_url"] = g.url
        result["content_type"] = g.headers.get("Content-Type", "")
        chunk = next(g.iter_content(chunk_size=4096), b"")
        result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
        ranged_size = size_from_headers(g.headers)
        if ranged_size:
            result["size_bytes"] = ranged_size
            result["method"] = "RANGE" if g.status_code == 206 else "GET_HEADERS"
        g.close()

        if not result["size_bytes"]:
            total = 0
            gg = s.get(url, allow_redirects=True, stream=True, timeout=90)
            gg.raise_for_status()
            first = True
            for block in gg.iter_content(chunk_size=1024 * 256):
                if not block:
                    continue
                if first:
                    result["pdf_header_ok"] = block.startswith(b"%PDF-")
                    first = False
                total += len(block)
            gg.close()
            result["size_bytes"] = total
            result["method"] = "FULL_COUNT"
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def full_download_sample(icao: str, url: str, out_dir: Path) -> dict:
    s = session()
    target = out_dir / f"{icao}.pdf"
    sha = hashlib.sha256()
    total = 0
    status = None
    content_type = ""
    final_url = ""
    error = ""
    pdf_ok = False
    try:
        with s.get(url, allow_redirects=True, stream=True, timeout=120) as r:
            status = r.status_code
            final_url = r.url
            content_type = r.headers.get("Content-Type", "")
            r.raise_for_status()
            first = True
            with target.open("wb") as f:
                for block in r.iter_content(chunk_size=1024 * 256):
                    if not block:
                        continue
                    if first:
                        pdf_ok = block.startswith(b"%PDF-")
                        first = False
                    f.write(block)
                    sha.update(block)
                    total += len(block)
        if not pdf_ok:
            error = "Le fichier téléchargé ne commence pas par %PDF-"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        target.unlink(missing_ok=True)
    return {
        "icao": icao,
        "url": url,
        "final_url": final_url,
        "status": status,
        "content_type": content_type,
        "size_bytes": total,
        "sha256": sha.hexdigest() if total else "",
        "pdf_header_ok": pdf_ok,
        "error": error,
    }


def human_bytes(n: int | None) -> str:
    if n is None:
        return "inconnue"
    value = float(n)
    units = ["o", "Ko", "Mo", "Go"]
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{n} o"


def write_outputs(
    out_dir: Path,
    links: dict[str, str],
    probes: list[dict],
    samples: list[dict],
    discovery_stats: dict,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    fields = [
        "icao", "url", "status", "final_url", "content_type",
        "size_bytes", "method", "pdf_header_ok", "error",
    ]
    with (out_dir / "inventaire_vac_sia.csv").open(
        "w", encoding="utf-8", newline=""
    ) as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in sorted(probes, key=lambda x: x["icao"]):
            w.writerow({k: row.get(k) for k in fields})

    payload = {
        "source": SIA,
        "discovered_count": len(links),
        "discovery": discovery_stats,
        "probes": sorted(probes, key=lambda x: x["icao"]),
        "full_download_samples": samples,
    }
    (out_dir / "inventaire_vac_sia.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    ok = [p for p in probes if p.get("size_bytes") and not p.get("error")]
    verified = [p for p in probes if p.get("pdf_header_ok")]
    errors = [p for p in probes if p.get("error")]
    total = sum(int(p["size_bytes"]) for p in ok)
    largest = sorted(ok, key=lambda p: int(p["size_bytes"]), reverse=True)[:15]

    lines = [
        "# Test GitHub Actions → SIA / VAC",
        "",
        f"- VAC avec URL résolue : **{len(links)}**",
        f"- Tailles obtenues : **{len(ok)}**",
        f"- PDF dont l'en-tête `%PDF-` a été vérifié : **{len(verified)}**",
        f"- Erreurs : **{len(errors)}**",
        f"- Taille totale mesurée : **{human_bytes(total)}**",
        f"- Taille moyenne : **{human_bytes(total // len(ok) if ok else 0)}**",
        f"- Codes non résolus : **{len(discovery_stats.get('unresolved', []))}**",
        "",
        "## Test des OACI témoins",
        "",
    ]
    for icao in SAMPLE_ICAO:
        lines.append(
            f"- {icao} : {'✅ trouvé' if discovery_stats.get('samples', {}).get(icao) else '❌ non trouvé'}"
        )

    lines += [
        "",
        "## Téléchargements complets témoins",
        "",
        "| OACI | Statut | Taille | PDF valide | SHA-256 |",
        "|---|---:|---:|:---:|---|",
    ]
    for sample in samples:
        lines.append(
            f"| {sample['icao']} | {sample.get('status')} | {human_bytes(sample.get('size_bytes'))} "
            f"| {'✅' if sample.get('pdf_header_ok') else '❌'} | `{sample.get('sha256', '')}` |"
        )

    lines += [
        "",
        "## 15 plus grosses VAC mesurées",
        "",
        "| OACI | Taille | Méthode |",
        "|---|---:|---|",
    ]
    for p in largest:
        lines.append(
            f"| {p['icao']} | {human_bytes(int(p['size_bytes']))} | {p.get('method')} |"
        )

    if errors:
        lines += ["", "## Erreurs", ""]
        for p in errors[:40]:
            lines.append(f"- **{p['icao']}** : {p['error']}")

    (out_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    diagnostics = out_dir / "diagnostic_catalogue"

    s = session()
    print("=== 1. Découverte des VAC dans le catalogue SIA ===")
    try:
        links, discovery_stats = discover_vac_links(s, diagnostics)
    except Exception as exc:
        print(f"ERREUR catalogue : {type(exc).__name__}: {exc}", file=sys.stderr)
        (out_dir / "summary.md").write_text(
            "# Test GitHub Actions → SIA / VAC\n\n"
            f"❌ Impossible de lire le catalogue SIA : `{type(exc).__name__}: {exc}`\n",
            encoding="utf-8",
        )
        return 2

    print(f"VAC avec URL résolue : {len(links)}")
    if not links:
        (out_dir / "discovery_debug.json").write_text(
            json.dumps(discovery_stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (out_dir / "summary.md").write_text(
            "# Test GitHub Actions → SIA / VAC\n\n"
            "❌ Le SIA est joignable mais aucune URL VAC n'a pu être résolue.\n\n"
            "Le nouvel artifact contient les pages HTML de diagnostic des préfixes sans résultat.\n",
            encoding="utf-8",
        )
        return 3

    print("=== 2. Mesure des tailles / vérification légère ===")
    probes: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 6))) as pool:
        futures = {pool.submit(probe_one, item): item[0] for item in links.items()}
        for i, fut in enumerate(as_completed(futures), 1):
            result = fut.result()
            probes.append(result)
            print(
                f"[{i:03d}/{len(links):03d}] {result['icao']} "
                f"status={result['status']} size={result['size_bytes']} "
                f"pdf={result['pdf_header_ok']} method={result['method']} "
                f"error={result['error'] or '-'}"
            )

    print("=== 3. Téléchargement complet de quelques VAC témoins ===")
    sample_dir = out_dir / "echantillons"
    sample_dir.mkdir(parents=True, exist_ok=True)
    samples = []
    chosen = [icao for icao in SAMPLE_ICAO if icao in links]
    if not chosen:
        chosen = list(links)[:3]
    for icao in chosen:
        print(f"Téléchargement complet {icao}...")
        samples.append(full_download_sample(icao, links[icao], sample_dir))

    write_outputs(out_dir, links, probes, samples, discovery_stats)

    invalid_samples = [
        sample for sample in samples
        if not sample.get("pdf_header_ok") or sample.get("error")
    ]
    print("=== TERMINÉ ===")
    print(f"VAC avec URL résolue : {len(links)}")
    print(f"Échantillons complets invalides : {len(invalid_samples)}")
    print(f"Résultats : {out_dir}")

    if samples and len(invalid_samples) == len(samples):
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
