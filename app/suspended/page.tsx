import Link from "next/link";
import { requireUser } from "../../lib/auth";
import { getSettings } from "../../lib/settings";
import { Logo } from "../_components/Logo";
import { Icon } from "../_components/Icon";

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const auth = await requireUser();
  const { branding } = await getSettings();

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass-strong w-full max-w-md rounded-2xl p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo logoUrl={branding.logoUrl} siteName={branding.siteName} /></div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-300"><Icon name="ban" size={26} /></div>
        <h1 className="font-display text-xl text-paper">This account is suspended</h1>
        <p className="mt-3 text-sm text-muted">
          {auth?.blockedReason?.trim() || "An administrator has paused access to this account."}
        </p>
        <p className="mt-4 text-sm text-muted">
          If you think this is a mistake, email{" "}
          <a className="text-lamp hover:underline" href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>.
        </p>
        <Link href="/" className="btn btn-ghost mt-7 w-full">Back to the homepage</Link>
      </div>
    </div>
  );
}
