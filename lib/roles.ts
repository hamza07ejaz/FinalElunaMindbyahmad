/**
 * Roles and permissions.
 *
 * Deliberately free of imports: the admin shell runs in the browser and needs
 * these to build its navigation, and anything imported here would be dragged
 * into the client bundle with it. The database-aware helpers live in auth.ts.
 */

export type Role = "user" | "sub_admin" | "admin";

/**
 * What each staff role is allowed to do.
 *
 * The split is deliberate: a sub-admin is hired help for support and content,
 * so they can calm an angry user down and write a blog post, but they cannot
 * give away Premium, promote themselves, or change what anything costs.
 */
export type Permission =
  | "users.view"      // see the user list and one user's detail
  | "users.moderate"  // block, unblock, reset today's usage, leave a note
  | "users.plan"      // change someone's plan or grant a trial  (money)
  | "users.role"      // make or unmake staff                    (security)
  | "settings"        // limits, pricing, branding, feature flags
  | "blog"
  | "support"
  | "errors"          // read stack traces and user emails from crash reports
  | "audit";          // read the admin activity log

const ALL: Permission[] = ["users.view", "users.moderate", "users.plan", "users.role", "settings", "blog", "support", "errors", "audit"];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  sub_admin: ["users.view", "users.moderate", "support", "blog"],
  user: [],
};

export const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  sub_admin: "Sub-admin",
  admin: "Admin",
};

export const isStaff = (role: Role) => role === "admin" || role === "sub_admin";

export function can(auth: { role: Role; blocked?: boolean }, permission: Permission): boolean {
  if (auth.blocked) return false;
  return ROLE_PERMISSIONS[auth.role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Anything not in the list is a plain user, never staff by accident. */
export function toRole(value: unknown): Role {
  return value === "admin" || value === "sub_admin" ? value : "user";
}
