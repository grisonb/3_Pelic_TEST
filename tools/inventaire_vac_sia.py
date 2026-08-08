#!/usr/bin/env python3
"""
Test technique GitHub Actions -> SIA pour les VAC France.

But :
- vérifier qu'un runner GitHub peut joindre et lire les documents SIA ;
- inventorier les PDF "AIP Atlas VAC" de type AD-2.LFxx.pdf ;
- mesurer leur taille sans télécharger inutilement l'intégralité de chaque PDF ;
- télécharger intégralement quelques VAC témoins pour valider le flux bout en bout ;
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
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup

SIA = "https://www.sia.aviation-civile.gouv.fr"
SEARCH_URL = (
    SIA
    + "/catalogsearch/result/?c=8&format=pdf&limit=50&q=AD-2"
)

VAC_RE = re.compile(r"\bAD-2\.(LF[A-Z0-9]{2})\.pdf\b", re.I)
SAMPLE_ICAO = ("LFBD", "LFBO", "LFCR", "LFMT", "LFMA")
USER_AGENT = (
    "Mozilla/5.0 (compatible; NPF-Q400-VAC-technical-test/1.0; "
    "+https://github.com/grisonb/NPF-Q400-TEST)"
)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
        }
    )
    return s


def set_page(url: str, page: int) -> str:
    p = urlparse(url)
    q = parse_qs(p.query, keep_blank_values=True)
    q["page"] = [str(page)]
    q.setdefault("limit", ["50"])
    return urlunparse(
        (p.scheme, p.netloc, p.path, p.params, urlencode(q, doseq=True), p.fragment)
    )


def discover_vac_links(s: requests.Session) -> dict[str, str]:
    """
    Parcourt le catalogue SIA et conserve uniquement les documents dont
    le libellé correspond exactement à AD-2.LFxx.pdf et dont le contexte
    indique "AIP Atlas VAC".
    """
    found: dict[str, str] = {}
    empty_pages = 0

    for page in range(1, 121):
        url = set_page(SEARCH_URL, page)
        r = s.get(url, timeout=40)
        r.raise_for_status()

        soup = BeautifulSoup(r.text, "html.parser")
        new_this_page = 0

        for a in soup.find_all("a", href=True):
            label = " ".join(a.stripped_strings)
            m = VAC_RE.search(label)
            if not m:
                continue

            # Vérification supplémentaire du contexte de l'élément.
            parent_text = ""
            parent = a
            for _ in range(5):
                parent = parent.parent if parent else None
                if parent is None:
                    break
                parent_text = " ".join(parent.stripped_strings)
                if "Atlas VAC" in parent_text:
                    break

            if "Atlas VAC" not in parent_text:
                continue

            icao = m.group(1).upper()
            href = urljoin(SIA, a["href"])

            if icao not in found:
                found[icao] = href
                new_this_page += 1

        print(
            f"[catalogue] page {page:03d}: "
            f"+{new_this_page} VAC, total {len(found)}"
        )

        # Détection de la pagination. Si le site ne fournit plus de lien suivant
        # et que deux pages successives n'ajoutent rien, on s'arrête.
        next_link = (
            soup.select_one("a.action.next")
            or soup.find("a", attrs={"rel": "next"})
            or soup.find("a", string=re.compile(r"Page Suivant|Suivant", re.I))
        )

        if new_this_page == 0:
            empty_pages += 1
        else:
            empty_pages = 0

        if not next_link and empty_pages >= 2:
            break

        time.sleep(0.15)

    return dict(sorted(found.items()))


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
        # HEAD d'abord : très léger si le serveur fournit Content-Length.
        h = s.head(url, allow_redirects=True, timeout=35)
        result["status"] = h.status_code
        result["final_url"] = h.url
        result["content_type"] = h.headers.get("Content-Type", "")
        size = size_from_headers(h.headers)

        if h.ok and size:
            result["size_bytes"] = size
            result["method"] = "HEAD"

        # Une requête Range vérifie le début réel du PDF et peut également
        # fournir la taille totale via Content-Range.
        g = s.get(
            url,
            headers={"Range": "bytes=0-4095"},
            allow_redirects=True,
            stream=True,
            timeout=40,
        )
        result["status"] = g.status_code
        result["final_url"] = g.url
        result["content_type"] = g.headers.get("Content-Type", "")

        chunk = next(g.iter_content(chunk_size=4096), b"")
        result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
        ranged_size = size_from_headers(g.headers)
        if ranged_size:
            result["size_bytes"] = ranged_size
            result["method"] = (
                "RANGE" if g.status_code == 206 else "GET_HEADERS"
            )
        g.close()

        # Dernier recours : si aucune taille n'est disponible, on compte
        # réellement les octets sans conserver le fichier.
        if not result["size_bytes"]:
            total = 0
            gg = s.get(url, allow_redirects=True, stream=True, timeout=60)
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
        with s.get(url, allow_redirects=True, stream=True, timeout=90) as r:
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
        try:
            target.unlink(missing_ok=True)
        except Exception:
            pass

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


def write_outputs(out_dir: Path, links: dict[str, str], probes: list[dict], samples: list[dict]):
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "inventaire_vac_sia.csv"
    fields = [
        "icao",
        "url",
        "status",
        "final_url",
        "content_type",
        "size_bytes",
        "method",
        "pdf_header_ok",
        "error",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in sorted(probes, key=lambda x: x["icao"]):
            w.writerow({k: row.get(k) for k in fields})

    payload = {
        "source": SIA,
        "catalog_search": SEARCH_URL,
        "discovered_count": len(links),
        "probes": sorted(probes, key=lambda x: x["icao"]),
        "full_download_samples": samples,
    }
    (out_dir / "inventaire_vac_sia.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    ok = [p for p in probes if p.get("size_bytes") and not p.get("error")]
    verified = [p for p in probes if p.get("pdf_header_ok")]
    errors = [p for p in probes if p.get("error")]
    total = sum(int(p["size_bytes"]) for p in ok)
    largest = sorted(ok, key=lambda p: int(p["size_bytes"]), reverse=True)[:15]

    lines = [
        "# Test GitHub Actions → SIA / VAC",
        "",
        f"- VAC découvertes dans le catalogue : **{len(links)}**",
        f"- Tailles obtenues : **{len(ok)}**",
        f"- PDF dont l'en-tête `%PDF-` a été vérifié : **{len(verified)}**",
        f"- Erreurs : **{len(errors)}**",
        f"- Taille totale mesurée : **{human_bytes(total)}**",
        f"- Taille moyenne : **{human_bytes(total // len(ok) if ok else 0)}**",
        "",
        "## Téléchargements complets témoins",
        "",
        "| OACI | Statut | Taille | PDF valide | SHA-256 |",
        "|---|---:|---:|:---:|---|",
    ]

    for s in samples:
        sha = s.get("sha256", "")
        lines.append(
            f"| {s['icao']} | {s.get('status')} | {human_bytes(s.get('size_bytes'))} "
            f"| {'✅' if s.get('pdf_header_ok') else '❌'} | `{sha}` |"
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
        for p in errors[:30]:
            lines.append(f"- **{p['icao']}** : {p['error']}")

    (out_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    s = session()
    print("=== 1. Découverte des VAC dans le catalogue SIA ===")
    try:
        links = discover_vac_links(s)
    except Exception as exc:
        print(f"ERREUR catalogue : {type(exc).__name__}: {exc}", file=sys.stderr)
        (out_dir / "summary.md").write_text(
            "# Test GitHub Actions → SIA / VAC\n\n"
            f"❌ Impossible de lire le catalogue SIA : `{type(exc).__name__}: {exc}`\n",
            encoding="utf-8",
        )
        return 2

    print(f"VAC uniques découvertes : {len(links)}")
    if not links:
        (out_dir / "summary.md").write_text(
            "# Test GitHub Actions → SIA / VAC\n\n"
            "❌ Le SIA est joignable mais aucune VAC `AD-2.LFxx.pdf` n'a été détectée.\n",
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

    write_outputs(out_dir, links, probes, samples)

    errors = [p for p in probes if p.get("error")]
    invalid_samples = [s for s in samples if not s.get("pdf_header_ok") or s.get("error")]

    print("=== TERMINÉ ===")
    print(f"VAC découvertes : {len(links)}")
    print(f"Erreurs de mesure : {len(errors)}")
    print(f"Échantillons complets invalides : {len(invalid_samples)}")
    print(f"Résultats : {out_dir}")

    # Le workflow reste en succès si quelques documents isolés échouent,
    # mais échoue si aucun téléchargement complet témoin n'est valide.
    if samples and len(invalid_samples) == len(samples):
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
