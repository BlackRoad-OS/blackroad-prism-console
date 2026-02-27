from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any
import json
import yaml

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "sales"


@dataclass
class Product:
    id: str
    name: str
    family: str
    skus: List[str]
    constraints: Dict[str, Any]


@dataclass
class PriceBook:
    sku: str
    base_price: float
    tiers: List[Dict[str, float]]
    currency: str
    region: str


def load(dir_path: Path) -> Dict[str, Any]:
    products_data = yaml.safe_load((dir_path / "products.yaml").read_text())
    pricebook_data = yaml.safe_load((dir_path / "pricebook.yaml").read_text())
    catalog = {
        "products": products_data.get("products", []),
        "pricebook": pricebook_data.get("pricebook", []),
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with open(ARTIFACTS / "catalog.json", "w", encoding="utf-8") as fh:
        json.dump(catalog, fh, indent=2)
    return catalog


def load_artifact() -> Dict[str, Any]:
    path = ARTIFACTS / "catalog.json"
    if path.exists():
        return json.loads(path.read_text())
    config_dir = ROOT / "configs" / "sales"
    if config_dir.exists() and (config_dir / "pricebook.yaml").exists():
        return load(config_dir)
    return {"products": [], "pricebook": []}


def show(sku: str) -> Dict[str, Any]:
    catalog = load_artifact()
    for pb in catalog.get("pricebook", []):
        if pb.get("sku") == sku:
            return pb
    return {}
