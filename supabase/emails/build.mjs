/**
 * Builds the six auth emails Supabase sends.
 *
 * Generated from one layout rather than written six times, because the thing
 * that goes wrong with email templates is drift: the password reset gets fixed
 * and the magic link keeps the old footer for a year. Run `node build.mjs` in
 * this folder after changing anything here.
 *
 * Email is not the web. The rules this layout follows, all of them learned the
 * hard way by everyone who has ever sent one:
 *
 *   - Tables for layout. Outlook on Windows renders through Word, which has no
 *     flexbox and no grid.
 *   - Every style inline. Gmail drops most of a <style> block, and strips it
 *     entirely when a message is forwarded or clipped.
 *   - No gradients, no shadows, no web fonts. They degrade to nothing in Outlook
 *     and to something worse in Yahoo.
 *   - A real <a> styled as a button, with the raw link printed underneath. Some
 *     corporate gateways rewrite or strip buttons, and a person who cannot see
 *     the link has no way to continue.
 *   - Widths in pixels, capped at 600, with the table centred. Percentages
 *     collapse unpredictably on older clients.
 *   - A preheader line: the grey text a client shows next to the subject. Left
 *     out, it fills itself with whatever text comes first, which is usually the
 *     logo's alt text.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const INK = "#05060e";
const CARD = "#0a0d1c";
const LINE = "#1e2540";
const TEXT = "#edf1fb";
const MUTED = "#9aa6c4";
const FAINT = "#6b7694";
const ACTION = "#575af9";
const SWEEP = ["#00f0d4", "#00b4fc", "#575af9", "#9653fa", "#e838fd"];

/** The five-colour bar, as table cells so it survives every client. */
const spectrum = SWEEP.map(
  (c) => `<td width="20%" height="6" style="background-color:${c};font-size:0;line-height:0;">&nbsp;</td>`,
).join("");

/**
 * One email.
 *
 * `{{ .SiteURL }}` and friends are Supabase's own template variables, filled in
 * when the mail is sent. They are left untouched here.
 */
