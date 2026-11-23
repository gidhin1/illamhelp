import unittest

from qualify_moderation import error_upper_bound, evaluate


class QualificationTest(unittest.TestCase):
    def test_small_error_free_samples_fail(self):
        self.assertGreater(error_upper_bound(0, 100), 0.01)
        self.assertLess(error_upper_bound(0, 299), 0.01)

    def test_missing_decisions_and_wrong_rejection_reasons_fail(self):
        report = evaluate({
            "split": "holdout",
            "policy_version": "test-policy",
            "detector_revision": "test-detector",
            "targets": [
                {"kind": "photo", "decision": "reject", "reason": "contact"},
                {"kind": "video", "decision": "approve"},
            ],
            "observations": [{
                "id": "fixture",
                "kind": "photo",
                "decision": "reject",
                "reason": "contact",
                "reviewer_violations": ["explicit"],
                "serious_violation": True,
            }],
        })
        self.assertFalse(report["passed"])
        self.assertEqual(report["gates"][0]["errors"], 1)
        self.assertEqual(report["gates"][1]["samples"], 0)

    def test_cannot_qualify_on_calibration_examples(self):
        with self.assertRaisesRegex(ValueError, "holdout"):
            evaluate({"split": "calibration"})


if __name__ == "__main__":
    unittest.main()
