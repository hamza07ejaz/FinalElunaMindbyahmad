import { NotFoundPage } from "../_components/NotFound";

export const metadata = { title: "Page not found" };

/**
 * Reached when a slug has no page behind it — a mistyped legal URL, or one an
 * admin unpublished. Without this file the router renders its bare error shell,
 * which has no layout and therefore no stylesheet.
 */
export default function SlugNotFound() {
  return (
    <NotFoundPage
      title="That page does not exist"
      message="It may have been renamed or unpublished. The pages below are the ones that always exist."
    />
  );
}
