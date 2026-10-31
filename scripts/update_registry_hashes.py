"""Utility to compute and populate SHA-256 integrity digests in models/forecasting/registry.json.

Enforces Sprint 2 model verification protocol:
- Every non-Naive champion model blob (.pkl) must have a verified SHA-256 digest in registry.json.
- Resolves cross-machine absolute paths to normalized repository-relative paths.
"""

import hashlib
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models" / "forecasting"
REGISTRY_FILE = MODEL_DIR / "registry.json"


def calculate_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def update_registry_hashes(registry_path: Path = REGISTRY_FILE) -> int:
    if not registry_path.exists():
        print(f"[ERROR] Registry file not found: {registry_path}")
        return 0

    with open(registry_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    updated_count = 0
    for key, entry in registry.items():
        model_name = entry.get("model_name", "")
        model_path_str = entry.get("model_path")

        if "naive" in model_name.lower():
            # Naive models do not have serialized binary blobs
            continue

        resolved_pkl = None
        if model_path_str:
            p = Path(model_path_str)
            if p.exists():
                resolved_pkl = p
            elif (MODEL_DIR / p.name).exists():
                resolved_pkl = MODEL_DIR / p.name

        if resolved_pkl and resolved_pkl.exists():
            digest = calculate_sha256(resolved_pkl)
            entry["sha256"] = digest
            entry["model_path"] = f"models/forecasting/{resolved_pkl.name}"
            updated_count += 1
            print(f"  [OK] {key} ({model_name}) -> {resolved_pkl.name} | sha256: {digest[:16]}...")
        else:
            print(f"  [WARN] {key} ({model_name}) has no local blob file found.")

    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)

    print(f"\n[SUCCESS] Updated {updated_count} entries with SHA-256 digests in {registry_path.name}")
    return updated_count


if __name__ == "__main__":
    count = update_registry_hashes()
    sys.exit(0 if count > 0 else 1)
