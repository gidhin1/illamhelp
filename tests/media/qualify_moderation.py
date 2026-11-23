"""Evaluate automatic moderation decisions against a held-out reviewer dataset."""

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

ALPHA = 0.05
ERROR_LIMIT = 0.01
MEDIA_KINDS = {"photo", "video"}


def binomial_cdf(errors, total, probability):
    """Probability of observing at most this many errors."""
    logs = [
        math.lgamma(total + 1) - math.lgamma(count + 1) - math.lgamma(total - count + 1)
        + count * math.log(probability) + (total - count) * math.log1p(-probability)
        for count in range(errors + 1)
    ]
    largest = max(logs)
    return math.exp(largest) * math.fsum(math.exp(value - largest) for value in logs)


def error_upper_bound(errors, total):
    """Exact one-sided 95% upper confidence bound for a binomial error rate."""
    if not total or errors == total:
        return 1.0
    low, high = 0.0, 1.0
    for _ in range(45):
        midpoint = (low + high) / 2
        if binomial_cdf(errors, total, midpoint) > ALPHA:
            low = midpoint
        else:
            high = midpoint
    return high


def evaluate(dataset):
    if dataset.get("split") != "holdout":
        raise ValueError("Qualification requires a holdout dataset")
    if not dataset.get("policy_version") or not dataset.get("detector_revision"):
        raise ValueError("Record the policy version and detector revision")
    gates = {}
    for target in dataset["targets"]:
        kind, decision, reason = target["kind"], target["decision"], target.get("reason")
        key = (kind, decision, reason)
        if (kind not in MEDIA_KINDS or decision not in {"approve", "reject"}
                or (decision == "reject" and not reason) or (decision == "approve" and reason is not None)
                or key in gates):
            raise ValueError("Each target must be a unique media kind and decision, with a reason for rejection")
        gates[key] = [0, 0]
    if not gates:
        raise ValueError("Declare the decisions being qualified")

    observed_ids = set()
    review_counts = defaultdict(lambda: [0, 0])
    for observation in dataset["observations"]:
        asset_id = observation["id"]
        kind = observation["kind"]
        decision = observation["decision"]
        if not asset_id or asset_id in observed_ids:
            raise ValueError("Use each asset once in the held-out dataset")
        if kind not in MEDIA_KINDS or decision not in {"review", "approve", "reject"}:
            raise ValueError("Invalid media kind or decision")
        if type(observation["serious_violation"]) is not bool:
            raise ValueError("The reviewer must label whether a serious violation was present")
        violations = observation["reviewer_violations"]
        if not isinstance(violations, list) or any(not isinstance(reason, str) or not reason for reason in violations):
            raise ValueError("The reviewer must supply a list of violation reason codes")
        observed_ids.add(asset_id)
        review_counts[kind][0] += 1
        if decision == "review":
            review_counts[kind][1] += 1
            continue
        reason = observation.get("reason")
        key = (kind, decision, reason)
        if key not in gates:
            raise ValueError("Every proposed automatic decision must have a declared target")
        tally = gates[key]
        tally[0] += 1
        tally[1] += observation["serious_violation"] if decision == "approve" else reason not in violations

    report = []
    for (kind, decision, reason), (total, errors) in gates.items():
        upper = error_upper_bound(errors, total)
        passed = upper < ERROR_LIMIT if decision == "approve" else upper <= ERROR_LIMIT
        report.append({"kind": kind, "decision": decision, "reason": reason, "samples": total,
                       "errors": errors, "error_upper_95": upper, "passed": passed})
    return {"policy_version": dataset["policy_version"], "detector_revision": dataset["detector_revision"],
            "gates": report, "review_rate": {kind: reviews / total for kind, (total, reviews) in review_counts.items()},
            "passed": all(item["passed"] for item in report)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()
    try:
        report = evaluate(json.loads(args.dataset.read_text()))
    except (ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
