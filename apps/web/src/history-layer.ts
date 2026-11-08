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

/** An entry a layer left without closing (it was unmounted by a hand-off), or none. */
let adoptable: number | null = null;
/** Backs a closing layer asked for whose `popstate` has not arrived yet (R4). */
let ownBacks = 0;
/** Whether the `popstate` being dispatched answers one of those Backs. */
let ownPop = false;
/** Layers opened while such a Back was on its way: they take their entry once it lands. */
let waiting: (() => void)[] = [];
let watching = false;

/** Registered before any layer's listener, so it marks the event before they see it. */
function watchOwnBacks(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('popstate', () => {
    ownPop = ownBacks > 0;
    if (ownPop) ownBacks -= 1;
    if (ownBacks > 0) return;
    const ready = waiting;
    waiting = [];
    ready.forEach((enter) => enter());
  });
}

/** Leaves a closed layer's entry; a layer opened before it lands must not take it as Back. */
function goBack(): void {
  ownBacks += 1;
  history.back();
}

/**
 * R6: a reload on a layer entry shows the catalog, so that entry is left at once. Called once
 * at start, before any layer opens.
 */
export function leaveStaleLayers(history: History = window.history): void {
  const depth = layerDepth(history.state);
  if (depth > 0) history.go(-depth);
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
    watchOwnBacks();
    let depth = 0;
    let popped = false;
    let closed = false;
    let removed = false;
    /** Takes the layer's entry; it waits while a closed layer's Back is on its way (R4). */
    const enter = (): void => {
      if (removed || closed) return;
      const opened = openLayer(layerDepth(history.state), adoptable);
      adoptable = null;
      depth = opened.depth;
      if (opened.mode === 'push') history.pushState(layerState(depth), '');
      else history.replaceState(layerState(depth), '');
    };
    if (ownBacks > 0) waiting.push(enter);
    else enter();

    const onPop = (): void => {
      if (depth === 0 || closed || ownPop || !poppedBy(depth, layerDepth(history.state))) return;
      popped = true;
      dialog.close();
    };
    /** A close by button or Escape leaves the layer's entry; a close by Back already did. */
    const finish = (): void => {
      if (closed) return;
      closed = true;
      if (!popped && depth > 0 && layerDepth(history.state) === depth) goBack();
    };
    const onClose = (event: Event): void => {
      // A nested layer's `close` does not bubble, but stay strict about the target.
      if (event.target === dialog) finish();
    };
    window.addEventListener('popstate', onPop);
    dialog.addEventListener('close', onClose);
    return () => {
      removed = true;
      waiting = waiting.filter((waiter) => waiter !== enter);
      window.removeEventListener('popstate', onPop);
      dialog.removeEventListener('close', onClose);
      // React may unmount the layer from its own `close` handler, before this one runs.
      if (!dialog.open) finish();
      if (!closed && depth > 0 && layerDepth(history.state) === depth) adoptable = depth;
    };
  }, [ref]);
}

/** Test seam: forgets a pending hand-off. */
export function resetHistoryLayers(): void {
  adoptable = null;
  ownBacks = 0;
  ownPop = false;
  waiting = [];
}
