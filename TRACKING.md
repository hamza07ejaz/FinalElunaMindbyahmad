# Conversion tracking — what is built and what is yours to configure

Everything below is implemented and tested. The parts that need a Google or
Meta account are listed at the end, because they cannot be done from the code.

---

## What to switch on

**Admin → Branding & site → Google**

| Field | What it does |
|---|---|
| Tag Manager container | `GTM-XXXXXXX`. The container loads on every page, public and signed-in. |
| Google Analytics measurement ID | `G-XXXXXXXXXX`. **Only used when there is no container.** |
| Ask for consent before tracking | Holds every tag until the visitor answers. See *Consent* below. |
| Search Console verification | Paste the whole `<meta>` tag; the token is taken out of it. |

**The two analytics fields are mutually exclusive by design.** With a container
set, the measurement ID is kept but not loaded directly — otherwise a container
that also configures GA4 would report every page twice, and the numbers look
believable the whole time. Configure GA4 inside the container.

Run `supabase/014_conversions.sql` in the Supabase SQL editor before the first
real payment, or purchases cannot be reported. Running the whole
`RUN-THIS-IN-SUPABASE.sql` again does it too and is safe.

---

## The events

All six push to `dataLayer`. Trigger on the event name; every parameter below
is available as a Data Layer Variable.

| Event | Fires when | Parameters |
|---|---|---|
| `sign_up` | an account is created | `method`: `password` \| `google` |
| `login` | a session starts | `method` |
| `file_upload` | a file uploaded **and was readable** | `file_kind`, `size_bucket` |
| `ai_action_complete` | a study tool returned a result | `tool` (e.g. `notes`) |
| `begin_checkout` | the Stripe redirect is about to happen | `value`, `currency`, `items` |
| `purchase` | **Stripe has confirmed payment** | `transaction_id`, `value`, `currency`, `items` |

A few of these are worth knowing precisely:

**`file_upload` fires on success, not on selection.** A file that uploads and
then cannot be read does not count.

**`sign_up` versus `login` for Google.** Google returns the same thing either
way. The server decides, by whether the account was created moments ago, and
tells the page which to fire. Without that, every returning student would be
counted as a new registration.

**`purchase` is not fired by the success page.** The success page is just a
URL: refreshing it, pressing back, or opening it on a phone would each report
another sale. Instead the Stripe webhook writes the confirmed payment down,
and the browser asks the server whether there is one to report. The server
hands it over and marks it reported in the same database statement, so the
second asker — another tab, another device, a reload a week later — gets
nothing. The id is Stripe's checkout session id, so a webhook Stripe retries
cannot create a second one either.

`value` and `currency` come from Stripe, not from the front end, so they stay
right when the price changes.

---

## What is deliberately not sent

No parameter carries anything about a student or their work. Not the email,
not the user id, not the file name, not the topic typed into a tool, not a
prompt, not an answer, not the contents of an upload.

This is enforced rather than agreed: `lib/analytics.ts` holds an allowlist of
parameter names, and anything not on it is dropped before it reaches
`dataLayer`. A future developer who passes `file_name` gets no error and no
event parameter — the key simply does not arrive. Tests cover every name on
the refused list.

Two of those exclusions matter more than they look. A study file's name is
very often the student's real name and their assignment title. And the topic
someone types into a study tool is, quite often, the thing they are failing.

**Please keep tags inside the container to these parameters.** A Custom HTML
tag reading the URL, the page title or a form field can reach around this.

---

## Consent

Consent Mode v2 is implemented. The defaults are set before any tag exists,
because Google reads them as a tag initialises — a command sent afterwards has
already missed its only chance to deny anything.

With **Ask for consent** off, all four signals default to granted. Appropriate
for a Pakistan-only audience, and still better than saying nothing, since
Google treats an explicit grant differently from a page that never mentions
consent.

With it on, `ad_storage`, `ad_user_data`, `ad_personalization` and
`analytics_storage` default to **denied**, `ads_data_redaction` is on, tags
wait 1.5 seconds for an answer, and a bar offers Accept or Decline. The choice
is remembered and re-applied on each page load. Declining is a real decline.

**Turn this on before running ads to the EU or the UK.**

---

## Content Security Policy

The site sends a strict CSP, and a blocked tag fails silently — the first
anyone would know is a campaign reporting no conversions a fortnight later. So
the following are already allowed: `googletagmanager.com`,
`google-analytics.com`, `googleadservices.com`, `doubleclick.net`,
`googletagservices.com`, `connect.facebook.net`, `facebook.com`,
`graph.facebook.com`, and `tagassistant.google.com` for preview mode.

**One limit to design around:** `'unsafe-eval'` is not allowed. Most tags are
fine. A Custom HTML tag that builds code from a string at runtime will not
run. Use the built-in tag templates, or tell us what is needed and we will
look at it specifically — we would rather not weaken the policy for the whole
site by default.

---

## Search Console

`/sitemap.xml` and `/robots.txt` are live, and the sitemap lists only pages
that render for a signed-out visitor. Dashboard and tool routes are excluded
on purpose: they redirect to a login screen, and a sitemap full of redirects
is reported as an error.

To verify: Search Console → Add property → **Domain** (DNS) is best now that
the domain is on its own nameservers, and covers `www` and every subdomain at
once. The **URL prefix → HTML tag** method also works — paste the tag into
Admin → Branding & site. Then submit `sitemap.xml` under Sitemaps.

---

## Access

Account access cannot be granted from the codebase. GTM, GA4, Google Ads and
Search Console permissions are managed in those products, by whoever owns the
properties. Tell us which email addresses to add and at what level and we will
do it — or, if you would rather own the properties, create them and send the
container ID and measurement ID to put in the admin panel.

---

## Checking it works

1. Admin → Branding & site → paste the container ID → Save. Live in about ten
   seconds; no deployment needed.
2. GTM → Preview → the site URL. Tag Assistant is already allowed by the CSP.
3. Sign up, log in, upload a file, run any study tool, start a checkout — each
   should appear in the Preview data layer.
4. For `purchase`, use a Stripe **test** key and card `4242 4242 4242 4242`.
   Watch it fire once on the success page, then reload: it must not fire again.
   That is the behaviour to check, and the one most easily got wrong.
