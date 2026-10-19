import { getSettings } from "../../../lib/settings";
import { PillNav } from "./PillNav";

/** Server wrapper: reads the admin's branding, then renders the interactive bar. */
export async function SiteNav() {
  const { branding, flags } = await getSettings();
  return (
    <PillNav
      siteName={branding.siteName}
      logoUrl={branding.logoUrl}
      blogEnabled={flags.blogEnabled}
      notice={flags.maintenanceNote}
    />
  );
}
