import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, extractJson, MODEL, readJson } from "../../../lib/ai";
import { VISUAL_MAP_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";

export const maxDuration = 60;

type RawNode = { id?: unknown; label?: unknown; details?: unknown; parent?: unknown };
type RawEdge = { from?: unknown; to?: unknown; label?: unknown };

export async function POST(req: Request) {
  const g = await guard(req, "visualMap");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const topic = clean(body.topic, g.rule.maxInputChars);
  const depth = body.depth === "deep" ? "deep" : "standard";
  if (!topic) return NextResponse.json({ error: "Missing topic." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  const counts = depth === "deep" ? "4 or 5 branches, each with 3 or 4 sub-points" : "4 branches, each with 2 or 3 sub-points";

  const prompt = `Build a mind map of "${topic}".

Structure:
- One root node: the topic itself. Its id is "root" and its parent is null.
- ${counts}. Every node names its parent by id, so the whole thing forms a tree.
- Branch labels are the real sub-areas of this topic, not generic words like "Causes" or "Types" unless those genuinely are the sub-areas.
- Every label is 1 to 4 words.
- "details" is 1 or 2 sentences that teach something specific: a definition, a number, a mechanism, or an example. Never repeat the label back.
- Order branches the way someone would learn them, foundations first.

Return JSON exactly like:
{"nodes":[{"id":"root","parent":null,"label":"${topic}","details":"..."},{"id":"b1","parent":"root","label":"...","details":"..."},{"id":"b1a","parent":"b1","label":"...","details":"..."}]}`;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISUAL_MAP_SYSTEM },
        { role: "user", content: prompt },
      ],
    });

    const parsed = extractJson<{ nodes?: RawNode[]; edges?: RawEdge[] }>(res.choices[0]?.message?.content || "", "object");
    if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length < 2) throw new Error("Bad map shape");

    const nodes = parsed.nodes
      .map((n) => ({
        id: String(n?.id ?? "").trim(),
        parent: n?.parent === null || n?.parent === undefined ? null : String(n.parent).trim() || null,
        label: String(n?.label ?? "").trim().slice(0, 60),
        details: String(n?.details ?? "").trim().slice(0, 400),
      }))
      .filter((n) => n.id && n.label);

    const ids = new Set(nodes.map((n) => n.id));

    // Some models answer with edges instead of parents; rebuild the tree from them.
    if (Array.isArray(parsed.edges) && nodes.every((n) => n.parent === null)) {
      for (const e of parsed.edges) {
        const from = String(e?.from ?? "").trim();
        const to = String(e?.to ?? "").trim();
        const child = nodes.find((n) => n.id === to);
        if (child && ids.has(from) && from !== to) child.parent = from;
      }
    }

    // A parent that does not exist would orphan the branch; hang it off the root instead.
    const root = nodes.find((n) => !n.parent || !ids.has(n.parent)) ?? nodes[0];
    root.parent = null;
    for (const n of nodes) {
      if (n === root) continue;
      if (!n.parent || !ids.has(n.parent) || n.parent === n.id) n.parent = root.id;
    }

    // Break any cycle the model invented, so the layout can never loop forever.
    for (const n of nodes) {
      const seen = new Set<string>([n.id]);
      let p = n.parent;
      while (p) {
        if (seen.has(p)) { n.parent = root.id; break; }
        seen.add(p);
        p = nodes.find((x) => x.id === p)?.parent ?? null;
      }
    }

    return NextResponse.json({ nodes, root: root.id });
  } catch (err) {
    console.error("visual-map error:", err);
    captureRouteError(err, req, { route: "/api/visual-map", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Could not build the mind map. Please try again.") }, { status: 500 });
  }
}
