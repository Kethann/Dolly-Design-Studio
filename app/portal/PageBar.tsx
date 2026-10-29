"use client";

import type { PageKey } from "@/lib/content/types";
import mac from "./mac.module.css";

const PAGES: { key: PageKey; label: string; title: string }[] = [
  { key: "home", label: "Home", title: "The home page" },
  { key: "work", label: "Work", title: "The full gallery page" },
  { key: "breakdowns", label: "Breakdowns", title: "The Breakdowns page" },
  { key: "project", label: "Inside a project", title: "A project's own page: its cover, details and pictures" },
];

/**
 * The page controller along the top, like the page list in a design tool: choose which page you are working on, move
 * around it, switch between editing and just looking, undo, and see it at phone or tablet size.
 */
export function PageBar({
  route,
  onRoute,
  editing,
  onEditing,
  device,
  onDevice,
  jumps,
  onJump,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReload,
  onPageLook,
  projects,
  projectSlug,
  onProject,
}: {
  route: PageKey;
  onRoute: (k: PageKey) => void;
  editing: boolean;
  onEditing: (on: boolean) => void;
  device: "desktop" | "tablet" | "phone";
  onDevice: (d: "desktop" | "tablet" | "phone") => void;
  /** Places on the home page to jump to (only offered on the home page). */
  jumps: { label: string }[];
  onJump: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReload: () => void;
  /** Open this page's own look: fonts, accent colour and background picture. */
  onPageLook: () => void;
  /** The projects you can go inside, which one is showing, and how to choose another. */
  projects: { slug: string; title: string }[];
  projectSlug: string;
  onProject: (slug: string) => void;
}) {
  return (
    <div className={mac.pageBar} role="toolbar" aria-label="Pages">
      <div className={mac.pageTabs} role="tablist" aria-label="Choose a page to edit">
        {PAGES.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={route === p.key} data-on={route === p.key} title={p.title} onClick={() => onRoute(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {route === "project" && (
        <select className={mac.pageJump} aria-label="Which project" value={projectSlug} onChange={(e) => onProject(e.target.value)}>
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
      )}

      {route === "home" && (
        <select className={mac.pageJump} aria-label="Jump to a part of the page" value="" onChange={(e) => e.target.value !== "" && onJump(Number(e.target.value))}>
          <option value="">Jump to…</option>
          {jumps.map((j, i) => (
            <option key={j.label} value={i}>
              {j.label}
            </option>
          ))}
        </select>
      )}

      <button type="button" className={mac.pageIcon} onClick={onPageLook} title="This page's own fonts, accent colour and background picture">
        ⚙ Page look
      </button>

      <span className={mac.menuSpacer} />

      <span className={mac.pageGroup} role="group" aria-label="Undo and redo">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl Z)" aria-label="Undo">
          ↶
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl Y)" aria-label="Redo">
          ↷
        </button>
      </span>

      <span className={mac.pageGroup} role="group" aria-label="Preview size">
        {(["desktop", "tablet", "phone"] as const).map((d) => (
          <button key={d} type="button" data-on={device === d} aria-pressed={device === d} onClick={() => onDevice(d)}>
            {d === "desktop" ? "Desktop" : d === "tablet" ? "Tablet" : "Phone"}
          </button>
        ))}
      </span>

      <button type="button" className={mac.pageIcon} onClick={onReload} title="Reload the preview" aria-label="Reload the preview">
        ↻
      </button>

      <button type="button" className={mac.pageEdit} data-on={editing} aria-pressed={editing} onClick={() => onEditing(!editing)} title={editing ? "Switch to just looking at the page" : "Show the Edit buttons"}>
        {editing ? "✎ Editing" : "👁 Viewing"}
      </button>
    </div>
  );
}
