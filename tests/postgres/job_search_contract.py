"""Run against an empty PostgreSQL database using psql (arguments follow the script)."""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "infra/db/migrations"
REPOSITORY = ROOT / "api-java/src/main/java/com/illamhelp/api/jobs/JobRepository.java"
query = next(sql for sql in REPOSITORY.read_text().split('"""') if "WITH ranked_ids" in sql)
owner = "00000000-0000-0000-0000-000000000001"
viewer = "00000000-0000-0000-0000-000000000002"
member = "00000000-0000-0000-0000-000000000003"

fixture = f"""
INSERT INTO users(id, username, role) VALUES
  ('{owner}', 'owner', 'both'), ('{viewer}', 'viewer', 'both'), ('{member}', 'member', 'both');
INSERT INTO profiles(user_id, first_name, rating_average) VALUES ('{owner}', 'Owner', 4.5);
INSERT INTO connections(user_a_id, user_b_id, requested_by_user_id, status, decided_at) VALUES ('{owner}', '{member}', '{owner}', 'accepted', now());
INSERT INTO jobs(seeker_user_id, category, title, description, location_text, location_latitude,
                 location_longitude, visibility, status, assigned_provider_user_id) VALUES
  ('{owner}', 'plumbing', 'Plumber', 'Repair a tap', 'Kochi', 9.93, 76.27, 'public', 'posted', NULL),
  ('{owner}', 'plumbing', 'Plumber', 'Private job', 'Kochi', 9.93, 76.27, 'connections_only', 'posted', NULL),
  ('{owner}', 'electrical', 'വയറിംഗ്', 'Replace wiring', 'Kochi', 9.93, 76.27, 'public', 'posted', NULL),
  ('{owner}', 'plumbing', 'Old plumber job', 'Assigned work', 'Kochi', 9.93, 76.27,  'connections_only', 'posted', NULL);
INSERT INTO job_applications(id, job_id, provider_user_id, status)
SELECT '00000000-0000-0000-0000-000000000004', id, '{viewer}', 'accepted'
FROM jobs WHERE title = 'Old plumber job';
UPDATE jobs SET status = 'accepted', assigned_provider_user_id = '{viewer}',
  accepted_application_id = '00000000-0000-0000-0000-000000000004' WHERE title = 'Old plumber job';
"""

defaults = dict(preferredIds="NULL", userId=f"'{viewer}'", q="NULL", rankedQuery="NULL",
                category="NULL", locationText="NULL", minSeekerRating="NULL", statuses="'posted'",
                visibility="NULL", latitude="NULL", longitude="NULL", radiusKm="NULL", limit="50")


def check(label, expected, **overrides):
    params = defaults | overrides
    sql = re.sub(r"(?<!:):([A-Za-z][A-Za-z0-9]*)", lambda match: params[match[1]], query)
    return f"""
DO $contract$
BEGIN
  IF (SELECT count(*) FROM ({sql}) AS matches) <> {expected} THEN
    RAISE EXCEPTION 'Search fixture failed: {label}';
  END IF;
END $contract$;
"""


checks = [
    check("public filter only", 2),
    check("owner sees connection-only job", 3, userId=f"'{owner}'"),
    check("accepted connection sees connection-only job", 3, userId=f"'{member}'"),
    check("assigned member sees accepted job", 1, statuses="'accepted'"),
    check("connection-only filter excludes inaccessible jobs", 0, visibility="'connections_only'"),
    check("typo match", 1, q="'%plumbr%'", rankedQuery="'plumbr'"),
    check("Malayalam match", 1, q="'%വയറിംഗ്%'", rankedQuery="'വയറിംഗ്'"),
    check("category and location filters", 1, category="'%plumbing%'", locationText="'%kochi%'"),
    check("rating threshold", 0, minSeekerRating="4.6"),
    check("nearby radius", 2, latitude="9.93", longitude="76.27", radiusKm="5"),
    check("distant radius", 0, latitude="25.28", longitude="51.53", radiusKm="5"),
    check("result limit", 1, limit="1"),
]

