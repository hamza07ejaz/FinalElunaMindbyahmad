import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { permissionsFor, requireStaff } from "../../lib/auth";
import { ErrorBoundary } from "../_components/ErrorCatcher";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Eluna Mind", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  // Not staff? Behave as if the section does not exist.
  if (!staff) redirect("/dashboard");

  // The nav is built from the caller's permissions, so a sub-admin is never
  // shown a page that would refuse them. The API routes check again anyway.
  return (
    <AdminShell email={staff.user.email ?? ""} role={staff.role} permissions={permissionsFor(staff.role)}>
      <ErrorBoundary label="admin">{children}</ErrorBoundary>
    </AdminShell>
  );
}
