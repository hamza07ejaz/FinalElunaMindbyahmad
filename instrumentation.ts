/**
 * Next.js calls onRequestError for every server error it catches itself —
 * anything a route handler or a server component did not catch. Those are the
 * crashes nobody would otherwise hear about, so they go straight to the error
 * table alongside the ones routes report deliberately.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Imported lazily: this file loads in every runtime, and the Supabase admin
  // client has no business being initialised in the edge runtime.
  const { captureError } = await import("./lib/errors");

  await captureError(err, {
    level: "fatal",              // uncaught: the request died
    route: request.path,
    method: request.method,
    userAgent: typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : null,
    extra: {
      router: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidate: context.revalidateReason,
    },
  });
};
