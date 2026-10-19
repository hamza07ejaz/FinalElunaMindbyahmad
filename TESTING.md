# Testing

Two halves. The first is automated and has already been run. The second needs a
real Supabase session, so it has to be run on your own deployment — it is written
as a checklist you can work through in about twenty minutes.

---

## What was tested automatically, and what it found

Ten signed-out routes at five widths (320, 390, 768, 1024, 1440), with the
database deliberately unreachable so every page was also tested in its
"database down" state. Then every API route probed with no session, and the
landing page on throttled connections.

**Started at 94 findings. Ends at 3**, all of them harmless: two are Next.js
prefetching `/dashboard` (which redirects, so the prefetch aborts) and one is the
404 page's own expected 404.

### The real bugs it found

**Every 404 page was completely unstyled.** Not a flash — permanently. Times New
Roman, default-blue links, white background. When `notFound()` is reached, Next
renders the not-found boundary inside its own error document: a different `<html>`
that never includes the root layout, and so never includes the stylesheet.
Importing `globals.css` into the component did not help, and neither did adding a
`not-found.tsx` per segment. The 404 page now carries its own styles inline and
uses no shared components, which makes it the one page that looks right with no
build output behind it — the right property for the page people see when
something has already gone wrong.

**`/api/client-error` returned 500 on every malformed report.** It answered with
`NextResponse.json({...}, { status: 204 })`, and a 204 may not carry a body, so the
runtime threw. That is the endpoint that receives browser crashes, so client-side
errors were being dropped and nothing said so — a failure to report an error is
invisible by nature. It returns 202 now, and the database write is wrapped so this
endpoint can never be the thing that fails.

**Long links and tokens in AI answers were silently cut off.** `html` clips
horizontally, which stops a stray wide element scrolling the page sideways but
also means anything too wide is truncated with no scrollbar. A URL has no space or
hyphen to break at, so the middle of it simply disappeared and a student copying it
got a broken link. Also affected a user's own chat message containing one long
word. Fixed with `overflow-wrap: break-word`; tables and code blocks are left
alone, because they scroll inside their own box, which is correct for a wide table
and essential for code.

**Tap targets.** Footer links were 17px tall, the hero's output dots were 6×6,
and several login links were 16-20px. The floor is 24px. All raised, with padding
rather than by changing how anything looks.

**Heading levels skipped** from `h1` to `h3` in the footer and on the pricing
cards, which leaves anyone navigating by headings wondering what they missed.

### What was already right

No horizontal overflow at any width. No JavaScript errors. No broken images. No
contrast failures — every colour meets AA. Every protected API route refuses a
signed-out request with a 401 or 403 and a readable message; none crash, none leak
a key, a path or a stack trace. The landing page is 221 KB over 11 requests and
its headline is readable in about a second on 3G, two on 2G, even though a full
load takes longer.

### A note on the method

Two of the first run's "findings" were my own checker being wrong: it could not
read `oklab()` colours, which Tailwind 4 emits, and it treated a gradient button
as having no background, so dark text on a bright gradient read as dark on dark.
Both were fixed before anything was changed in the app. A test you have not
checked is a rumour.

---

## What you have to run yourself

These need a real logged-in session, which means your own Supabase. Use a
**second, non-admin account** — an admin sees Premium tools regardless, so testing
as one proves nothing about what a real user gets.

### Before you start
- [ ] `/diagnose` says `Everything looks right.`
- [ ] Admin → AI keys shows at least one key, and **Test** passes
- [ ] Admin → Payments shows either "Ready, in Stripe test mode" or "Taking real payments"

### Signing up
- [ ] Create a new account. The confirmation email arrives, and it is the branded
      one, not Supabase's default
- [ ] The logo in that email loads (if it is broken, **Site URL** in Supabase →
      Authentication → URL Configuration is wrong)
- [ ] Confirm, log in, land on the dashboard
- [ ] Password reset: request one, follow the link, set a new password, log in with it

### The tools, on the free plan
Run each one once and check the answer is real, not a fallback:
- [ ] **Chat** — ask something, watch it stream in. Press **Stop** mid-answer; the
      partial answer stays
- [ ] **Chat** — ask for a formula. It renders as maths, not as `x^2`
- [ ] **Chat** — paste a long URL into your question. Your own message wraps and
      nothing is cut off
- [ ] **Notes**, **Q&A**, **Study Planner**, **Career Guide** — each returns
      something specific to what you typed
- [ ] **Career Guide → 12-month plan** — four phases, each with a milestone, and
      the pay figures carry a region and a caveat
- [ ] **My Files** — upload a PDF, press **Ask**, confirm the answer uses the file
- [ ] **Transcripts** — upload a short voice note, get a transcript *and* notes
- [ ] **Translate**, **Listen** on a chat answer
- [ ] Premium tools (**Flashcards**, **Tests**, **Mind Maps**, **Slides**,
      **Grammar**, **Paraphrase**, **Citations**, **Humanize**) show the locked
      panel, not an error

### Limits and the states people actually hit
- [ ] Use Notes until the daily limit is reached. The message names the tool and
      offers the upgrade
- [ ] The usage chip counts down correctly and resets the next day
- [ ] Switch AI off in Admin → Branding & site. Every tool says AI is paused, and
      none of them hang
- [ ] Turn it back on
- [ ] Upload a 30 MB file — it is refused with a message that says the limit
- [ ] Upload a renamed `.exe` as `.pdf` — refused

### Paying
- [ ] Upgrade with Stripe's test card `4242 4242 4242 4242`
- [ ] **The account shows Premium afterwards.** If it does not, the webhook is the
      problem — `/diagnose` will say so
- [ ] Premium tools unlock
- [ ] Account → Manage billing opens Stripe's portal
- [ ] Cancel there; the app shows "cancels on …" and Premium keeps working until
      then
- [ ] Decline card `4000 0000 0000 0002` — the failure is handled, no Premium

### On a phone, for real
Not the browser's device mode — an actual phone, because that is where the
keyboard, the scroll and the tap targets behave differently.
- [ ] Sign up, chat, upload a photo of a page of notes, ask about it
- [ ] The chat input is not hidden by the keyboard
- [ ] The sidebar opens and closes
- [ ] Nothing scrolls sideways on any screen

### Admin
- [ ] Make a second account a sub-admin. They see Overview, Support, Users and
      Blog — **not** Plans & limits, Branding or Activity log
- [ ] Suspend an account. That user is signed out and told why
- [ ] A support ticket from a user reaches Admin → Support inbox, and the reply
      reaches the user
- [ ] Admin → Errors shows something after you deliberately break an AI key

### The things worth breaking on purpose
- [ ] Open a dead link such as `/does-not-exist` — a branded 404, not a bare page
- [ ] Open `/blog/nothing-here` — the same
- [ ] Turn wifi off mid-answer — the chat says the connection went quiet rather
      than spinning forever
- [ ] Remove the AI key and try a tool — it says an admin needs to add one

---

## Running the automated pass again

The scripts live outside the repo and are rebuilt per run; the thing to keep is
the method. On any deployment:

1. Build and serve it with the database unreachable, which tests every fallback
   at the same time as the layout.
2. Visit every signed-out route at 320, 390, 768, 1024 and 1440, checking for
   horizontal overflow, thrown exceptions, images that did not load, inputs with
   no label, headings that skip a level, tap targets under 24px and contrast
   below AA.
3. Probe every API route with no session and assert each returns 401 or 403 with a
   message — never a 500, never data, never a stack trace.
4. Load the landing page on a throttled connection and check the headline is
   readable before the page has finished loading.
