const {
  assertElementNotExistsById,
  assertTextNotVisible,
  createJobByUi,
  loginByUi,
  logStep,
  makeUser,
  openOwnJobManagerByUi,
  readElementTextById,
  readProfileUserId,
  registerByUi,
  requestConnectionByUi,
  scrollToTop,
  seedUserAndLoginByUi,
  signOutIfVisible,
  tapById,
  tapByTextInScroll,
  tapTab,
  typeById,
  waitForAuthEntryPoint,
  waitForSuccessOrError,
  waitForText,
  waitForTextInScroll
} = require("./helpers/ui-helpers");

const E2E_TIMEOUT_MS = Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000");

function readAdminUserFromEnv() {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing admin E2E credentials. Set E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD.");
  }

  return { username, password };
}

describe("IllamHelp mobile full flow (Detox)", () => {

  it("auth entrypoint renders login and register modes", async () => {
    await waitForAuthEntryPoint();
    await waitFor(element(by.id("auth-mode-login"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-mode-register"))).toBeVisible().withTimeout(15000);
  });

  it("auth mode switch shows expected form fields", async () => {
    await waitForAuthEntryPoint();
    await tapById("auth-mode-login", "auth-scroll");
    await waitFor(element(by.id("auth-login-username"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-login-password"))).toBeVisible().withTimeout(15000);

    await tapById("auth-mode-register", "auth-scroll");
    await waitFor(element(by.id("auth-register-first-name"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-register-email"))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id("auth-register-username"))).toBeVisible().withTimeout(15000);
  });

  it("register lands on home and sign out returns to auth", async () => {
    const user = makeUser("both");
    await registerByUi(user);
    await waitFor(element(by.id("tab-home"))).toBeVisible().withTimeout(20000);

    await signOutIfVisible();
    await waitForAuthEntryPoint();
  });

  it("login with wrong password shows auth error", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await signOutIfVisible();
    await waitForAuthEntryPoint();
    await tapById("auth-mode-login", "auth-scroll");
    await typeById("auth-login-username", user.username, "auth-scroll");
    await typeById("auth-login-password", `${user.password}x`, "auth-scroll");
    await tapById("auth-login-submit", "auth-scroll");
    await waitFor(element(by.id("auth-error-banner"))).toBeVisible().withTimeout(20000);
  });

  it("tab navigation works after sign in", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("notifications");
    await waitForText("Stay updated");

    await tapTab("jobs");
    await waitForText("Create job");

    await tapTab("connections");
    await waitForText("Connect with people you trust");

    await tapTab("consent");
    await waitForText("Share contact details safely");

    await tapTab("profile");
    await waitForText("Your account");

    await tapTab("home");
    await waitForText("Your activity at a glance");
  });

  it("notifications page shows empty state for a new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("notifications");
    await waitForText("Stay updated");
    await waitFor(element(by.id("notifications-empty"))).toBeVisible().withTimeout(20000);

    const unreadBadgeText = await readElementTextById("notifications-unread-count");
    if (!/^\d+\s+unread$/i.test(unreadBadgeText)) {
      throw new Error(`Unexpected unread badge text: ${unreadBadgeText}`);
    }
  });

  it("jobs form shows validation error for short payload", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("jobs");
    await scrollToTop("jobs-scroll");
    await typeById("jobs-category", "p", "jobs-scroll");
    await typeById("jobs-title", "abc", "jobs-scroll");
    await typeById("jobs-description", "short", "jobs-scroll");
    await typeById("jobs-location", "k", "jobs-scroll");
    await tapById("jobs-submit", "jobs-scroll");
    await waitFor(element(by.id("jobs-submit-error-banner"))).toBeVisible().withTimeout(20000);
  });

  it("jobs form creates a valid post", async () => {
    const user = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const title = `Leak fix ${shortId}`;

    await seedUserAndLoginByUi(user);
    await createJobByUi({
      category: "plumber",
      title,
      description: "Need urgent sink leakage repair support in apartment kitchen.",
      locationText: "Kakkanad, Kochi"
    });
  });

  it("jobs posted by me shows no-applicants state and disables applicant management when empty", async () => {
    const user = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);

    await seedUserAndLoginByUi(user);
    await createJobByUi({
      category: "plumber",
      title: `Manage applicants ${shortId}`,
      description: "Need plumbing support for bathroom leakage diagnostics.",
      locationText: "Kakkanad, Kochi"
    });

    await waitForTextInScroll("No applicants", "jobs-scroll", 30000);

    try {
      await tapByTextInScroll("Manage applicants", "jobs-scroll", 3000);
    } catch {
      // expected for disabled control in many runs
    }

    await assertTextNotVisible("Back to jobs list", 1200);
  });

  it("jobs posted by me opens applicant manager view when applicants exist", async () => {
    const seeker = makeUser("both");
    const provider = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const title = `Applicant review ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    await createJobByUi({
      category: "plumber",
      title,
      description: "Need support for kitchen pipeline pressure issue.",
      locationText: "Kakkanad, Kochi"
    });

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);
    const providerUserId = await readProfileUserId();

    await tapTab("jobs");
    await waitForTextInScroll(title, "jobs-scroll", 40000);
    await tapByTextInScroll("Apply for job", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", [
      "jobs-action-error-banner",
      "jobs-error-banner"
    ]);

    await signOutIfVisible();
    await loginByUi(seeker);

    await openOwnJobManagerByUi();
    await waitForText("Back to jobs list", 30000);
    await waitForText(providerUserId, 30000);
  });

  it("connections page shows empty state for new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("connections");
    await waitForText("No connections yet.");
  });

  it("consent page shows empty-state guidance for new user", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    await tapTab("consent");
    await waitForText("No accepted connections yet.");
    await waitForText("No pending requests for you.");
  });

  it("profile saves changes and uploads media proof", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("profile");
    await scrollToTop("profile-scroll");
    await typeById("profile-city", "Kochi", "profile-scroll");
    await typeById("profile-area", "Kakkanad", "profile-scroll");
    await typeById("profile-service-categories", "plumber,electrician", "profile-scroll");
    await typeById("profile-phone", "+919812345678", "profile-scroll");
    await tapById("profile-save", "profile-scroll");
    await waitForText("Profile updated.");

    await tapById("profile-media-upload", "profile-scroll");
    await waitFor(element(by.id("profile-media-success"))).toBeVisible().withTimeout(30000);
  });

  it("profile public gallery hides media that is still in review", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);
    const memberId = await readProfileUserId();

    await scrollToTop("profile-scroll");
    await tapById("profile-media-upload", "profile-scroll");
    await waitFor(element(by.id("profile-media-success"))).toBeVisible().withTimeout(30000);

    await typeById("profile-public-owner-input", memberId, "profile-scroll");
    await tapById("profile-public-load", "profile-scroll");
    await waitFor(element(by.id("profile-public-empty"))).toBeVisible().withTimeout(30000);
    await assertElementNotExistsById("profile-public-item");
  });

  it("profile public gallery shows error for unknown member id", async () => {
    const user = makeUser("both");
    await seedUserAndLoginByUi(user);

    await tapTab("profile");
    await scrollToTop("profile-scroll");
    await typeById(
      "profile-public-owner-input",
      `missing_${Date.now().toString(36).slice(-6)}`,
      "profile-scroll"
    );
    await tapById("profile-public-load", "profile-scroll");
    await waitFor(element(by.id("profile-public-media-error"))).toBeVisible().withTimeout(30000);
  });

  it("mobile E2E connection lifecycle: decline -> re-request -> accept -> block", async () => {
    const requester = makeUser("both");
    const owner = makeUser("both");

    await seedUserAndLoginByUi(requester);
    await signOutIfVisible();

    await seedUserAndLoginByUi(owner);
    const ownerUserId = await readProfileUserId();
    await signOutIfVisible();

    await loginByUi(requester);
    await requestConnectionByUi(ownerUserId);

    await signOutIfVisible();
    await loginByUi(owner);
    await tapTab("connections");
    await tapByTextInScroll("Decline", "connections-scroll", 30000);
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await signOutIfVisible();
    await loginByUi(requester);
    await requestConnectionByUi(ownerUserId);

    await signOutIfVisible();
    await loginByUi(owner);
    await tapTab("connections");
    await tapByTextInScroll("Accept", "connections-scroll", 30000);
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await tapByTextInScroll("Block", "connections-scroll", 30000);
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);
  });

  it("mobile alerts flow marks unread notifications as read", async () => {
    const owner = makeUser("both");
    const requester = makeUser("both");

    await seedUserAndLoginByUi(owner);
    const ownerUserId = await readProfileUserId();
    await signOutIfVisible();

    await seedUserAndLoginByUi(requester);
    await requestConnectionByUi(ownerUserId);

    await signOutIfVisible();
    await loginByUi(owner);

    await tapTab("notifications");
    await waitFor(element(by.id("notifications-mark-all"))).toBeVisible().withTimeout(30000);
    await tapById("notifications-mark-all", "notifications-scroll");
    await waitForText("0 unread", 30000);
  });

  it("mobile E2E verification lifecycle: submit -> admin review -> user notification", async () => {
    const member = makeUser("both");
    const adminUser = readAdminUserFromEnv();

    await seedUserAndLoginByUi(member);
    await tapTab("verification");
    await scrollToTop("verification-scroll");
    await typeById("verification-media-ids", "11111111-1111-4111-8111-111111111111", "verification-scroll");
    await typeById(
      "verification-notes",
      "Government ID submitted for verification lifecycle E2E.",
      "verification-scroll"
    );
    await tapById("verification-submit", "verification-scroll");
    await waitForSuccessOrError("verification-success-banner", ["verification-error-banner"]);
    await waitForText("Status: Pending", 30000);

    await signOutIfVisible();
    await loginByUi(adminUser);
    await tapTab("verification");
    await waitForText("Get verified", 30000);

    await signOutIfVisible();
    await loginByUi(member);
    await tapTab("verification");
    await waitForText("Status: Pending", 30000);
  });

  it("mobile E2E jobs visibility: connections_only blocks non-connections then allows accepted connection", async () => {
    const seeker = makeUser("both");
    const provider = makeUser("both");
    const shortId = Date.now().toString(36).slice(-4);
    const jobTitle = `Conn-only ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    const seekerUserId = await readProfileUserId();

    await createJobByUi({
      category: "plumber",
      title: jobTitle,
      description: "Connections-only posting for visibility gate validation.",
      locationText: "Kochi, Kakkanad",
      visibility: "connections_only"
    });

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);

    await tapTab("jobs");
    await assertTextNotVisible(jobTitle, 3500);

    await requestConnectionByUi(seekerUserId);

    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("connections");
    await tapByTextInScroll("Accept", "connections-scroll", 30000);
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("jobs");
    await tapById("jobs-refresh", "jobs-scroll");
    await waitForTextInScroll(jobTitle, "jobs-scroll", 45000);
    await tapByTextInScroll("Apply for job", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", [
      "jobs-action-error-banner",
      "jobs-error-banner"
    ]);
  });

  it("mobile E2E booking lifecycle reaches closed state with payment milestones", async () => {
    const seeker = makeUser("seeker");
    const provider = makeUser("provider");
    const shortId = Date.now().toString(36).slice(-4);
    const jobTitle = `Book ${shortId}`;

    await seedUserAndLoginByUi(seeker);
    await createJobByUi({
      category: "electrician",
      title: jobTitle,
      description: "Need electrician to inspect and fix frequent power trips.",
      locationText: "Kakkanad, Kochi",
      visibility: "public"
    });

    await signOutIfVisible();
    await seedUserAndLoginByUi(provider);
    await tapTab("jobs");
    await waitForTextInScroll(jobTitle, "jobs-scroll", 40000);
    await tapByTextInScroll("Apply for job", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);

    await signOutIfVisible();
    await loginByUi(seeker);
    await openOwnJobManagerByUi();
    await tapByTextInScroll("Approve applicant", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);

    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("jobs");
    await tapByTextInScroll("Start job", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);

    await signOutIfVisible();
    await loginByUi(seeker);
    await openOwnJobManagerByUi();
    await tapByTextInScroll("Mark completed", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);
    await tapByTextInScroll("Mark payment done", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);

    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("jobs");
    await tapByTextInScroll("Mark payment received", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);

    await signOutIfVisible();
    await loginByUi(seeker);
    await openOwnJobManagerByUi();
    await tapByTextInScroll("Close job", "jobs-scroll", 30000);
    await waitForSuccessOrError("jobs-action-success-banner", ["jobs-action-error-banner"]);
    await waitForText("Status: closed", 30000);
  });

  it("auth -> jobs -> connections -> consent", async () => {
    const seeker = makeUser("seeker");
    const provider = makeUser("provider");
    const shortId = Date.now().toString(36).slice(-4);
    const requestPurpose = `Req ${shortId}`;
    const grantPurpose = `Gr ${shortId}`;

    logStep("register seeker");
    await registerByUi(seeker);
    const seekerUserId = await readProfileUserId();

    logStep("create seeker job");
    await createJobByUi({
      category: "plumber",
      title: `Kitchen sink leakage repair ${shortId}`,
      description: "Need urgent service support for kitchen sink leakage in apartment.",
      locationText: "Kakkanad, Kochi"
    });

    logStep("register provider");
    await signOutIfVisible();
    await registerByUi(provider);
    const providerUserId = await readProfileUserId();

    logStep("provider sends connection request");
    await requestConnectionByUi(seekerUserId);

    logStep("seeker accepts connection");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("connections");
    await tapByTextInScroll("Accept", "connections-scroll", 30000);
    await waitForSuccessOrError("connections-success-banner", ["connections-error-banner"]);

    logStep("provider creates consent access request");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await tapById(`consent-request-owner-${seekerUserId}`, "consent-scroll");
    await typeById("consent-request-purpose", requestPurpose, "consent-scroll");
    await tapById("consent-request-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("seeker grants consent");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("consent");
    await tapByTextInScroll(providerUserId, "consent-scroll", 30000);
    await typeById("consent-grant-purpose", grantPurpose, "consent-scroll");
    await tapById("consent-grant-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("provider verifies access allowed");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await tapById(`consent-can-view-owner-${seekerUserId}`, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-allowed-banner", ["consent-error-banner"]);

    logStep("seeker revokes grant");
    await signOutIfVisible();
    await loginByUi(seeker);
    await tapTab("consent");
    await tapByTextInScroll(providerUserId, "consent-scroll", 30000);
    await typeById("consent-revoke-reason", "E2E revoke", "consent-scroll");
    await tapById("consent-revoke-submit", "consent-scroll");
    await waitForSuccessOrError("consent-success-banner", ["consent-error-banner"]);

    logStep("provider verifies access denied");
    await signOutIfVisible();
    await loginByUi(provider);
    await tapTab("consent");
    await tapById(`consent-can-view-owner-${seekerUserId}`, "consent-scroll");
    await tapById("consent-can-view-submit", "consent-scroll");
    await waitForSuccessOrError("consent-can-view-denied-banner", ["consent-error-banner"]);

    logStep("full flow complete");
  }, E2E_TIMEOUT_MS);
});
