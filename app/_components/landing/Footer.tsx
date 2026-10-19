import Link from "next/link";
import { Logo } from "../Logo";
import { listLegalPages } from "../../../lib/pages";
import { getSettings } from "../../../lib/settings";

export async function Footer() {
  const [{ branding, flags, site }, legal] = await Promise.all([getSettings(), listLegalPages()]);

  const product: [string, string][] = [
    ["Features", "/#features"], ["How it works", "/#how"], ["Pricing", "/pricing"],
    ...(flags.blogEnabled ? ([["Blog", "/blog"]] as [string, string][]) : []),
  ];
  const account: [string, string][] = [
    ["Log in", "/login"], ["Create account", "/login?mode=signup&next=/dashboard"], ["Dashboard", "/dashboard"],
  ];
  const legalLinks: [string, string][] = legal.map((p) => [p.title, `/${p.slug}`]);

  return (
    <footer className="border-t border-white/[0.07] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo logoUrl={branding.logoUrl} siteName={branding.siteName} />
            <p className="lede mt-4 max-w-xs text-sm">{branding.tagline}</p>
          </div>
          {([["Product", product], ["Account", account], ["Legal", legalLinks]] as const).map(([head, links]) =>
            links.length ? (
              <nav key={head} aria-label={head}>
                {/*
                  h2, not h3: these follow the page's h1, and jumping a level
                  leaves anyone navigating by headings wondering what they
                  missed. Visually identical — the size is set by the class.
                */}
                <h2 className="font-display text-sm font-semibold text-paper">{head}</h2>
                <ul className="mt-2 space-y-0.5">
                  {links.map(([l, h]) => (
                    <li key={h}>
                      {/*
                        The padding is the point. These links were 17px tall, and
                        a 17px target on a phone is a link you miss and hit the
                        one below. The inline-block plus vertical padding brings
                        them to 24, which is the accessibility floor, without
                        changing how the footer looks.
                      */}
                      <Link
                        href={h}
                        className="inline-block py-1.5 text-sm text-muted transition-colors hover:text-paper"
                      >{l}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null
          )}
        </div>

        <div className="seam-h my-10" />

        <div className="flex flex-col gap-4 text-sm text-muted lg:flex-row lg:items-center lg:justify-between">
          {/* The honest line about what this is. It belongs where people look
              for the small print, not buried in a policy page. */}
          <p className="max-w-xl leading-relaxed">{site.footerNote}</p>
          <div className="flex shrink-0 flex-col gap-1 lg:items-end">
            <a href={`mailto:${branding.supportEmail}`} className="-my-1 inline-block py-1 transition-colors hover:text-paper">{branding.supportEmail}</a>
            <p>© {new Date().getFullYear()} {branding.siteName}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
