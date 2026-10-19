# Admin panel — setup

## 1. Run the migration

Supabase → SQL Editor → New query → paste all of `supabase/003_admin.sql` → Run.
It is safe to run more than once.

## 2. Make yourself an admin

Same SQL editor, with your own signup email:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

If that says `UPDATE 0`, you have not signed up with that email yet. Sign up first, then run it.

## 3. Open the panel

Log in, then go to `/admin`. An "Admin panel" link also appears at the bottom of the app sidebar.
Anyone who is not an admin is sent back to `/dashboard`, and the admin APIs refuse them.

## What each page does

| Page | What you can change |
|---|---|
| Overview | Total users, premium count, active users, uses per day, which tools get used |
| Users | Search and filter, see each person's usage, change plan, block, reset usage, grant admin, add a private note |
| Plans & limits | Daily limits per tool, which tools are Premium, max input length, max AI tokens, and all the pricing-page wording |
| Branding & site | Site name, logo URL, support email, homepage headline, plus switches: pause AI, close sign-ups, hide blog, site-wide notice |
| Blog | Write, preview, publish and delete posts; they appear at /blog |
| Activity log | Every admin change, with who did it and when |

## Things worth knowing

- **Limits apply immediately.** Settings are cached for 10 seconds, so a change is live within
  about ten seconds, no deploy needed.
- **The price field is text only.** It changes what the pricing page says. The amount actually
  charged comes from your Stripe price, so change it in Stripe as well.
- **Changing someone's plan by hand does not touch Stripe.** If they have an active subscription,
  Stripe will still bill them and may set the plan back on its next webhook.
- **"Pause all AI" is the emergency switch.** Use it if OpenAI costs spike; the site stays up and
  every tool returns a polite "paused" message.
- **You cannot block yourself**, and you cannot remove your own admin access if you are the last admin.
- **Blocked users** are redirected to `/suspended` and see the reason you typed.
