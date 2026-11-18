-- Hang invites are 4-digit numeric codes (entered on guest sign-in), not URL tokens.
-- Revoke any legacy URL-style tokens from the short-lived hang-link experiment.

update plan_guest_invites
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null
  and token !~ '^[0-9]{4}$';
