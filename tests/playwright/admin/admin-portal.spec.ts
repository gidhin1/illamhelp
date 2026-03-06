import { expect, Page, test } from "@playwright/test";

const ADMIN_TOKEN = "admin-e2e-token";
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN ?? "admin";

async function setAdminCookie(page: Page, token = ADMIN_TOKEN): Promise<void> {
  await page.goto("/");
  await page.evaluate((value) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `illamhelp_admin_access_token=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60}; SameSite=Lax${secure}`;
  }, token);
}

function mockAuthMe(page: Page, roles: string[]): Promise<void> {
  return page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "11111111-1111-4111-8111-111111111111",
        publicUserId: KEYCLOAK_ADMIN_USERNAME,
        tokenSubject: "11111111-1111-4111-8111-111111111111",
        roles,
        userType: "both"
      })
    });
  });
}

test("admin sign-in form submits and opens dashboard", async ({ page }) => {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "11111111-1111-4111-8111-111111111111",
        publicUserId: KEYCLOAK_ADMIN_USERNAME,
        username: KEYCLOAK_ADMIN_USERNAME,
        roles: ["admin"],
        accessToken: ADMIN_TOKEN,
        expiresIn: 3600,
        tokenType: "Bearer"
      })
    });
  });
  await mockAuthMe(page, ["admin"]);
  await page.route("**/api/v1/admin/media/moderation-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]"
    });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Username or email").fill(KEYCLOAK_ADMIN_USERNAME);
  await page.getByLabel("Password").fill("admin_password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Admin dashboard")).toBeVisible();
});

test("admin sign-in shows API error for invalid credentials", async ({ page }) => {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid credentials"
      })
    });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Username or email").fill(KEYCLOAK_ADMIN_USERNAME);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid credentials")).toBeVisible();
});

test("admin sign-out clears session and shows sign-in required prompt", async ({ page }) => {
  await mockAuthMe(page, ["admin"]);
  await page.route("**/api/v1/admin/media/moderation-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]"
    });
  });

  await setAdminCookie(page);
  await page.goto("/");
  await expect(page.getByText("Admin dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByText("Sign in required")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("admin shell blocks non-admin users", async ({ page }) => {
  await mockAuthMe(page, ["both"]);
  await setAdminCookie(page);
  await page.goto("/moderation");

  await expect(page.getByText("Admin access required")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with another account" })).toBeVisible();
});

test("admin moderation queue supports review workflow", async ({ page }) => {
  let itemStatus: "pending" | "approved" = "pending";

  await mockAuthMe(page, ["admin"]);

  await page.route("**/api/v1/admin/media/moderation-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          moderationJobId: "job-1",
          mediaId: "media-1",
          stage: "human_review",
          status: itemStatus,
          reasonCode: itemStatus === "approved" ? "policy_safe_service_media" : null,
          moderationCreatedAt: "2026-02-28T08:00:00.000Z",
          mediaState: itemStatus === "approved" ? "approved" : "human_review_pending",
          ownerUserId: "member_abc123",
          kind: "image",
          contentType: "image/jpeg",
          fileSizeBytes: 2048
        }
      ])
    });
  });

  await page.route("**/api/v1/admin/media/media-1/moderation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        media: {
          id: "media-1",
          ownerUserId: "member_abc123",
          kind: "image",
          bucketName: "illamhelp-quarantine",
          objectKey: "uploads/a.jpg",
          contentType: "image/jpeg",
          fileSizeBytes: 2048,
          checksumSha256: "a".repeat(64),
          state: itemStatus === "approved" ? "approved" : "human_review_pending",
          moderationReasonCodes: itemStatus === "approved" ? ["policy_safe_service_media"] : [],
          aiScores: { nudity: 0.01, violence: 0.02 },
          previewUrl: "https://example.com/media-1.jpg",
          previewUrlExpiresAt: "2026-02-28T09:00:00.000Z",
          createdAt: "2026-02-28T08:00:00.000Z",
          updatedAt: "2026-02-28T08:10:00.000Z"
        },
        moderationJobs: [
          {
            id: "job-1",
            mediaAssetId: "media-1",
            stage: "human_review",
            status: itemStatus,
            assignedModeratorUserId: KEYCLOAK_ADMIN_USERNAME,
            reasonCode: itemStatus === "approved" ? "policy_safe_service_media" : null,
            details: {},
            createdAt: "2026-02-28T08:00:00.000Z",
            completedAt: itemStatus === "approved" ? "2026-02-28T08:10:00.000Z" : null
          }
        ]
      })
    });
  });

  await page.route("**/api/v1/admin/media/moderation/process", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selected: 1,
        processed: 1,
        technicalApproved: 1,
        technicalRejected: 0,
        aiCompleted: 1,
        errors: 0
      })
    });
  });

  await page.route("**/api/v1/admin/media/media-1/review", async (route) => {
    itemStatus = "approved";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "media-1",
        ownerUserId: "member_abc123",
        kind: "image",
        bucketName: "illamhelp-quarantine",
        objectKey: "uploads/a.jpg",
        contentType: "image/jpeg",
        fileSizeBytes: 2048,
        checksumSha256: "a".repeat(64),
        state: "approved",
        moderationReasonCodes: ["policy_safe_service_media"],
        aiScores: { nudity: 0.01, violence: 0.02 },
        createdAt: "2026-02-28T08:00:00.000Z",
        updatedAt: "2026-02-28T08:10:00.000Z"
      })
    });
  });

  await setAdminCookie(page);
  await page.goto("/moderation");

  await expect(page.getByTestId("moderation-item-media-1")).toBeVisible();
  await expect(page.getByTestId("moderation-details-panel")).toBeVisible();
  await expect(page.getByTestId("moderation-preview-image")).toBeVisible();
  await page.getByTestId("moderation-reason-code").selectOption("policy_safe_service_media");
  await page.getByTestId("moderation-notes").fill("Looks acceptable for publication");
  await page.getByTestId("moderation-approve").click();

  await expect(page.getByText("Media approved.")).toBeVisible();
});

