# The auth emails

Paste each file into the Supabase dashboard, under the heading shown.
Set the subject line there too — Supabase keeps it separate from the body.

| File | Where it goes | Subject line |
|---|---|---|
| `confirm-signup.html` | Authentication → Emails → Confirm signup | Confirm your email — Eluna Mind |
| `magic-link.html` | Authentication → Emails → Magic Link | Your sign-in link — Eluna Mind |
| `reset-password.html` | Authentication → Emails → Reset Password | Reset your password — Eluna Mind |
| `change-email.html` | Authentication → Emails → Change Email Address | Confirm your new email — Eluna Mind |
| `invite.html` | Authentication → Emails → Invite user | You have been invited to Eluna Mind |
| `reauthentication.html` | Authentication → Emails → Reauthentication | Your confirmation code — Eluna Mind |

## Before they work

The logo is loaded from `{{ .SiteURL }}/icon-192.png`, so **Site URL** in
Supabase → Authentication → URL Configuration has to be the real site address.
Point it at localhost and every email arrives with a broken image.

## The rate limit

Supabase's built-in sender allows only a couple of emails an hour — it is meant
for testing, not for customers. Add your own SMTP under
Project Settings → Authentication → SMTP Settings and the limit goes away,
and the mail arrives from your own domain instead of Supabase's.

## Changing them

Edit `build.mjs`, run `node build.mjs` in this folder, and paste the files in
again. Editing the HTML directly works too, but the six files will drift apart.
