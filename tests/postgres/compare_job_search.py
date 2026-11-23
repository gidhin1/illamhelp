"""Compare two staging APIs against independently judged search queries."""

import argparse
import concurrent.futures
import json
import math
import os
import statistics
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


def compare(base_url, cases, workers):
    def measure(case):
        params = urllib.parse.urlencode({**case["query"], "limit": 5})
        token = os.environ[case["token_env"]]
        request = urllib.request.Request(
            base_url.rstrip("/") + "/jobs/search?" + params,
            headers={"Authorization": "Bearer " + token},
        )
        start = time.monotonic()
        with urllib.request.urlopen(request, timeout=10) as response:
            jobs = json.load(response)
        elapsed_ms = (time.monotonic() - start) * 1000
        result_ids = {job["id"] for job in jobs}
        if result_ids.intersection(case["forbidden_ids"]):
            raise ValueError("Search returned a job outside the member's visibility")
        relevant = set(case["relevant_ids"])
        recall = len(relevant.intersection(result_ids)) / min(len(relevant), 5) if relevant else float(not jobs)
        return case["language"], recall, elapsed_ms, not jobs

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        measurements = list(pool.map(measure, cases))
    timings = sorted(item[2] for item in measurements)
    relevance = defaultdict(list)
    for language, score, _, _ in measurements:
        relevance[language].append(score)
    return {
        "top_five_relevance": {language: statistics.mean(scores) for language, scores in relevance.items()},
        "zero_result_rate": statistics.mean(missed for _, _, _, missed in measurements),
        "p95_ms": timings[math.ceil(0.95 * len(timings)) - 1],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("legacy_api")
    parser.add_argument("postgresql_api")
    parser.add_argument("judgments", type=Path)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    cases = json.loads(args.judgments.read_text())
    groups = {case["language"] for case in cases}
    if len(cases) < 100 or not {"en", "ml", "transliterated"}.issubset(groups):
        parser.error("Provide at least 100 judgments spanning en, ml, and transliterated")
    legacy = compare(args.legacy_api, cases, args.workers)
    postgres = compare(args.postgresql_api, cases, args.workers)
    passed = postgres["p95_ms"] <= 1.10 * legacy["p95_ms"] and all(
        postgres["top_five_relevance"][language] >= 0.95 * score
        for language, score in legacy["top_five_relevance"].items()
    )
    print(json.dumps({"legacy": legacy, "postgresql": postgres, "passed": passed}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
