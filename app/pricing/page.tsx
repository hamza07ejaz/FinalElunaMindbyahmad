import type { Metadata } from "next";
import { SiteNav } from "../_components/landing/SiteNav";
import { PricingCards } from "../_components/landing/PricingCards";
import { Faq } from "../_components/landing/Faq";
import { Footer } from "../_components/landing/Footer";
import { getSettings } from "../../lib/settings";

/**
 * Rebuilt at most once a minute.
 *
 * Without this, the pricing page is rendered once when the site is built and
 * then served unchanged until the next deployment — so every edit in the
 * admin panel appeared to save and then did nothing at all. The panel says
 * changes are live in seconds, and for the dashboard they are; this page was
 * the exception, and a silent one.
 *
 * A minute is the backstop. Saving in the admin panel refreshes this page
 * immediately, so the wait only applies if something is changed another way.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Pricing — Eluna Mind",
  description: "Free to study with every day. A paid plan unlocks every tool and much higher daily limits.",
  // Relative, so it resolves against metadataBase and stays right on every
  // deployment — including preview URLs, which must not claim to be the real one.
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const { site } = await getSettings();

  return (
    <div className="relative">
      <SiteNav />
      <section className="relative overflow-hidden px-4 pb-20 pt-36 sm:px-6">
        <div className="aurora" />
        <div className="relative mx-auto mb-14 max-w-2xl text-center">
          <h1 className="page-enter text-4xl sm:text-5xl">Free to study with. Upgrade when exams get close.</h1>
          <p className="lede page-enter mx-auto mt-4">No trials that expire, no card to start. Upgrade the week you actually need it.</p>
        </div>
        <PricingCards />
      </section>
      <section className="px-4 pb-24 sm:px-6"><Faq items={site.faq.items} /></section>
      <Footer />
    </div>
  );
}
