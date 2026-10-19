import { NotFoundPage } from "../../_components/NotFound";

export const metadata = { title: "Post not found" };

/** A dead or unpublished blog link, which is the most likely 404 anyone hits. */
export default function PostNotFound() {
  return (
    <NotFoundPage
      title="That post is not here"
      message="It may have been taken down, or the link may be old."
    />
  );
}