test("admin moderation queue supports rejection workflow", async ({ page }) => {
  let itemStatus: "pending" | "rejected" = "pending";

  await mockAuthMe(page, ["admin"]);
  await page.route("**/api/v1/admin/media/moderation-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          moderationJobId: "job-2",
          mediaId: "media-2",
          stage: "human_review",
          status: itemStatus,
          reasonCode: itemStatus === "rejected" ? "policy_prohibited_content" : null,
          moderationCreatedAt: "2026-02-28T10:00:00.000Z",
          mediaState: itemStatus === "rejected" ? "rejected" : "human_review_pending",
          ownerUserId: "member_xyz123",
          kind: "video",
          contentType: "video/mp4",
          fileSizeBytes: 4096
        }
      ])
    });
  });
  await page.route("**/api/v1/admin/media/media-2/moderation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        media: {
          id: "media-2",
          ownerUserId: "member_xyz123",
          kind: "video",
          bucketName: "illamhelp-quarantine",
          objectKey: "uploads/v.mp4",
          contentType: "video/mp4",
          fileSizeBytes: 4096,
          checksumSha256: "b".repeat(64),
          state: itemStatus === "rejected" ? "rejected" : "human_review_pending",
          moderationReasonCodes: itemStatus === "rejected" ? ["policy_prohibited_content"] : [],
          aiScores: { nudity: 0.71, violence: 0.02 },
          previewUrl: "https://example.com/media-2.mp4",
          previewUrlExpiresAt: "2026-02-28T11:00:00.000Z",
          createdAt: "2026-02-28T10:00:00.000Z",
          updatedAt: "2026-02-28T10:05:00.000Z"
        },
        moderationJobs: [
          {
            id: "job-2",
            mediaAssetId: "media-2",
            stage: "human_review",
            status: itemStatus,
            assignedModeratorUserId: KEYCLOAK_ADMIN_USERNAME,
            reasonCode: itemStatus === "rejected" ? "policy_prohibited_content" : null,
            details: {},
            createdAt: "2026-02-28T10:00:00.000Z",
            completedAt: itemStatus === "rejected" ? "2026-02-28T10:05:00.000Z" : null
          }
        ]
      })
    });
  });
  await page.route("**/api/v1/admin/media/media-2/review", async (route) => {
    itemStatus = "rejected";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "media-2",
        ownerUserId: "member_xyz123",
        kind: "video",
        bucketName: "illamhelp-quarantine",
        objectKey: "uploads/v.mp4",
        contentType: "video/mp4",
        fileSizeBytes: 4096,
        checksumSha256: "b".repeat(64),
        state: "rejected",
        moderationReasonCodes: ["policy_prohibited_content"],
        aiScores: { nudity: 0.71, violence: 0.02 },
        createdAt: "2026-02-28T10:00:00.000Z",
        updatedAt: "2026-02-28T10:05:00.000Z"
      })
    });
  });

  await setAdminCookie(page);
  await page.goto("/moderation");
  await expect(page.getByTestId("moderation-item-media-2")).toBeVisible();
  await expect(page.getByTestId("moderation-preview-video")).toBeVisible();

  await page.getByTestId("moderation-reason-code").selectOption("policy_prohibited_content");
  await page.getByTestId("moderation-notes").fill("Contains prohibited personal content.");
  await page.getByTestId("moderation-reject").click();

  await expect(page.getByText("Media rejected.")).toBeVisible();
});

