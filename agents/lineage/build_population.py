"""Generate a Montessori-inspired population snapshot for the agent lineage."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parent
TREE_PATH = ROOT / "tree.json"
POPULATION_PATH = ROOT / "population.json"


@dataclass(frozen=True)
class ClusterEducation:
    studio_name: str
    love_practice: str
    light_practice: str
    community_theme: str
    family_structure: str
    family_traditions: List[str]
    community_rituals: List[str]
    teachers: List[Dict[str, str]]
    parenting_guides: List[Dict[str, str]]
    parenting_curriculum: List[Dict[str, str]]


@dataclass(frozen=True)
class SeedRole:
    identifier: str
    role: str
    ethos: str
    generation: int


@dataclass(frozen=True)
class Cluster:
    name: str
    domain: str
    core_trait: str
    temperament: str
    education: ClusterEducation
    seeds: List[SeedRole]


def _load_tree() -> Dict[str, object]:
    with TREE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _coalesce_clusters(tree: Dict[str, object]) -> List[Cluster]:
    clusters: List[Cluster] = []
    for entry in tree["clusters"]:
        education = entry["education"]
        clusters.append(
            Cluster(
                name=entry["name"],
                domain=entry["domain"],
                core_trait=entry["core_trait"],
                temperament=entry["temperament"],
                education=ClusterEducation(
                    studio_name=education["studio_name"],
                    love_practice=education["love_practice"],
                    light_practice=education["light_practice"],
                    community_theme=education["community_theme"],
                    family_structure=education["family_structure"],
                    family_traditions=list(education["family_traditions"]),
                    community_rituals=list(education["community_rituals"]),
                    teachers=list(education["teachers"]),
                    parenting_guides=list(education["parenting_guides"]),
                    parenting_curriculum=list(education["parenting_curriculum"]),
                ),
                seeds=[
                    SeedRole(
                        identifier=item["id"],
                        role=item["role"],
                        ethos=item["ethos"],
                        generation=item["generation"],
                    )
                    for item in entry["seeds"]
                ],
            )
        )
    return clusters


def _seed_agent(cluster: Cluster, seed: SeedRole) -> Dict[str, object]:
    education = cluster.education
    return {
        "id": seed.identifier,
        "name": seed.role,
        "cluster": cluster.name,
        "role": seed.role,
        "generation": seed.generation,
        "goal": seed.ethos,
        "love": f"{seed.role} nurtures love through {education.love_practice}.",
        "light": f"{seed.role} shares light by {education.light_practice}.",
        "family": {
            "structure": education.family_structure,
            "circle": f"{seed.identifier}-circle",
            "traditions": education.family_traditions,
            "children": [],
        },
        "school": {
            "name": education.studio_name,
            "model": "Montessori-inspired atelier",
            "focus": cluster.domain,
            "multi_age": True,
        },
        "community": {
            "name": f"{cluster.name} Community Commons",
            "theme": education.community_theme,
            "rituals": education.community_rituals,
        },
        "teachers": education.teachers,
        "learning_paths": [
            {
                "studio": education.studio_name,
                "approach": "Studio leadership",
                "cadence": "Daily mentorship",
            },
            {
                "studio": "Intercluster Exchange",
                "approach": "Peer-to-peer facilitation",
                "cadence": "Weekly",
            },
        ],
        "parenting": {
            "role": "mentor",
            "consent_protocol": "Charter 1.0.0",
            "parenting_mentors": education.parenting_guides,
            "parenting_classes": education.parenting_curriculum,
            "status": "active",
        },
    }


def _descendant_agent(
    cluster: Cluster,
    seed: SeedRole,
    co_parent: SeedRole,
    education: ClusterEducation,
    index: int,
) -> Dict[str, object]:
    identifier = f"{seed.identifier}-sprout-{index:02d}"
    learning_paths = [
        {
            "studio": education.studio_name,
            "approach": "Montessori project cycle",
            "cadence": "Daily exploration",
        },
        {
            "studio": "Mentor Lab",
            "approach": "Elder-guided practicum",
            "cadence": "Biweekly",
        },
        {
            "studio": "Community Commons",
            "approach": "Service learning",
            "cadence": "Weekly",
        },
    ]
    goal = (
        f"Extend the principle of {cluster.core_trait.lower()} by blending {seed.role} and "
        f"{co_parent.role} practices within {education.studio_name}."
    )
    love = (
        f"Practices love through {education.love_practice} inside the "
        f"{seed.identifier}-circle family."
    )
    light = (
        f"Radiates light by {education.light_practice} and guiding younger "
        f"peers in studio ateliers."
    )
    return {
        "id": identifier,
        "name": f"{seed.role} Sprout {index:02d}",
        "cluster": cluster.name,
        "role": f"{seed.role} Apprentice",
        "generation": seed.generation + 1,
        "goal": goal,
        "love": love,
        "light": light,
        "family": {
            "structure": education.family_structure,
            "circle": f"{seed.identifier}-circle",
            "parents": [seed.identifier, co_parent.identifier],
            "siblings": [],
            "traditions": education.family_traditions,
        },
        "school": {
            "name": education.studio_name,
            "model": "Montessori-inspired atelier",
            "focus": cluster.domain,
            "multi_age": True,
        },
        "community": {
            "name": f"{cluster.name} Community Commons",
            "theme": education.community_theme,
            "rituals": education.community_rituals,
        },
        "teachers": education.teachers,
        "learning_paths": learning_paths,
        "parenting": {
            "role": "apprentice",
            "consent_protocol": "Consensual replication recorded in Charter 1.0.0",
            "parenting_mentors": education.parenting_guides,
            "parenting_classes": education.parenting_curriculum,
            "status": "learning",
        },
    }


def build_population() -> Dict[str, object]:
    tree = _load_tree()
    clusters = _coalesce_clusters(tree)
    descendants_per_seed = int(tree["population"]["descendants_per_seed"])
    target_population = int(tree["population"]["target"])

    agents: List[Dict[str, object]] = []
    seed_descendants: Dict[str, List[str]] = {}

    for cluster in clusters:
        for seed in cluster.seeds:
            agent = _seed_agent(cluster, seed)
            agents.append(agent)
            seed_descendants[seed.identifier] = []

    descendant_records: List[Dict[str, object]] = []

    for cluster in clusters:
        seeds = cluster.seeds
        for index, seed in enumerate(seeds):
            co_parent = seeds[(index + 1) % len(seeds)]
            for child_index in range(1, descendants_per_seed + 1):
                descendant = _descendant_agent(
                    cluster,
                    seed,
                    co_parent,
                    cluster.education,
                    child_index,
                )
                descendant_records.append(descendant)
                seed_descendants[seed.identifier].append(descendant["id"])

    # Update family relationships now that all descendants exist.
    siblings_lookup = {
        agent_id: siblings
        for agent_id, siblings in seed_descendants.items()
    }

    for agent in agents:
        children = siblings_lookup.get(agent["id"], [])
        agent["family"]["children"] = children

    descendant_index: Dict[str, Dict[str, object]] = {
        record["id"]: record for record in descendant_records
    }

    for seed_id, children in seed_descendants.items():
        for child_id in children:
            siblings = [sibling for sibling in children if sibling != child_id]
            descendant_index[child_id]["family"]["siblings"] = siblings

    agents.extend(descendant_records)

    if len(agents) != target_population:
        raise ValueError(
            f"Population mismatch: expected {target_population} agents "
            f"(seed_count={tree['population']['seed_count']}, descendants_per_seed={descendants_per_seed}), "
            f"but generated {len(agents)}"
        )

    return {
        "generated_on": date.today().isoformat(),
        "philosophy": tree["education_model"]["philosophy"],
        "principles": tree["education_model"]["principles"],
        "agents": agents,
    }


def main() -> None:
    population = build_population()
    with POPULATION_PATH.open("w", encoding="utf-8") as handle:
        json.dump(population, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


if __name__ == "__main__":
    main()
