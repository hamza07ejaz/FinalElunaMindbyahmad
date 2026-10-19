import { supabaseAdmin } from "./supabase/admin";

/**
 * Standalone pages: privacy, terms, cookies, refunds, and anything else the
 * admin adds. Bodies are markdown held in the database so they can be rewritten
 * without a deploy — which matters most for exactly these pages, since they
 * change when the business does.
 */

export type SitePage = {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
  published: boolean;
  required: boolean;
  sort: number;
};

export const REQUIRED_SLUGS = ["privacy", "terms", "cookies", "refunds"] as const;

/**
 * Starter bodies.
 *
 * These are a structure to fill in, not legal advice and not a policy anyone
 * has reviewed. Every spot that needs a real answer is marked, so an unfinished
 * page is obvious on sight rather than quietly shipping as if it were done.
 */
export const STARTER_BODIES: Record<string, string> = {
  privacy: `> **Not finished.** Replace every \`[...]\` below with your own details, then delete this line. Have a lawyer check it before you take payments.

Last updated: [date]

## Who we are
[Company or trading name] ("we") runs [site name]. You can reach us at [support email]. [If you have a registered address, put it here — the UK and EU both expect one.]

## What we collect
- **Your account:** email address and password (stored hashed by our authentication provider, never in plain text).
- **What you upload:** files, images and recordings you choose to send us, and the text taken from them.
- **What you create:** chats, notes, mind maps, decks, transcripts and practice tests.
- **How you use it:** daily feature counts, and error reports when something breaks.
- **Payments:** handled by Stripe. We never see or store your card number.

## Why we can use it
[Pick the basis that applies to you — for the UK and EU this is usually "performance of a contract" for the service itself, "legitimate interests" for security and fraud prevention, and "consent" for marketing.]

## Who we share it with
We do not sell your data. We share it only with the services that make the product work:
- [Supabase] — database, authentication and file storage. [Region]
- [Stripe] — payments.
- [OpenAI / Google] — processes the text of your questions and files to generate answers. [Say whether your provider trains on it. On the OpenAI API, business data is not used for training by default.]
- [Netlify] — hosting.

## Where your data lives
[Name the regions. If data leaves the UK/EU, say which safeguard you rely on — usually Standard Contractual Clauses.]

## How long we keep it
Your account data stays until you delete it or ask us to. Deleting a file removes both the file and the text taken from it. [Say what happens after an account is closed.]

## Your rights
You can ask for a copy of your data, correct it, delete it, or object to how we use it. Email [support email] and we will reply within [30] days. [UK/EU users can also complain to their data protection authority.]

## Children
This service is not intended for anyone under [16]. [Say what you do if you learn a child has signed up.]

## Changes
If we change this policy we will update the date above and [say how you will tell people].`,

  terms: `> **Not finished.** Replace every \`[...]\` below with your own details, then delete this line. Have a lawyer check it before you take payments.

Last updated: [date]

## The agreement
By creating an account you agree to these terms. If you do not agree, do not use the service.

## What the service is
[Site name] is an AI study assistant. It explains material, generates notes, maps, tests and transcripts, and works from files you upload.

**What it is not.** It is a study aid, not a substitute for your own work. It makes mistakes — about facts, numbers, citations and translations. Check anything that matters.

## Academic integrity
You are responsible for following your school's or university's rules. Submitting AI-generated text as your own writing breaks most academic integrity policies. We do not help anyone conceal that AI was used, and we are not responsible for the consequences if you do.

## Your account
One account per person. Keep your password to yourself. Tell us at [support email] if you think someone else is using it.

## What you may not do
- Upload anything you do not have the right to upload.
- Upload illegal material, or anything that breaks someone else's copyright.
- Try to get around the usage limits, or run the service automatically at scale.
- Resell access, or use the output to build a competing service.
- Use it to produce material that harms other people.

We can suspend an account that does any of this. [Say whether you refund in that case.]

## Your content
What you upload stays yours. You give us permission to process it only to provide the service. What the AI generates for you is yours to use, subject to the integrity section above.

## Plans and payment
The free plan has daily limits and costs nothing. Premium costs [price] per [period], charged by Stripe. [If you offer a trial: say the length, that a card is taken, and that it converts to a paid plan unless cancelled.]

Cancel any time from your account page. You keep access until the end of the period you have paid for. See the Refund Policy for refunds.

## Limits of liability
The service is provided as it is. [Your jurisdiction's wording goes here — typically limiting liability to the amount paid in the previous 12 months, while not excluding liability for death, personal injury or fraud, which most jurisdictions do not allow you to exclude.]

## Ending the agreement
You can delete your account at any time. We can close an account that breaks these terms, with notice where it is reasonable to give it.

## Governing law
These terms are governed by the law of [country]. Disputes go to the courts of [place].

## Contact
[support email]`,

  cookies: `> **Not finished.** Check this against the cookies your site actually sets before publishing.

Last updated: [date]

## What we use
We keep this short because we do not run advertising.

**Strictly necessary.** Sign-in cookies set by our authentication provider, which keep you logged in between pages. The site does not work without them, so they are not optional.

**Preferences.** Small values stored in your browser, such as which tab you last had open. They never leave your device.

[**Analytics.** If you add analytics, name the tool here, say what it collects, and whether it sets cookies. If you use a cookie banner, say so.]

[**Payments.** Stripe sets cookies on its own checkout pages for fraud prevention. Link to their policy.]

## Controlling them
You can clear or block cookies in your browser settings. Blocking the necessary ones will sign you out and keep you out.

## Contact
[support email]`,

  refunds: `> **Not finished.** Set the actual numbers before you take payments. UK and EU consumers have statutory cancellation rights that this page cannot take away.

Last updated: [date]

## Free plan
Costs nothing, so there is nothing to refund. It does not expire.

## Trials
[If your trial takes a card: say so plainly, say the length, and say that cancelling before it ends means no charge.] Cancel from your account page at any time during the trial and you pay nothing.

## Subscriptions
If you cancel, your plan stays active until the end of the period you have already paid for, then stops. We do not charge again after that.

**Refunds.** [State your policy, for example: a full refund within 14 days of the first payment if you have barely used it. Say how "barely used" is measured so it is not a judgement call.]

[**UK and EU consumers:** you have a statutory 14-day right to cancel a distance contract. Where you asked for the service to start immediately, we may charge for what you used in that period. Say how that is calculated.]

## Payments that fail
If a payment fails, Stripe retries it. If it keeps failing, the account moves back to the free plan. Nothing is lost — your chats, notes and files stay where they are.

## Something went wrong
If the service was broken and you paid for it, tell us at [support email] and we will sort it out. Open a support ticket from inside the app and we can see your account while we answer.

## How to ask
[support email], or Help & support inside the app. We reply within [2 working days].`,
};

