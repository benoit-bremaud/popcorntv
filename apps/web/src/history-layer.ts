import { useEffect, type RefObject } from 'react';

/** Depth of the modal layer a history entry stands for: 0 for the catalog (ADR-0024). */
export function layerDepth(state: unknown): number {
  if (typeof state !== 'object' || state === null || !('pctvLayer' in state)) return 0;
  const depth = state.pctvLayer;
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0 ? depth : 0;
}

/** The history entry of a layer at `depth`. */
export function layerState(depth: number): { readonly pctvLayer: number } {
  return { pctvLayer: depth };
}

/**
 * How a new layer gets its entry: it reuses an entry a hand-off left behind (spec
 * history-back R5), else it stacks one above the current entry.
 */
export function openLayer(
  current: number,
  adoptable: number | null,
): { readonly depth: number; readonly mode: 'push' | 'replace' } {
  if (adoptable !== null && adoptable === current) return { depth: current, mode: 'replace' };
  return { depth: current + 1, mode: 'push' };
}

/** Back (or Forward) moved to `current`: the layer at `depth` closes when it is now above. */
export function poppedBy(depth: number, current: number): boolean {
  return current < depth;
}

/**
 * The open depths a Back to `current` closes, top first: the player saves and ends its
 * session before the detail dialog under it closes (R2).
 */
export function closingOrder(open: readonly number[], current: number): number[] {
  return open.filter((depth) => poppedBy(depth, current)).sort((a, b) => b - a);
}

/** Whether a layer at `depth` still owns the top entry once `pending` Backs have landed. */
export function ownsTop(depth: number, current: number, pending: number): boolean {
  return depth > 0 && current - pending === depth;
}

/** An entry a layer left without closing (it was unmounted by a hand-off), or none. */
let adoptable: number | null = null;
/** Backs this module asked for whose `popstate` has not arrived yet (R3, R4). */
let ownBacks = 0;
/** Layers opened while such a Back was on its way: they take their entry once it lands. */
let waiting: (() => void)[] = [];
/** The open layers by depth, closed top first on Back (R2). */
const open = new Map<number, () => void>();
let watching = false;

/** The one `popstate` listener: it closes the layers a Back left, top first. */
function onPopState(): void {
  const own = ownBacks > 0;
  if (own) ownBacks -= 1;
  if (!own) {
    const current = layerDepth(history.state);
    const closing = closingOrder([...open.keys()], current);
    closing.forEach((depth) => open.get(depth)?.());
    // Forward onto an entry no layer owns any more: leave it, or the next Back is dead.
    if (open.size === closing.length && current > 0) leaveStaleLayers();
  }
  if (ownBacks > 0) return;
  const ready = waiting;
  waiting = [];
  ready.forEach((enter) => enter());
}

function watch(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('popstate', onPopState);
}

/**
 * R6: a reload on a layer entry shows the catalog, so that entry is left at once. Called at
 * start, before any layer opens, and on Forward onto a layer entry no layer owns.
 */
export function leaveStaleLayers(target: History = window.history): void {
  const depth = layerDepth(target.state);
  if (depth === 0) return;
  ownBacks += 1;
  target.go(-depth);
}

/**
 * Ties a modal `<dialog>` to the history stack (spec history-back): opening it adds an entry,
 * Back closes it through the dialog's own `close` path, and a close by button or Escape goes
 * back so no stale entry stays. A layer unmounted without closing hands its entry over.
 */
export function useHistoryLayer(ref: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    watch();
    let depth = 0;
    let popped = false;
    let closed = false;
    let removed = false;
    const pop = (): void => {
      popped = true;
      dialog.close();
    };
    /** Takes the layer's entry; it waits while an earlier Back is on its way (R4). */
    const enter = (): void => {
      if (removed || closed) return;
      const opened = openLayer(layerDepth(history.state), adoptable);
      adoptable = null;
      depth = opened.depth;
      open.set(depth, pop);
      if (opened.mode === 'push') history.pushState(layerState(depth), '');
      else history.replaceState(layerState(depth), '');
    };
    if (ownBacks > 0) waiting.push(enter);
    else enter();

    /** A close by button or Escape leaves the layer's entry; a close by Back already did. */
    const finish = (): void => {
      if (closed) return;
      closed = true;
      if (open.get(depth) === pop) open.delete(depth);
      if (!popped && ownsTop(depth, layerDepth(history.state), ownBacks)) {
        ownBacks += 1;
        history.back();
      }
    };
    const onClose = (event: Event): void => {
      // A nested layer's `close` does not bubble, but stay strict about the target.
      if (event.target === dialog) finish();
    };
    dialog.addEventListener('close', onClose);
    return () => {
      removed = true;
      waiting = waiting.filter((waiter) => waiter !== enter);
      dialog.removeEventListener('close', onClose);
      // React may unmount the layer from its own `close` handler, before this one runs.
      if (!dialog.open) finish();
      if (closed) return;
      if (open.get(depth) === pop) open.delete(depth);
      if (ownsTop(depth, layerDepth(history.state), ownBacks)) adoptable = depth;
    };
  }, [ref]);
}

/** Test seam: forgets every layer and pending Back. */
export function resetHistoryLayers(): void {
  adoptable = null;
  ownBacks = 0;
  waiting = [];
  open.clear();
}
