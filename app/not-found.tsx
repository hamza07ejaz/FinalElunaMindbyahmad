import { NotFoundPage } from "./_components/NotFound";

export const metadata = { title: "Not found" };

/** A URL that matched no route at all. */
export default function NotFound() {
  return <NotFoundPage />;
}