const TITLES: Record<string, string> = {
  privacy: "Privacy Policy", terms: "Terms of Service",
  cookies: "Cookie Policy", refunds: "Refund Policy",
};

/** The four pages that must exist, served from code when the database cannot be reached. */
function fallbackPage(slug: string): SitePage | null {
  if (!(REQUIRED_SLUGS as readonly string[]).includes(slug)) return null;
  return {
    slug, title: TITLES[slug] ?? slug, body: STARTER_BODIES[slug] ?? "",
    updated_at: new Date().toISOString(), published: true, required: true, sort: 0,
  };
}

/** One page, by slug. Returns null for a missing or unpublished page. */
export async function getPage(slug: string): Promise<SitePage | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("site_pages").select("*").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);

    // Nothing stored yet (migration not run) but the slug is one of the four
    // the business needs: serve the starter rather than a 404. Stripe and the
    // app stores both check that these resolve.
    if (!data) return fallbackPage(slug);
    if (!data.published) return null;

    const page = data as SitePage;
    // An admin who has not written anything yet gets the starter, so the link
    // in the footer never leads to a blank page.
    return { ...page, body: page.body?.trim() ? page.body : STARTER_BODIES[slug] ?? "" };
  } catch (err) {
    console.error("site page unavailable:", (err as Error)?.message);
    // A database hiccup must not take the privacy policy off the internet.
    return fallbackPage(slug);
  }
}

/** The published legal pages, for the footer. Never throws: the footer is on every page. */
export async function listLegalPages(): Promise<Pick<SitePage, "slug" | "title">[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("site_pages").select("slug,title").eq("published", true).order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch {
    // Before migration 009 has run there is no table. The four required pages
    // still resolve from code, so the footer still links to them.
    return REQUIRED_SLUGS.map((slug) => ({ slug, title: TITLES[slug] ?? slug }));
  }
}

/** Every page, published or not. Admin only. */
export async function listAllPages(): Promise<SitePage[]> {
  const { data, error } = await supabaseAdmin().from("site_pages").select("*").order("sort");
  if (error) throw new Error(error.message);
  return (data ?? []) as SitePage[];
}
