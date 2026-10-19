"use client";
import { useMemo, useRef, useState } from "react";
import { Icon } from "../../_components/Icon";
import { ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Node = { id: string; parent: string | null; label: string; details: string };
type Placed = Node & { x: number; y: number; w: number; h: number; depth: number; side: 1 | -1 };

const BRANCH_COLORS = ["#00b4fc", "#e838fd", "#00f0d4", "#9653fa", "#fb7185", "#6ee7c7"];
const CHAR_W = 7.4, PAD_X = 18, ROW_H = 38, GAP_Y = 14, COL_GAP = 58;

/** Classic mind map: root in the middle, branches fanning left and right. */
function layout(nodes: Node[], rootId: string) {
  const byParent = new Map<string | null, Node[]>();
  for (const n of nodes) {
    const k = n.id === rootId ? "__root__" : n.parent;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  const root = nodes.find((n) => n.id === rootId)!;
  const branches = byParent.get(rootId) ?? [];

  const width = (label: string, depth: number) =>
    Math.max(depth === 0 ? 150 : 110, Math.min(230, label.length * CHAR_W + PAD_X * 2));

  const placed: Placed[] = [];
  // Walk one branch, stacking its leaves downward; a parent sits at its children's midpoint.
  function walk(node: Node, depth: number, side: 1 | -1, cursor: { y: number }): Placed {
    const kids = byParent.get(node.id) ?? [];
    const w = width(node.label, depth);
    if (kids.length === 0) {
      const p: Placed = { ...node, depth, side, w, h: ROW_H, x: 0, y: cursor.y };
      cursor.y += ROW_H + GAP_Y;
      placed.push(p);
      return p;
    }
    const childPos = kids.map((k) => walk(k, depth + 1, side, cursor));
    const mid = (childPos[0].y + childPos[childPos.length - 1].y) / 2;
    const p: Placed = { ...node, depth, side, w, h: ROW_H, x: 0, y: mid };
    placed.push(p);
    return p;
  }

  const half = Math.ceil(branches.length / 2);
  const right = branches.slice(0, half);
  const left = branches.slice(half);
  const cursorR = { y: 0 };
  const rightTops = right.map((b) => walk(b, 1, 1, cursorR));
  const cursorL = { y: 0 };
  const leftTops = left.map((b) => walk(b, 1, -1, cursorL));

  // Centre the two columns against each other.
  const spanR = cursorR.y || ROW_H;
  const spanL = cursorL.y || ROW_H;
  const tallest = Math.max(spanR, spanL);
  const shiftR = (tallest - spanR) / 2;
  const shiftL = (tallest - spanL) / 2;
  for (const p of placed) p.y += p.side === 1 ? shiftR : shiftL;

  // Horizontal position by depth, measured outward from the centre.
  const depthWidth: number[] = [];
  for (const p of placed) depthWidth[p.depth] = Math.max(depthWidth[p.depth] ?? 0, p.w);
  const rootW = width(root.label, 0);
  const offsetAt = (depth: number) => {
    let x = rootW / 2 + COL_GAP;
    for (let d = 1; d < depth; d++) x += (depthWidth[d] ?? 120) + COL_GAP;
    return x;
  };
  const centreX = Math.max(
    ...placed.map((p) => offsetAt(p.depth) + p.w),
    rootW / 2
  ) + 30;

  for (const p of placed) {
    p.x = p.side === 1 ? centreX + offsetAt(p.depth) : centreX - offsetAt(p.depth) - p.w;
  }

  const rootNode: Placed = { ...root, depth: 0, side: 1, w: rootW, h: 46, x: centreX - rootW / 2, y: tallest / 2 - 23 };
  const all = [rootNode, ...placed];

  // Colour each branch and everything under it.
  const colorOf = new Map<string, string>();
  branches.forEach((b, i) => {
    const c = BRANCH_COLORS[i % BRANCH_COLORS.length];
    const stack = [b.id];
    while (stack.length) {
      const id = stack.pop()!;
      colorOf.set(id, c);
      for (const k of byParent.get(id) ?? []) stack.push(k.id);
    }
  });

  const minY = Math.min(...all.map((p) => p.y)) - 24;
  const maxY = Math.max(...all.map((p) => p.y + p.h)) + 24;
  for (const p of all) p.y -= minY;

  return { placed: all, colorOf, width: centreX * 2, height: maxY - minY, rootId };
}

export default function VisualMapPage() {
  const tool = useToolRunner<{ nodes: Node[]; root: string }>("/api/generate-visual-map");
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState<"standard" | "deep">("standard");
  const [map, setMap] = useState<{ nodes: Node[]; root: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  async function generate() {
    const j = await tool.run({ topic, depth });
    if (j?.nodes?.length) { setMap({ nodes: j.nodes, root: j.root }); setSel(j.root); setZoom(1); }
  }

  const lay = useMemo(() => (map ? layout(map.nodes, map.root) : null), [map]);
  const selected = map?.nodes.find((n) => n.id === sel);
  const byId = useMemo(() => new Map((lay?.placed ?? []).map((p) => [p.id, p])), [lay]);

  function downloadSvg() {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // inline a background so the file is readable outside the dark app
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#0b1020");
    clone.insertBefore(bg, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(topic || "mind-map").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "mind-map"}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const outlineText = () => {
    if (!map) return "";
    const lines: string[] = [];
    const walk = (id: string, d: number) => {
      const n = map.nodes.find((x) => x.id === id);
      if (!n) return;
      lines.push(`${"  ".repeat(d)}${d ? "- " : "# "}${n.label}${n.details ? `: ${n.details}` : ""}`);
      map.nodes.filter((x) => x.parent === id).forEach((c) => walk(c.id, d + 1));
    };
    walk(map.root, 0);
    return lines.join("\n");
  };

  return (
    <ToolFrame toolKey="visualMap" wide>
      <div className="space-y-5">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Topic" hint={`${topic.length}/300`}>
              <input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. The water cycle" />
            </Field>
            <Field label="Detail">
              <select className="input" value={depth} onChange={(e) => setDepth(e.target.value as "standard" | "deep")}>
                <option value="standard">Standard</option>
                <option value="deep">More detail</option>
              </select>
            </Field>
          </div>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Build mind map" /></div>
        </Panel>

        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={7} /></Panel>}

        {!tool.loading && map && lay && (
          <div className="pop-in space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">{map.nodes.length} ideas</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} aria-label="Zoom out">−</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label="Zoom in">+</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(outlineText()).catch(() => {})}>
                  <Icon name="copy" size={14} /> Copy outline
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={downloadSvg}>
                  <Icon name="download" size={14} /> Image
                </button>
              </div>
            </div>

            <div className="glass overflow-auto rounded-2xl p-3">
              <svg ref={svgRef} width={lay.width * zoom} height={lay.height * zoom}
                viewBox={`0 0 ${lay.width} ${lay.height}`} role="img" aria-label={`Mind map of ${topic}`} className="block">
                {/* curved connectors, drawn first so nodes sit on top */}
                {lay.placed.map((p) => {
                  if (!p.parent) return null;
                  const parent = byId.get(p.parent);
                  if (!parent) return null;
                  const isRootChild = p.parent === lay.rootId;
                  const x1 = p.side === 1 ? parent.x + parent.w : parent.x;
                  const y1 = parent.y + parent.h / 2;
                  const x2 = p.side === 1 ? p.x : p.x + p.w;
                  const y2 = p.y + p.h / 2;
                  const dx = Math.abs(x2 - x1) * 0.5;
                  const c = lay.colorOf.get(p.id) ?? "#94a0bd";
                  return (
                    <path key={`e-${p.id}`}
                      d={`M${x1} ${y1} C${x1 + (p.side === 1 ? dx : -dx)} ${y1}, ${x2 - (p.side === 1 ? dx : -dx)} ${y2}, ${x2} ${y2}`}
                      fill="none" stroke={c} strokeOpacity={isRootChild ? 0.85 : 0.45}
                      strokeWidth={isRootChild ? 2.4 : 1.6} strokeLinecap="round" />
                  );
                })}

                {lay.placed.map((p) => {
                  const isRoot = p.id === lay.rootId;
                  const c = isRoot ? "#8b6cff" : lay.colorOf.get(p.id) ?? "#8d99bd";
                  const active = sel === p.id;
                  const label = p.label.length > 30 ? `${p.label.slice(0, 29)}…` : p.label;
                  return (
                    <g key={p.id} onClick={() => setSel(p.id)} className="cursor-pointer" role="button" tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(p.id)}>
                      <title>{p.label}</title>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={isRoot ? 14 : p.depth === 1 ? 10 : 8}
                        fill={c} fillOpacity={isRoot ? 1 : p.depth === 1 ? 0.22 : 0.1}
                        stroke={c} strokeOpacity={active ? 1 : 0.55} strokeWidth={active ? 2.4 : 1.2}
                        style={{ transition: "all .2s" }} />
                      <text x={p.x + p.w / 2} y={p.y + p.h / 2} textAnchor="middle" dominantBaseline="central"
                        fontSize={isRoot ? 15 : p.depth === 1 ? 13 : 12}
                        fontWeight={isRoot || p.depth === 1 ? 600 : 400}
                        fill={isRoot ? "#07040f" : "#eef1f8"}>
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {selected && (
              <Panel className="pop-in">
                <h3 className="mb-1 font-display text-base" style={{ color: lay.colorOf.get(selected.id) ?? "#8b6cff" }}>
                  {selected.label}
                </h3>
                <p className="text-sm leading-relaxed text-paper/80">{selected.details || "No extra detail for this one."}</p>
              </Panel>
            )}
            <p className="text-center text-xs text-muted">Click any node to read it. Drag sideways on small screens.</p>
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
