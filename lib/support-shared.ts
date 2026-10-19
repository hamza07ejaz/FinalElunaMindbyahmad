/**
 * Support ticket shapes and text rules, shared by the API routes and by the
 * two pages that render a thread.
 *
 * Import-free on purpose: the user and admin pages are client components, so
 * anything imported here would be bundled into the browser with them. The
 * database helpers live in support.ts.
 */

export const CATEGORIES = ["billing", "bug", "account", "feature", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  billing: "Billing & plans",
  bug: "Something is broken",
  account: "My account",
  feature: "Feature request",
  other: "Something else",
};

export const STATUSES = ["open", "answered", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  open: "Waiting on us",
  answered: "Replied",
  closed: "Closed",
};

export const MAX_SUBJECT = 120;
export const MAX_BODY = 4000;

/** Limits that keep one angry afternoon from filling the inbox. */
export const MAX_OPEN_TICKETS = 5;
export const MAX_MESSAGES_PER_DAY = 25;

export type TicketRow = {
  id: string;
  subject: string;
  category: Category;
  status: Status;
  created_at: string;
  last_reply_at: string;
  unread_for_user: boolean;
  unread_for_staff: boolean;
};

export type MessageRow = {
  id: string;
  author: "user" | "staff";
  author_email: string | null;
  body: string;
  created_at: string;
};

export const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

/** Trim and cap text coming from either side. Returns "" when there is nothing usable. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, max);
}

