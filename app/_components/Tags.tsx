import Script from "next/script";

/**
 * Marketing tags.
 *
 * Three decisions are made here rather than left to whoever configures the
 * container, because each of them is the kind of thing that is discovered
 * weeks later in a report nobody can explain.
 *
 * GA4 is loaded directly OR through a tag manager, never both. A container
 * that configures GA4 while gtag.js is also on the page reports every visit
 * twice, and the numbers look plausible the whole time.
 *
 * Consent defaults are set before any tag exists, not after. Google reads the
 * default the moment a tag initialises, so a command that runs later has
 * already missed its only chance to deny anything.
 *
 * And none of it runs on a page nobody has configured: with no IDs saved,
 * this component renders nothing whatsoever — no script, no cookie, no
 * request to Google.
 */

export function Tags({
  gaId, gtmId, consentRequired,
}: { gaId: string; gtmId: string; consentRequired: boolean }) {
  if (!gaId && !gtmId) return null;

  // The container owns GA4 when there is a container. See above.
  const loadGaDirectly = !!gaId && !gtmId;

  return (
    <>
      {/*
        Consent defaults, first of everything.

        beforeInteractive puts this ahead of the container in the document, so
        the defaults are already in place when the first tag reads them. When
        consent is not required the same call grants everything, which is still
        better than silence: Google treats an explicit grant differently from a
        page that never mentioned consent at all.
      */}
      <Script id="consent-default" strategy="beforeInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  ad_storage:'${consentRequired ? "denied" : "granted"}',
  ad_user_data:'${consentRequired ? "denied" : "granted"}',
  ad_personalization:'${consentRequired ? "denied" : "granted"}',
  analytics_storage:'${consentRequired ? "denied" : "granted"}',
  functionality_storage:'granted',
  security_storage:'granted',
  wait_for_update: ${consentRequired ? 1500 : 0}
});
gtag('set','ads_data_redaction', ${consentRequired ? "true" : "false"});
      `}</Script>

      {gtmId && (
        <Script id="gtm" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
        `}</Script>
      )}

      {loadGaDirectly && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');
          `}</Script>
        </>
      )}
    </>
  );
}

/**
 * The <noscript> half of a tag manager install.
 *
 * Goes immediately after <body>. It does almost nothing in practice — a
 * visitor with JavaScript off cannot use this app anyway — but a container
 * check will report the install as incomplete without it, and the agency
 * running that check has no way to know the omission was deliberate.
 */
export function TagsNoScript({ gtmId }: { gtmId: string }) {
  if (!gtmId) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0" width="0" style={{ display: "none", visibility: "hidden" }}
        title="Tag Manager"
      />
    </noscript>
  );
}
