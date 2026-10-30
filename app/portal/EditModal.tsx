"use client";

import { useConfirmDelete } from "./DeleteDialog";
import { useRef, type ReactNode } from "react";
import { useDialogFocus } from "./dialog-focus";
import { FieldView, ProblemsProvider, getAt, moveItem, setAt, useEditor } from "./ContentEditor";
import { findList, findSection, type Field } from "./content-schema";
import type { Problem } from "./validate";
import styles from "./edit.module.css";

/**
 * The clean editing window that opens from an Edit button on the preview: a title, everything about that part, and
 * Cancel / Save changes. Changes show in the preview as they are made; Cancel puts everything back as it was, Save
 * keeps them (they still reach the site when you press Save & publish).
 */
export function EditModal({
  title,
  hint,
  children,
  headerExtra,
  problems,
  changed,
  onCancel,
  onSave,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  /** Buttons for the whole item (move, duplicate, delete) next to the title. */
  headerExtra?: ReactNode;
  /** What must be fixed before saving. */
  problems: Problem[];
  /** Whether anything was changed since it opened (Cancel then asks first). */
  changed: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = () => {
    if (!changed || window.confirm("Discard the changes you made here?")) onCancel();
  };
  useDialogFocus(box, cancel);

  const blocked = problems.length > 0;
  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div ref={box} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="edit-title" tabIndex={-1}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="edit-title" className={styles.title}>
              {title}
            </h2>
            {hint && <p className={styles.hint}>{hint}</p>}
          </div>
          {headerExtra}
          <button type="button" className={styles.close} aria-label="Cancel and close" onClick={cancel}>
            ×
          </button>
        </header>

        {blocked && (
          <div className={styles.problems} role="alert">
            <strong>
              {problems.length === 1 ? "One thing needs fixing before you can save:" : `${problems.length} things need fixing before you can save:`}
            </strong>
            <ul>
              {problems.slice(0, 4).map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
              {problems.length > 4 && <li>…and {problems.length - 4} more.</li>}
            </ul>
          </div>
        )}

        <div className={styles.body}>
          <ProblemsProvider value={problems}>{children}</ProblemsProvider>
        </div>

        <footer className={styles.foot}>
          <span className={styles.footNote}>Changes stay in your preview until you use Save &amp; publish.</span>
          <button type="button" className={styles.cancel} onClick={cancel}>
            Cancel
          </button>
          <button type="button" className={styles.save} disabled={blocked} onClick={onSave} title={blocked ? "Fix the highlighted things first" : undefined}>
            Keep changes
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Every setting of one section of a page: its headings, texts, pictures, lists and layout. */
export function SectionEditor({ pageKey, sectionId, extra }: { pageKey: string; sectionId: string; extra?: (section: NonNullable<ReturnType<typeof findSection>>["section"]) => ReactNode }) {
  const hit = findSection(pageKey, sectionId);
  if (!hit) return <p className={styles.hint}>There is nothing to edit here.</p>;
  return (
    <div className={styles.fields}>
      {hit.section.fields.map((f) => (
        <FieldView key={f.path} field={f} />
      ))}
      {extra?.(hit.section)}
    </div>
  );
}

/** The paths a section's problems can live under (its fields' own paths). */
export const sectionPaths = (pageKey: string, sectionId: string): string[] => findSection(pageKey, sectionId)?.section.fields.map((f: Field) => f.path) ?? [];

/** Every setting of one item of a list, with buttons to move, duplicate or delete the item. */
export function ItemEditor({ list, index }: { list: string; index: number }) {
  const def = findList(list);
  if (!def) return <p className={styles.hint}>There is nothing to edit here.</p>;
  return (
    <div className={styles.fields}>
      {def.fields.map((f) => (
        <FieldView key={f.path} field={f} base={`${list}.${index}.`} />
      ))}
    </div>
  );
}

/** Move earlier / later, duplicate and delete for the item being edited. Returns the item's new place (or null once deleted). */
export function ItemTools({ list, index, onIndex, onDeleted }: { list: string; index: number; onIndex: (i: number) => void; onDeleted: () => void }) {
  const { content, update } = useEditor();
  const { ask: askDelete, dialog: deleteDialog } = useConfirmDelete();
  const def = findList(list);
  const items = (getAt(content, list) as Record<string, unknown>[] | undefined) ?? [];
  if (!def) return null;
  const set = (next: unknown[]) => update((c) => setAt(c, list, next));
  const canDelete = items.length > (def.min ?? 0);
  return (
    <span className={styles.tools} role="group" aria-label="This item">
      <button
        type="button"
        title="Move earlier"
        aria-label="Move earlier"
        disabled={index === 0}
        onClick={() => {
          set(moveItem(items, index, -1));
          onIndex(index - 1);
        }}
      >
        ←
      </button>
      <button
        type="button"
        title="Move later"
        aria-label="Move later"
        disabled={index >= items.length - 1}
        onClick={() => {
          set(moveItem(items, index, 1));
          onIndex(index + 1);
        }}
      >
        →
      </button>
      <button
        type="button"
        title="Duplicate"
        aria-label="Duplicate"
        disabled={def.max !== undefined && items.length >= def.max}
        onClick={() => {
          const copy = JSON.parse(JSON.stringify(items[index]));
          set([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
          onIndex(index + 1);
        }}
      >
        ⧉
      </button>
      <button
        type="button"
        title={canDelete ? "Delete" : "This list needs at least one"}
        aria-label="Delete"
        disabled={!canDelete}
        data-danger
        onClick={() =>
          askDelete({
            what: `“${def.title(items[index], index)}”`,
            item: items[index],
            onDelete: () => {
              set(items.filter((_, j) => j !== index));
              onDeleted();
            },
          })
        }
      >
        🗑
      </button>
      {deleteDialog}
    </span>
  );
}