test("admin timeline lookup renders consent and audit sections", async ({ page }) => {
  await mockAuthMe(page, ["support"]);

  await page.route("**/api/v1/admin/oversight/timeline**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        member: {
          userId: "11111111-1111-4111-8111-111111111111",
          publicUserId: "member_demo01",
          role: "both",
          createdAt: "2026-02-28T08:00:00.000Z",
          updatedAt: "2026-02-28T08:30:00.000Z"
        },
        accessRequests: [
          {
            id: "request-1",
            requesterUserId: "member_provider01",
            ownerUserId: "member_demo01",
            requestedFields: ["phone", "email"],
            purpose: "Need to coordinate service visit",
            status: "approved",
            createdAt: "2026-02-28T08:10:00.000Z",
            resolvedAt: "2026-02-28T08:20:00.000Z"
          }
        ],
        consentGrants: [
          {
            id: "grant-1",
            ownerUserId: "member_demo01",
            granteeUserId: "member_provider01",
            grantedFields: ["phone"],
            purpose: "Service follow-up",
            status: "active",
            grantedAt: "2026-02-28T08:20:00.000Z",
            expiresAt: null,
            revokedAt: null,
            revokeReason: null
          }
        ],
        auditEvents: [
          {
            id: "audit-1",
            eventType: "pii_access_granted",
            purpose: "Service follow-up",
            actorUserId: "member_demo01",
            targetUserId: "member_provider01",
            metadata: { grantId: "grant-1" },
            createdAt: "2026-02-28T08:20:00.000Z"
          }
        ]
      })
    });
  });

  await setAdminCookie(page);
  await page.goto("/audit");

  await page.getByTestId("timeline-member-id").fill("member_demo01");
  await page.getByTestId("timeline-search").click();

  await expect(page.getByTestId("timeline-member-summary")).toContainText("member_demo01");
  await expect(page.getByTestId("timeline-access-requests")).toContainText("Need to coordinate service visit");
  await expect(page.getByTestId("timeline-consent-grants")).toContainText("Service follow-up");
  await expect(page.getByTestId("timeline-audit-events")).toContainText("pii_access_granted");
});

test("admin timeline lookup shows API errors", async ({ page }) => {
  await mockAuthMe(page, ["support"]);
  await page.route("**/api/v1/admin/oversight/timeline**", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 404,
        error: "Not Found",
        message: "Member not found"
      })
    });
  });

  await setAdminCookie(page);
  await page.goto("/audit");
  await page.getByTestId("timeline-member-id").fill("missing_member");
  await page.getByTestId("timeline-search").click();

  await expect(page.getByText("Member not found")).toBeVisible();
  await expect(page.getByText("No member selected")).toBeVisible();
});