function layout({ preheader, heading, body, action, actionUrl, afterAction, footNote }) {
  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${heading}</title>
<style>
  /* Stripped by a few clients, which is why the base padding is already usable. */
  @media only screen and (max-width:620px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1  { font-size:22px !important; }
    .code { font-size:20px !important; letter-spacing:3px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${INK};">

<!-- Preheader: shown beside the subject line, then hidden in the body. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
<div style="display:none;max-height:0;overflow:hidden;">&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${INK};">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <!--
        Fluid up to 600, not fixed at 600. A fixed table runs 240 pixels off the
        side of a phone; Outlook ignores max-width, hence the conditional above
        giving it a real 600 to work with.
      -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${CARD};border-radius:16px;overflow:hidden;">

        <tr>
          <td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${spectrum}</tr></table>
          </td>
        </tr>

        <tr>
          <td class="pad" style="padding:36px 40px 0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <img src="{{ .SiteURL }}/icon-192.png" width="40" height="40" alt=""
                       style="display:block;width:40px;height:40px;border:0;border-radius:10px;">
                </td>
                <td style="vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:${TEXT};letter-spacing:-0.3px;">
                  Eluna Mind
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="pad" style="padding:28px 40px 0 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <h1 class="h1" style="margin:0 0 14px 0;font-size:26px;line-height:1.25;font-weight:700;color:${TEXT};letter-spacing:-0.5px;">${heading}</h1>
            ${body.map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${MUTED};">${p}</p>`).join("\n            ")}
          </td>
        </tr>

        ${action ? `<tr>
          <td class="pad" style="padding:14px 40px 0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background-color:${ACTION};">
                  <a href="${actionUrl}" target="_blank"
                     style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                    ${action}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="pad" style="padding:20px 40px 0 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:${FAINT};">If the button does not work, copy this link into your browser:</p>
            <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="${actionUrl}" target="_blank" style="color:#c0b0ff;text-decoration:underline;">${actionUrl}</a>
            </p>
          </td>
        </tr>` : ""}

        ${afterAction ? `<tr>
          <td class="pad" style="padding:22px 40px 0 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${afterAction}
          </td>
        </tr>` : ""}

        <tr>
          <td class="pad" style="padding:28px 40px 32px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td height="1" style="background-color:${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <p style="margin:18px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${FAINT};">
              ${footNote}
            </p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->

      <p style="margin:18px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${FAINT};text-align:center;">
        Sent by Eluna Mind · <a href="{{ .SiteURL }}" style="color:${FAINT};text-decoration:underline;">{{ .SiteURL }}</a>
      </p>

    </td>
  </tr>
</table>
</body>
</html>
`;
}

/** The one-time code, for the clients where a link is rewritten or blocked. */
const codeBlock = (intro) => `
            <p style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${FAINT};">${intro}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#10152b;border:1px solid ${LINE};border-radius:10px;padding:12px 20px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:5px;color:${TEXT};"
                    class="code">
                  {{ .Token }}
                </td>
              </tr>
            </table>`;

const IGNORE = "If you did not ask for this, you can ignore this email — nothing will change.";

const TEMPLATES = {
  "confirm-signup": {
    label: "Confirm signup",
    where: "Authentication → Emails → Confirm signup",
    subject: "Confirm your email — Eluna Mind",
    html: layout({
      preheader: "One click and your account is ready.",
      heading: "Confirm your email",
      body: [
        "Welcome. Confirm this address and your account is ready to use — the tutor, your notes, practice questions and the study planner, all on the free plan.",
      ],
      action: "Confirm my email",
      actionUrl: "{{ .ConfirmationURL }}",
      afterAction: codeBlock("Or enter this code in the app:"),
      footNote: `This link works once and expires in 24 hours. ${IGNORE}`,
    }),
  },

  "magic-link": {
    label: "Magic link",
    where: "Authentication → Emails → Magic Link",
    subject: "Your sign-in link — Eluna Mind",
    html: layout({
      preheader: "Sign in without a password.",
      heading: "Here is your sign-in link",
      body: ["Press the button to sign in. No password needed."],
      action: "Sign me in",
      actionUrl: "{{ .ConfirmationURL }}",
      afterAction: codeBlock("Or enter this code:"),
      footNote: `This link works once and expires in an hour. ${IGNORE} If you keep getting these and did not ask for them, change your password.`,
    }),
  },

  "reset-password": {
    label: "Reset password",
    where: "Authentication → Emails → Reset Password",
    subject: "Reset your password — Eluna Mind",
    html: layout({
      preheader: "Choose a new password.",
      heading: "Reset your password",
      body: [
        "Press the button to choose a new password. Your current one keeps working until you do.",
      ],
      action: "Choose a new password",
      actionUrl: "{{ .ConfirmationURL }}",
      afterAction: codeBlock("Or enter this code:"),
      // A reset nobody asked for is the one case worth alarming about.
      footNote: `This link works once and expires in an hour. If you did not ask to reset your password, ignore this email — your password has not changed. If this keeps happening, someone may be trying your email address, so pick a password you use nowhere else.`,
    }),
  },

  "change-email": {
    label: "Change email address",
    where: "Authentication → Emails → Change Email Address",
    subject: "Confirm your new email — Eluna Mind",
    html: layout({
      preheader: "Confirm the new address on your account.",
      heading: "Confirm your new email",
      body: [
        "Your account is moving from {{ .Email }} to {{ .NewEmail }}. Confirm it and the change takes effect.",
        "Until you do, your account keeps using the old address.",
      ],
      action: "Confirm the change",
      actionUrl: "{{ .ConfirmationURL }}",
      afterAction: codeBlock("Or enter this code:"),
      footNote: "If you did not ask to change your email, ignore this and tell us — someone may have access to your account.",
    }),
  },

  invite: {
    label: "Invite user",
    where: "Authentication → Emails → Invite user",
    subject: "You have been invited to Eluna Mind",
    html: layout({
      preheader: "Set a password and start studying.",
      heading: "You have been invited",
      body: [
        "An account has been created for you at Eluna Mind — an AI tutor that works from your own course material.",
        "Accept the invitation to set a password and get started.",
      ],
      action: "Accept the invitation",
      actionUrl: "{{ .ConfirmationURL }}",
      footNote: "If you were not expecting this, you can ignore it. The account stays unused until someone accepts.",
    }),
  },

  reauthentication: {
    label: "Reauthentication",
    where: "Authentication → Emails → Reauthentication",
    subject: "Your confirmation code — Eluna Mind",
    html: layout({
      preheader: "A code to confirm it is you.",
      heading: "Confirm it is you",
      body: ["Enter this code to finish what you were doing."],
      action: "",
      actionUrl: "",
      afterAction: codeBlock("Your code:"),
      footNote: `This code expires in a few minutes. ${IGNORE}`,
    }),
  },
};

mkdirSync(HERE, { recursive: true });

const index = ["# The auth emails", "",
  "Paste each file into the Supabase dashboard, under the heading shown.",
  "Set the subject line there too — Supabase keeps it separate from the body.", "",
  "| File | Where it goes | Subject line |", "|---|---|---|"];

for (const [name, t] of Object.entries(TEMPLATES)) {
  writeFileSync(join(HERE, `${name}.html`), t.html);
  index.push(`| \`${name}.html\` | ${t.where} | ${t.subject} |`);
}

index.push("", "## Before they work",
  "",
  "The logo is loaded from `{{ .SiteURL }}/icon-192.png`, so **Site URL** in",
  "Supabase → Authentication → URL Configuration has to be the real site address.",
  "Point it at localhost and every email arrives with a broken image.",
  "",
  "## The rate limit",
  "",
  "Supabase's built-in sender allows only a couple of emails an hour — it is meant",
  "for testing, not for customers. Add your own SMTP under",
  "Project Settings → Authentication → SMTP Settings and the limit goes away,",
  "and the mail arrives from your own domain instead of Supabase's.",
  "",
  "## Changing them",
  "",
  "Edit `build.mjs`, run `node build.mjs` in this folder, and paste the files in",
  "again. Editing the HTML directly works too, but the six files will drift apart.",
);

writeFileSync(join(HERE, "README.md"), index.join("\n") + "\n");
console.log(`built ${Object.keys(TEMPLATES).length} templates`);
