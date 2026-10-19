import { NotFoundPage } from "../_components/NotFound";

export const metadata = { title: "Blog unavailable" };

/** Shown when the blog is switched off in the admin panel. */
export default function BlogNotFound() {
  return (
    <NotFoundPage
      title="The blog is not available"
      message="It may be switched off at the moment. Everything else is where you left it."
    />
  );
}
