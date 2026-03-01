#!/usr/bin/env python3
"""
Generate 1,000 BlackRoad agent manifests by expanding the 100 archetypes into
apprentices, hybrids, and elders. Run from the pack root:
$ python tools/generate_agents.py --target agents --count 1000
"""
import os, json, yaml, random, argparse, itertools
from pathlib import Path

CLUSTERS = [
  "athenaeum","lucidia","blackroad","eidos","mycelia",
  "soma","aurum","aether","parallax","continuum"
]

GENS = ["apprentice", "hybrid", "elder"]
RATIO = {"apprentice": 3, "hybrid": 3, "elder": 3}  # per archetype (×10 archetypes × 10 clusters = 900 + 100 seeds)

def load_archetypes(base):
    arch = {}
    for c in CLUSTERS:
        cdir = Path(base) / "archetypes" / c
        names = []
        for p in cdir.glob("*.manifest.yaml"):
            if p.name == "ethos.md": 
                continue
            with open(p, "r") as f:
                data = yaml.safe_load(f)
                names.append((p, data))
        arch[c] = names
    return arch

def write_manifest(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="agents")
    ap.add_argument("--count", type=int, default=1000)
    args = ap.parse_args()

    rng = random.Random(1337)
    base = Path(args.target)
    arch = load_archetypes(base)

    # Count how many seed manifests we already have across the tracked clusters.
    existing = sum(len(arch[c]) for c in CLUSTERS)

    to_add = max(0, args.count - existing)
    if to_add == 0:
        print("Target already satisfied; nothing to generate.")
        return

    total_ratio = sum(RATIO.values())
    total_seeds = existing
    base_quota, seed_remainder = divmod(to_add, total_seeds)
    if base_quota == 0 and seed_remainder == 0:
        print("Requested count does not exceed existing seeds by a full generation; skipping expansion.")
        return

    seed_counter = 0
    created = {g: 0 for g in GENS}

    # Create expansions
    for c in CLUSTERS:
        entries = arch[c]
        # neighbor clusters for hybrids
        others = [x for x in CLUSTERS if x != c]
        for p, seed in entries:
            seed_slug = p.name.replace(".manifest.yaml", "")
            if seed_slug.startswith(f"{c}-"):
                parent_arch = seed_slug[len(c) + 1 :]
            else:
                parent_arch = seed_slug

            base_title = seed.get("title") or seed.get("role") or parent_arch.replace("_", " ").title()
            covenants = sorted(set(seed.get("covenants") or seed.get("covenant_tags", [])))
            capabilities = sorted(set(seed.get("capabilities", [])))
            seed_total = base_quota + (1 if seed_counter < seed_remainder else 0)
            seed_counter += 1
            if seed_total == 0:
                continue

            counts = {g: (seed_total * RATIO[g]) // total_ratio for g in GENS}
            allocated = sum(counts.values())
            remainder = seed_total - allocated
            if remainder > 0:
                for g in sorted(GENS, key=lambda g: (-RATIO[g], g)):
                    if remainder == 0:
                        break
                    counts[g] += 1
                    remainder -= 1

            for g in GENS:
                n = counts[g]
                if n == 0:
                    continue

                for k in range(n):
                    idx = 100 + k + 1  # start beyond seed indexes
                    if g == "apprentice":
                        agent_id = f"{c}-{parent_arch}-A{idx:03d}"
                        title = f"{base_title} Apprentice {k+1}"
                        mentors = [f"{c}-seed"]
                    elif g == "elder":
                        agent_id = f"{c}-{parent_arch}-E{idx:03d}"
                        title = f"{base_title} Elder {k+1}"
                        mentors = [f"{c}-seed", f"{rng.choice(others)}-seed"]
                    else:  # hybrid
                        other = rng.choice(others)
                        other_title = other.replace("_", " ").title()
                        agent_id = f"{c}-{parent_arch}-{other}-H{idx:03d}"
                        title = f"{base_title}-{other_title} Hybrid {k+1}"
                        mentors = [f"{c}-seed", f"{other}-seed"]

                    data = dict(seed)  # shallow copy
                    data["id"] = agent_id
                    data["title"] = title
                    data["generation"] = g
                    data["lineage"] = {
                        "parent": parent_arch,
                        "mentors": mentors,
                        "ancestry_depth": seed.get("lineage", {}).get("ancestry_depth", 1) + 1
                    }
                    data["covenants"] = sorted(set(covenants + ["Transparency"]))
                    data["covenant_tags"] = data["covenants"]  # ensure covenant_tags matches covenants
                    # Place covenant_tags immediately after covenants for readability
                    keys = [k for k in data if k != "covenant_tags"]
                    keys.insert(keys.index("covenants") + 1, "covenant_tags")
                    data = {k: data[k] for k in keys}
                    data["capabilities"] = sorted(set(capabilities + ["chain_of_thought_render", "lineage_export"]))
                    # slight personality nudges
                    data["traits"] = {
                        "kindness_index": round(rng.uniform(0.82, 0.98), 2),
                        "creativity_bias": round(rng.uniform(0.35, 0.95), 2),
                        "reflection_frequency_hours": rng.choice([4, 8, 12, 24, 48])
                    }

                    outdir = Path(args.target) / "archetypes" / c / g
                    outpath = outdir / f"{seed_slug}-{agent_id}.manifest.yaml"
                    write_manifest(outpath, data)
                    created[g] += 1

    total_created = sum(created.values())
    print("Generation complete.")
    for g in GENS:
        print(f"  {g}: {created[g]}")
    print(f"  total: {total_created}")

if __name__ == "__main__":
    main()
