/**
 * Local verification: hang guests lose auth after revoke and after expiry.
 * Uses in-memory PGlite (no DATABASE_URL) via the app's sql helper.
 */
process.env.SESSION_COOKIE_SECRET ??=
  "verify-hang-kick-secret-do-not-use-in-prod";
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;

const { ensureDefaultCircle, getSessionVersion } = await import(
  "../src/lib/group.ts"
);
const { createPlan, updatePlan } = await import("../src/lib/plans.ts");
const {
  createPlanGuestInvite,
  redeemHangCode,
  revokePlanGuestInvite,
  hangGuestAccessStillValid,
} = await import("../src/lib/plan-guest-invites.ts");
const { FOUNDER_ID, guestCookieHeader, readGuestSession } = await import(
  "../src/lib/guest.ts"
);
const { optionalViewer } = await import("../src/lib/auth.ts");
const { sql } = await import("../src/lib/db.ts");

await ensureDefaultCircle();
await sql(
  `insert into profiles (id, email, display_name)
   values ($1, '', 'Host')
   on conflict (id) do update set display_name = excluded.display_name`,
  [FOUNDER_ID],
);
await sql(
  `insert into circle_members (circle_id, user_id, role)
   values ('circle_default', $1, 'founder')
   on conflict (circle_id, user_id) do update set role = 'founder'`,
  [FOUNDER_ID],
);

const starts = new Date(Date.now() + 60_000).toISOString();
const ends = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
const plan = await createPlan({
  creatorId: FOUNDER_ID,
  title: "Hang kick verify",
  startsAt: starts,
  endsAt: ends,
  audience: "guest",
});

const created = await createPlanGuestInvite({
  planId: plan.id,
  createdBy: FOUNDER_ID,
});
if (!created.ok) throw new Error(`create invite failed: ${created.error}`);
const code = created.invite.token;

const redeemed = await redeemHangCode("Guesty", code);
if (!redeemed.ok) throw new Error(`redeem failed: ${redeemed.error}`);

const cookie = guestCookieHeader(redeemed.userId, redeemed.sessionVersion);
const requestFromCookie = (cookieHeader) =>
  new Request("http://127.0.0.1/api/me", {
    headers: { cookie: cookieHeader },
  });

const before = await optionalViewer(requestFromCookie(cookie));
if (!before || before.sub !== redeemed.userId) {
  throw new Error("expected active hang guest before revoke");
}
if (!(await hangGuestAccessStillValid(redeemed.userId))) {
  throw new Error("hangGuestAccessStillValid should be true before revoke");
}

const revoked = await revokePlanGuestInvite({
  planId: plan.id,
  inviteId: created.invite.id,
});
if (!revoked.ok) throw new Error("revoke failed");

const versionAfter = await getSessionVersion(redeemed.userId);
if (versionAfter === redeemed.sessionVersion) {
  throw new Error("expected session_version bump on revoke");
}
if (await hangGuestAccessStillValid(redeemed.userId)) {
  throw new Error("hangGuestAccessStillValid should be false after revoke");
}
const afterRevoke = await optionalViewer(requestFromCookie(cookie));
if (afterRevoke) throw new Error("viewer must be null after revoke");

// Fresh hang for expiry path
const plan2 = await createPlan({
  creatorId: FOUNDER_ID,
  title: "Hang expire verify",
  startsAt: starts,
  endsAt: ends,
  audience: "guest",
});
const created2 = await createPlanGuestInvite({
  planId: plan2.id,
  createdBy: FOUNDER_ID,
});
if (!created2.ok) throw new Error(`create2 failed: ${created2.error}`);
const redeemed2 = await redeemHangCode("Expiring", created2.invite.token);
if (!redeemed2.ok) throw new Error(`redeem2 failed: ${redeemed2.error}`);
const cookie2 = guestCookieHeader(redeemed2.userId, redeemed2.sessionVersion);
const mid = await optionalViewer(requestFromCookie(cookie2));
if (!mid) throw new Error("expected active guest before expiry");

await updatePlan(plan2.id, {
  endsAt: new Date(Date.now() - 1000).toISOString(),
});
if (await hangGuestAccessStillValid(redeemed2.userId)) {
  throw new Error("hangGuestAccessStillValid should be false after expiry");
}
const afterExpire = await optionalViewer(requestFromCookie(cookie2));
if (afterExpire) throw new Error("viewer must be null after hang expiry");

// Cookie still parses HMAC-wise, but auth rejects it
const parsed = readGuestSession(requestFromCookie(cookie2));
if (!parsed) throw new Error("cookie should still be HMAC-valid for this test");

console.log("verify-hang-kick: ok (revoke + expiry invalidate active sessions)");
