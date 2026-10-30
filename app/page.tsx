import type { Metadata } from "next";
import { getSettings } from "../lib/settings";
import { siteUrl } from "../lib/site";
import { JsonLd, faqPage, organisation } from "./_components/JsonLd";
import { SiteNav } from "./_components/landing/SiteNav";
import { Hero } from "./_components/landing/Hero";
import { CtaBand, Features, HowItWorks, Marquee, ProofStrip, SectionHead, Seam } from "./_components/landing/Sections";
import { PricingCards } from "./_components/landing/PricingCards";
import { Faq } from "./_components/landing/Faq";
import { Demo } from "./_components/landing/Demo";
import { Footer } from "./_components/landing/Footer";
import { SiteBot } from "./_components/landing/SiteBot";

/**
 * Title, description and the social card all come from the root layout, which
 * reads them from the admin panel. Only the canonical is stated here, because
 * the layout deliberately no longer sets one for the whole site.
 */
/**
 * Rebuilt at most once a minute.
 *
 * Without this, the landing page is rendered once when the site is built and
 * then served unchanged until the next deployment — so every edit in the
 * admin panel appeared to save and then did nothing at all. The panel says
 * changes are live in seconds, and for the dashboard they are; this page was
 * the exception, and a silent one.
 *
 * A minute is the backstop. Saving in the admin panel refreshes this page
 * immediately, so the wait only applies if something is changed another way.
 */
export const revalidate = 60;

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Landing() {
  const { site, branding } = await getSettings();
  const { show } = site;

  // Only mark up the FAQ when the FAQ is actually on the page — claiming
  // questions a visitor cannot see is a manual-action offence, not a shortcut.
  const base = siteUrl();
  const schema = [
    ...organisation(base, branding.siteName, branding.tagline, branding.logoUrl),
    ...(show.faq ? [faqPage(site.faq.items)].filter(Boolean) as Record<string, unknown>[] : []),
  ];

  return (
    <div className="relative">
      <JsonLd data={schema} />
      <SiteNav />

      <main id="main">
        <Hero c={site.hero} />

        {show.marquee && <Marquee items={site.marquee} />}
        {show.proof && <ProofStrip label={site.proof.label} items={site.proof.items} />}

        {show.features && (
          <>
            <Seam />
            <Features intro={site.features} items={site.features.items} />
          </>
        )}

        {show.how && (
          <>
            <Seam />
            {/* Shown above the steps, so the page demonstrates before it explains. */}
            <Demo videoUrl={site.demo.videoUrl} poster={site.demo.poster} caption={site.demo.caption} />
            <HowItWorks intro={site.how} items={site.how.items} />
          </>
        )}

        {show.pricing && (
          <>
            <Seam />
            <section id="pricing" className="scroll-mt-28 px-4 py-24 sm:px-6">
              <div className="mx-auto max-w-6xl">
                <SectionHead intro={site.pricing} center />
                <PricingCards />
              </div>
            </section>
          </>
        )}

        {show.faq && (
          <>
            <Seam />
            <section id="faq" className="scroll-mt-28 px-4 pb-14 pt-24 sm:px-6">
              <div className="mx-auto max-w-6xl">
                <SectionHead intro={site.faq} center />
                <Faq items={site.faq.items} />
              </div>
            </section>
          </>
        )}

        <CtaBand title={site.cta.title} sub={site.cta.sub} button={site.cta.button} />
      </main>

      <Footer />
      {show.bot && (
        <SiteBot
          name={site.bot.name}
          greeting={site.bot.greeting}
          siteName={branding.siteName}
          /*
           * What it says as each section arrives. Built from the sections that
           * are actually switched on, so a site with the pricing block hidden
           * does not have its assistant announce pricing to an empty page.
           */
          stops={[
            show.features && { id: "features", text: "These are the tools. Each one works on whatever you upload \u2014 your own notes, not a textbook someone else wrote." },
            show.how && { id: "how", text: "Three steps, and the first one is just dragging in a file. Nothing to install." },
            show.pricing && { id: "pricing", text: "The free plan refills every day. The paid plans are for exam weeks, when the daily limits stop being enough." },
            show.faq && { id: "faq", text: "The questions people actually ask before signing up. Mine is here too if yours is not." },
          ].filter(Boolean) as { id: string; text: string }[]}
        />
      )}
    </div>
  );
}