baseline, search = (path.read_text() for path in sorted(MIGRATIONS.glob("V000[12]__*.sql")))
lease_migration = (MIGRATIONS / "V0003__moderation_screening_lease.sql").read_text()
media_repository = REPOSITORY.parent.parent / "media/MediaAssetRepository.java"
claim = next(sql for sql in media_repository.read_text().split('"""') if "WITH candidate AS" in sql)
lease_fixture = f"""
INSERT INTO media_assets(owner_user_id, profile_user_id, purpose, kind, bucket_name, object_key,
                         content_type, file_size_bytes, checksum_sha256)
VALUES ('{owner}', '{owner}', 'profile', 'image', 'quarantine', 'photo', 'image/jpeg', 1, 'test');
INSERT INTO moderation_jobs(media_asset_id, stage)
SELECT id, 'ai_review' FROM media_assets;
CREATE TEMP TABLE incomplete_claim AS {claim};
UPDATE media_assets SET state = 'scanning';
CREATE TEMP TABLE first_claim AS {claim};
UPDATE moderation_jobs SET screening_lease_until = now() - interval '1 second';
CREATE TEMP TABLE reclaimed AS {claim};
DO $contract$
BEGIN
  IF EXISTS (SELECT 1 FROM incomplete_claim) OR (SELECT count(*) FROM first_claim) <> 1
    OR (SELECT count(*) FROM reclaimed) <> 1
    OR (SELECT attempts FROM reclaimed) <> 2
    OR (SELECT "leaseToken" FROM reclaimed) = (SELECT "leaseToken" FROM first_claim) THEN
    RAISE EXCEPTION 'Expired screening lease was not reclaimed';
  END IF;
END $contract$;
"""
media_source = media_repository.read_text()
eligible = re.search(r'String APPEAL_ELIGIBLE = """(.*?)"""', media_source, re.S)[1]
appeal_parts = re.search(r'("""\s*WITH appealed AS .*?)int enqueueOwnerAppeal', media_source, re.S)[1].split('"""')
appeal = appeal_parts[1] + eligible + appeal_parts[3]
appeal = appeal.replace(":mediaId", "(SELECT id::text FROM media_assets WHERE object_key = 'photo')")
resolve = next(sql for sql in media_source.split('"""') if "WITH changed AS" in sql
               and "'appeal_pending'::media_state" in sql)
resolve = (resolve.replace(":mediaId", "(SELECT id::text FROM media_assets WHERE object_key = 'photo')")
           .replace(":state", "'rejected'").replace(":reasonCode", "'human_rejected'"))
appeal_fixture = f"""
UPDATE media_assets SET state = 'rejected',
  moderation_reason_codes = ARRAY['technical_photo_format_mismatch'];
UPDATE moderation_jobs SET status = 'rejected', reason_code = 'technical_photo_format_mismatch';
{appeal.replace(":userId", repr(viewer))};
DO $contract$
BEGIN
  IF (SELECT state FROM media_assets) <> 'rejected' OR
      EXISTS (SELECT 1 FROM moderation_jobs WHERE stage = 'human_review') THEN
    RAISE EXCEPTION 'Non-owner was able to request an appeal';
  END IF;
END $contract$;
UPDATE media_assets SET purpose = 'verification_document';
{appeal.replace(":userId", repr(owner))};
UPDATE media_assets SET purpose = 'profile', moderation_reason_codes = ARRAY['malware_detected'];
UPDATE moderation_jobs SET reason_code = 'malware_detected';
{appeal.replace(":userId", repr(owner))};
DO $contract$
BEGIN
  IF EXISTS (SELECT 1 FROM moderation_jobs WHERE stage = 'human_review') THEN
    RAISE EXCEPTION 'Verification or malware was allowed into the appeal queue';
  END IF;
END $contract$;
UPDATE media_assets SET moderation_reason_codes = ARRAY['technical_photo_format_mismatch'];
UPDATE moderation_jobs SET reason_code = 'technical_photo_format_mismatch';
{appeal.replace(":userId", repr(owner))};
{appeal.replace(":userId", repr(owner))};
DO $contract$
BEGIN
  IF (SELECT state FROM media_assets) <> 'appeal_pending' OR
      (SELECT count(*) FROM moderation_jobs WHERE stage = 'human_review'
        AND details->>'source' = 'owner_appeal' AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'Owner retries did not leave exactly one pending appeal';
  END IF;
END $contract$;
CREATE TEMP TABLE resolved_appeal AS {resolve};
DO $contract$
BEGIN
  IF (SELECT state FROM resolved_appeal) <> 'rejected' OR NOT EXISTS (SELECT 1 FROM resolved_appeal) THEN
    RAISE EXCEPTION 'Admin review did not resolve the appeal';
  END IF;
END $contract$;
UPDATE moderation_jobs SET status = 'rejected' WHERE stage = 'human_review';
{appeal.replace(":userId", repr(owner))};
DO $contract$
BEGIN
  IF (SELECT count(*) FROM moderation_jobs WHERE stage = 'human_review') <> 1 THEN
    RAISE EXCEPTION 'A resolved appeal could be reopened';
  END IF;
END $contract$;
"""
subprocess.run(
    [*(sys.argv[1:] or ["psql"]), "-X", "-v", "ON_ERROR_STOP=1"],
    input="BEGIN;\n" + baseline + fixture + search + "\n".join(checks) + lease_migration + lease_fixture + appeal_fixture + "ROLLBACK;\n",
    text=True,
    check=True,
)
print(f"{len(checks)} PostgreSQL search fixtures plus screening lease recovery and appeal checks passed")
