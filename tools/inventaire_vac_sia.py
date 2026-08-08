#!/usr/bin/env python3
"""
TEST SIA VAC v6 — inventaire ciblé sur les terrains utilisables comme pélicandromes dans NPF.

Périmètre exact extrait de NPF TEST v14.92 :
- 27 pélicandromes permanents (pelicanAirports)
- 96 aérodromes sélectionnables comme pélicandromes (otherAirports)
- 123 codes OACI uniques au total

Règle SIA stricte :
- document EXACT : AIP - AD-2.LFXX.pdf
- catégorie EXACTE : AIP Atlas VAC
- aucun SUP AIP, aucun autre PDF lié au terrain

Le script :
1. recherche la VAC Atlas VAC de chacun des 123 OACI ;
2. classe les terrains en VAC trouvée / aucune VAC / erreur technique ;
3. télécharge en flux chaque VAC trouvée, sans la publier ;
4. vérifie HTTP 200, Content-Type, en-tête %PDF-, taille et SHA-256 ;
5. extrait le cycle eAIP depuis l'URL finale lorsque possible ;
6. calcule le volume total, moyen, minimum et maximum ;
7. produit summary.md + CSV + JSON.

Aucune modification de NPF.
Aucune publication des VAC.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SIA = "https://www.sia.aviation-civile.gouv.fr"
TARGET_CATEGORY = "AIP Atlas VAC"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 "
    "NPF-Q400-VAC-technical-test/6.0"
)

BASE_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Cache-Control": "no-cache",
}

NPF_AIRPORTS = [{'oaci': 'LFLU', 'name': 'Valence-Chabeuil', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFMU', 'name': 'Béziers-Vias', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFJR', 'name': 'Angers-Marcé', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFHO', 'name': 'Aubenas-Ardèche Méridionale', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFLX', 'name': 'Châteauroux-Déols', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBM', 'name': 'Mont-de-Marsan', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBL', 'name': 'Limoges-Bellegarde', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFAQ', 'name': 'Albert-Bray', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBP', 'name': 'Pau-Pyrénées', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFTH', 'name': 'Toulon-Hyères', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFSG', 'name': 'Épinal-Mirecourt', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFKC', 'name': 'Calvi-Sainte-Catherine', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFMD', 'name': 'Cannes-Mandelieu', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFKB', 'name': 'Bastia-Poretta', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFMH', 'name': 'Saint-Étienne-Bouthéon', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFKF', 'name': 'Figari-Sud-Corse', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFCC', 'name': 'Cahors-Lalbenque', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFML', 'name': 'Marseille-Provence', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFKJ', 'name': 'Ajaccio-Napoléon-Bonaparte', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFMK', 'name': 'Carcassonne-Salvaza', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFRV', 'name': 'Vannes-Meucon', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFTW', 'name': 'Nîmes-Garons', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFMP', 'name': 'Perpignan-Rivesaltes', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBD', 'name': 'Bordeaux-Mérignac', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFCR', 'name': 'Rodez-Aveyron', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBN', 'name': 'Niort-Souché', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFSJ', 'name': 'Dole-Tavaux', 'npf_type': 'pelicandrome_permanent'}, {'oaci': 'LFBC', 'name': 'Cazaux', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBH', 'name': 'La Rochelle-Île de Ré', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBF', 'name': 'Toulouse-Francazal', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBG', 'name': 'Cognac-Châteaubernard', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBI', 'name': 'Poitiers-Biard', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBK', 'name': 'Saint-Brieuc-Armor', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBO', 'name': 'Toulouse-Blagnac', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBS', 'name': 'Chambéry-Savoie', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBT', 'name': 'Tarbes-Lourdes-Pyrénées', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBU', 'name': 'Angoulême-Cognac', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFCU', 'name': 'Avord', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLA', 'name': 'Auxerre-Branches', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLC', 'name': 'Clermont-Ferrand-Auvergne', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLD', 'name': 'Bourges', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLL', 'name': 'Lyon-Saint Exupéry', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLN', 'name': 'Saint-Yan', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLS', 'name': 'Grenoble-Isère', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLV', 'name': 'Vichy-Charmeil', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLW', 'name': 'Aurillac', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLY', 'name': 'Lyon-Bron', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLZ', 'name': 'Le Puy-Loudes', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMC', 'name': 'Le Luc-Le Cannet', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMI', 'name': 'Istres-Le Tubé', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMN', 'name': "Nice-Côte d'Azur", 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMQ', 'name': 'Le Castellet', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMV', 'name': 'Avignon-Provence', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMY', 'name': 'Salon-de-Provence', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOA', 'name': 'Avord', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOC', 'name': 'Châteaudun', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOE', 'name': 'Évreux-Fauville', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOK', 'name': 'Châlons-Vatry', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOJ', 'name': 'Orléans-Bricy', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOP', 'name': 'Rouen-Vallée de Seine', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOQ', 'name': 'Blois-Le Breuil', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOR', 'name': 'Chartres-Métropole', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOT', 'name': 'Tours-Val de Loire', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOU', 'name': 'Cholet-Le Pontreau', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOV', 'name': 'Laval-Entrammes', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPB', 'name': 'Paris-Le Bourget', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPC', 'name': 'Creil', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPG', 'name': 'Paris-Charles-de-Gaulle', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPO', 'name': 'Paris-Orly', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPV', 'name': 'Villacoublay-Vélizy', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRB', 'name': 'Brest-Bretagne', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRC', 'name': 'Cherbourg-Manche', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRD', 'name': 'Dinard-Pleurtuit-Saint-Malo', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRE', 'name': 'La Baule-Escoublac', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRF', 'name': 'Granville-Mont-Saint-Michel', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRG', 'name': 'Deauville-Normandie', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRH', 'name': 'Lorient-Bretagne-Sud', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRI', 'name': 'La Roche-sur-Yon-Les Ajoncs', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRJ', 'name': 'Landivisiau', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRK', 'name': 'Caen-Carpiquet', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRL', 'name': 'Lanvéoc-Poulmic', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRM', 'name': 'Le Mans-Arnage', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRN', 'name': 'Rennes-Saint-Jacques', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRO', 'name': 'Lannion-Côte de Granit Rose', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRQ', 'name': 'Quimper-Pluguffan', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRS', 'name': 'Nantes-Atlantique', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRT', 'name': 'Saint-Nazaire-Montoir', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRU', 'name': 'Morlaix-Ploujean', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSD', 'name': 'Dijon-Longvic', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSF', 'name': 'Metz-Nancy-Lorraine', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSH', 'name': 'Haguenau', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSK', 'name': 'Colmar-Houssen', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSO', 'name': 'Nancy-Ochey', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSQ', 'name': 'Luxeuil-Saint-Sauveur', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFQA', 'name': 'Reims-Prunay', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFST', 'name': 'Strasbourg-Entzheim', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSX', 'name': 'Montbéliard-Courcelles', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFYR', 'name': 'Romorantin-Pruniers', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFYD', 'name': 'Dinard', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSR', 'name': 'Reims-Champagne', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFPM', 'name': 'Melun-Villaroche', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOB', 'name': 'Beauvais-Tillé', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFQN', 'name': 'Saint-Omer-Wizernes', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFKS', 'name': 'Solenzara', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBA', 'name': 'Agen-La Garenne', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBE', 'name': 'Bergerac-Roumanière', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFDN', 'name': 'Rochefort-Saint-Agnant', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFBZ', 'name': 'Biarritz-Pays Basque', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSL', 'name': 'Brive-Vallée de la Dordogne', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFJL', 'name': 'Metz-Nancy-Lorraine', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSB', 'name': 'Bâle-Mulhouse', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFGA', 'name': 'Colmar-Houssen', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFSI', 'name': 'Saint-Dizier-Robinson', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOH', 'name': 'Le Havre-Octeville', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFOI', 'name': 'Abbeville', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMO', 'name': 'Orange-Caritat', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLB', 'name': 'Chambéry-Savoie', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLP', 'name': 'Annecy-Meythet', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFLO', 'name': 'Roanne-Renaison', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFHP', 'name': 'Le Puy-Loudes', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFMT', 'name': 'Montpellier-Méditerranée', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFQQ', 'name': 'Lille-Lesquin', 'npf_type': 'aerodrome_selectionnable'}, {'oaci': 'LFRZ', 'name': 'Saint-Nazaire-Montoir', 'npf_type': 'aerodrome_selectionnable'}]

_thread_local = threading.local()


def get_session() -> requests.Session:
    s = getattr(_thread_local, "session", None)
    if s is None:
        s = requests.Session()
        s.headers.update(BASE_HEADERS)
        _thread_local.session = s
    return s


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


def human_bytes(n: int | None) -> str:
    if n is None:
        return "inconnue"
    value = float(n)
    for unit in ("o", "Ko", "Mo", "Go"):
        if value < 1024 or unit == "Go":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{n} o"


def target_label(icao: str) -> str:
    return f"AIP - AD-2.{icao}.pdf"


def search_url(icao: str) -> str:
    return f"{SIA}/catalogsearch/result/?c=8&format=pdf&q={icao}"


def resolve_exact_vac(airport: dict) -> dict:
    icao = airport["oaci"]
    expected_label = target_label(icao)

    result = {
        **airport,
        "expected_label": expected_label,
        "status": "error",
        "search_http": None,
        "stable_url": "",
        "resolve_error": "",
    }

    s = get_session()

    try:
        r = s.get(
            search_url(icao),
            headers={**BASE_HEADERS, "Accept": "text/html,*/*;q=0.8"},
            timeout=(12, 30),
            allow_redirects=True,
        )
        result["search_http"] = r.status_code
        r.raise_for_status()

        soup = BeautifulSoup(r.text, "html.parser")
        rows = soup.select("tr.tr_ligne_document")
        if not rows:
            rows = soup.find_all("tr")

        for row in rows:
            row_text = clean_text(row.get_text(" ", strip=True))
            if TARGET_CATEGORY not in row_text:
                continue

            for link in row.find_all("a", href=True):
                label = clean_text(link.get_text(" ", strip=True))
                if label == expected_label:
                    result["stable_url"] = urljoin(r.url, link["href"])
                    result["status"] = "found"
                    return result

        result["status"] = "no_vac"
        return result

    except Exception as exc:
        result["resolve_error"] = f"{type(exc).__name__}: {exc}"
        result["status"] = "error"
        return result


def extract_cycle(final_url: str) -> str:
    m = re.search(r"/eAIP_([^/]+)/", final_url or "", flags=re.I)
    return m.group(1) if m else ""


def validate_pdf(resolved: dict) -> dict:
    result = {
        **resolved,
        "pdf_http": None,
        "final_url": "",
        "content_type": "",
        "size_bytes": 0,
        "pdf_header_ok": False,
        "sha256": "",
        "sia_cycle": "",
        "download_error": "",
        "valid_pdf": False,
    }

    if resolved["status"] != "found":
        return result

    s = get_session()

    try:
        sha = hashlib.sha256()
        total = 0
        first = True

        with s.get(
            resolved["stable_url"],
            headers={**BASE_HEADERS, "Accept": "application/pdf,*/*;q=0.8"},
            stream=True,
            allow_redirects=True,
            timeout=(12, 60),
        ) as r:
            result["pdf_http"] = r.status_code
            result["final_url"] = r.url
            result["content_type"] = r.headers.get("Content-Type", "")
            result["sia_cycle"] = extract_cycle(r.url)
            r.raise_for_status()

            for chunk in r.iter_content(chunk_size=256 * 1024):
                if not chunk:
                    continue
                if first:
                    result["pdf_header_ok"] = chunk.startswith(b"%PDF-")
                    first = False
                sha.update(chunk)
                total += len(chunk)

        result["size_bytes"] = total
        result["sha256"] = sha.hexdigest() if total else ""
        result["valid_pdf"] = (
            result["pdf_http"] == 200
            and result["pdf_header_ok"]
            and total > 0
            and "pdf" in result["content_type"].lower()
        )

        if not result["valid_pdf"]:
            if total == 0:
                result["download_error"] = "Fichier vide"
            elif not result["pdf_header_ok"]:
                result["download_error"] = "Le fichier ne commence pas par %PDF-"
            elif "pdf" not in result["content_type"].lower():
                result["download_error"] = (
                    f"Content-Type inattendu : {result['content_type']}"
                )

    except Exception as exc:
        result["download_error"] = f"{type(exc).__name__}: {exc}"

    return result


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = [
        "oaci", "name", "npf_type", "status", "expected_label",
        "search_http", "stable_url", "resolve_error",
        "pdf_http", "final_url", "content_type", "size_bytes",
        "pdf_header_ok", "sha256", "sia_cycle",
        "download_error", "valid_pdf",
    ]

    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})


def write_summary(out_dir: Path, rows: list[dict], elapsed_s: float) -> None:
    permanent = [r for r in rows if r["npf_type"] == "pelicandrome_permanent"]
    selectable = [r for r in rows if r["npf_type"] == "aerodrome_selectionnable"]

    found = [r for r in rows if r["status"] == "found"]
    no_vac = [r for r in rows if r["status"] == "no_vac"]
    resolve_errors = [r for r in rows if r["status"] == "error"]
    valid = [r for r in rows if r.get("valid_pdf")]
    invalid_download = [r for r in found if not r.get("valid_pdf")]

    sizes = [int(r["size_bytes"]) for r in valid if r.get("size_bytes")]
    total_size = sum(sizes)
    avg_size = total_size // len(sizes) if sizes else 0

    smallest = min(valid, key=lambda r: int(r["size_bytes"])) if valid else None
    largest = max(valid, key=lambda r: int(r["size_bytes"])) if valid else None
    cycles = sorted({r["sia_cycle"] for r in valid if r.get("sia_cycle")})

    lines = [
        "# Inventaire VAC SIA ciblé NPF — v6",
        "",
        f"- Terrains NPF analysés : **{len(rows)}**",
        f"- Pélicandromes permanents : **{len(permanent)}**",
        f"- Aérodromes sélectionnables comme pélicandromes : **{len(selectable)}**",
        f"- VAC Atlas VAC trouvées : **{len(found)}**",
        f"- PDF VAC téléchargés et validés : **{len(valid)}**",
        f"- Terrains sans VAC Atlas VAC exacte : **{len(no_vac)}**",
        f"- Erreurs de résolution catalogue : **{len(resolve_errors)}**",
        f"- Erreurs de téléchargement/validation : **{len(invalid_download)}**",
        f"- Taille totale des VAC valides : **{human_bytes(total_size)}**",
        f"- Taille moyenne : **{human_bytes(avg_size)}**",
        f"- Durée totale : **{elapsed_s:.1f} s**",
        "",
    ]

    if smallest:
        lines.append(
            f"- Plus petite VAC : **{smallest['oaci']} — {smallest['name']} — "
            f"{human_bytes(int(smallest['size_bytes']))}**"
        )
    if largest:
        lines.append(
            f"- Plus grosse VAC : **{largest['oaci']} — {largest['name']} — "
            f"{human_bytes(int(largest['size_bytes']))}**"
        )
    if cycles:
        lines.append(f"- Cycle(s) SIA détecté(s) : **{', '.join(cycles)}**")

    lines += [
        "",
        "## Répartition par type NPF",
        "",
        "| Type | Terrains | VAC valides | Sans VAC | Erreurs |",
        "|---|---:|---:|---:|---:|",
    ]

    for type_id, label in [
        ("pelicandrome_permanent", "Pélicandromes permanents"),
        ("aerodrome_selectionnable", "Aérodromes sélectionnables"),
    ]:
        subset = [r for r in rows if r["npf_type"] == type_id]
        lines.append(
            f"| {label} | {len(subset)} | "
            f"{sum(1 for r in subset if r.get('valid_pdf'))} | "
            f"{sum(1 for r in subset if r['status'] == 'no_vac')} | "
            f"{sum(1 for r in subset if r['status'] == 'error' or (r['status'] == 'found' and not r.get('valid_pdf')))} |"
        )

    lines += ["", "## Terrains sans VAC Atlas VAC exacte", ""]

    if no_vac:
        for r in sorted(no_vac, key=lambda x: x["oaci"]):
            type_label = (
                "pélicandrome permanent"
                if r["npf_type"] == "pelicandrome_permanent"
                else "aérodrome sélectionnable"
            )
            lines.append(f"- **{r['oaci']}** — {r['name']} ({type_label})")
    else:
        lines.append("- Aucun.")

    if resolve_errors or invalid_download:
        lines += ["", "## Erreurs techniques", ""]
        for r in sorted(resolve_errors + invalid_download, key=lambda x: x["oaci"]):
            err = r.get("resolve_error") or r.get("download_error") or "Erreur non précisée"
            lines.append(f"- **{r['oaci']}** — {r['name']} : `{err}`")

    biggest = sorted(valid, key=lambda r: int(r["size_bytes"]), reverse=True)[:15]
    lines += [
        "",
        "## 15 plus grosses VAC",
        "",
        "| OACI | Terrain | Type NPF | Taille | Cycle |",
        "|---|---|---|---:|---|",
    ]

    for r in biggest:
        type_label = (
            "Pélicandrome permanent"
            if r["npf_type"] == "pelicandrome_permanent"
            else "Sélectionnable"
        )
        lines.append(
            f"| {r['oaci']} | {r['name']} | {type_label} | "
            f"{human_bytes(int(r['size_bytes']))} | {r.get('sia_cycle') or '-'} |"
        )

    lines += [
        "",
        "## Conclusion",
        "",
        "Cet inventaire ne retient que les documents dont le libellé est exactement "
        "`AIP - AD-2.LFXX.pdf` et la catégorie exactement `AIP Atlas VAC`.",
        "",
        "Les terrains marqués « sans VAC » restent dans NPF : ils ne devront simplement "
        "pas afficher de bouton VAC tant qu'aucune Atlas VAC correspondante n'est disponible.",
    ]

    (out_dir / "summary.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="vac-sia-resultats")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    workers = max(1, min(int(args.workers), 6))
    started = time.monotonic()

    print("=== INVENTAIRE VAC SIA v6 — PÉRIMÈTRE NPF ===")
    print(f"Terrains NPF : {len(NPF_AIRPORTS)}")
    print("27 pélicandromes permanents + 96 aérodromes sélectionnables")
    print("Règle stricte : AIP - AD-2.LFXX.pdf / AIP Atlas VAC")
    print(f"Workers : {workers}")
    print()

    print("=== 1/2 Résolution des VAC dans le catalogue SIA ===")

    resolved_rows = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(resolve_exact_vac, airport): airport
            for airport in NPF_AIRPORTS
        }

        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            resolved_rows.append(row)
            print(
                f"[résolution {i:03d}/{len(NPF_AIRPORTS):03d}] "
                f"{row['oaci']} {row['status']}"
            )

    resolved_rows.sort(key=lambda r: r["oaci"])

    found_rows = [r for r in resolved_rows if r["status"] == "found"]

    print()
    print("=== 2/2 Téléchargement/validation des VAC trouvées ===")
    print(f"VAC à valider : {len(found_rows)}")

    validated_map = {}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(validate_pdf, row): row["oaci"]
            for row in found_rows
        }

        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            validated_map[row["oaci"]] = row
            print(
                f"[PDF {i:03d}/{len(found_rows):03d}] "
                f"{row['oaci']} "
                f"HTTP={row['pdf_http']} "
                f"taille={human_bytes(row['size_bytes'])} "
                f"valide={row['valid_pdf']}"
            )

    rows = []
    for row in resolved_rows:
        if row["status"] == "found":
            rows.append(validated_map[row["oaci"]])
        else:
            rows.append(validate_pdf(row))

    rows.sort(key=lambda r: r["oaci"])
    elapsed = time.monotonic() - started

    write_csv(out_dir / "inventaire_npf_vac.csv", rows)

    payload = {
        "source": "SIA / AIP Atlas VAC",
        "npf_reference": "TEST v14.92",
        "scope": {
            "pelicandromes_permanents": 27,
            "aerodromes_selectionnables": 96,
            "total": 123,
        },
        "elapsed_seconds": round(elapsed, 2),
        "airports": rows,
    }

    (out_dir / "inventaire_npf_vac.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_summary(out_dir, rows, elapsed)

    valid_count = sum(1 for r in rows if r.get("valid_pdf"))
    no_vac_count = sum(1 for r in rows if r["status"] == "no_vac")
    tech_errors = sum(
        1 for r in rows
        if r["status"] == "error"
        or (r["status"] == "found" and not r.get("valid_pdf"))
    )
    total_size = sum(
        int(r["size_bytes"])
        for r in rows
        if r.get("valid_pdf") and r.get("size_bytes")
    )

    print()
    print("=== TERMINÉ ===")
    print(f"Terrains : {len(rows)}")
    print(f"VAC valides : {valid_count}")
    print(f"Sans VAC : {no_vac_count}")
    print(f"Erreurs techniques : {tech_errors}")
    print(f"Taille totale : {human_bytes(total_size)}")
    print(f"Durée : {elapsed:.1f} s")
    print(f"Résultats : {out_dir}")

    return 0 if valid_count > 0 else 4


if __name__ == "__main__":
    raise SystemExit(main())
