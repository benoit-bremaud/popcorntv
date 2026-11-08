import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  layerDepth,
  layerState,
  closingOrder,
  leaveStaleLayers,
  openLayer,
  ownsTop,
  poppedBy,
  resetHistoryLayers,
  useHistoryLayer,
} from './history-layer.js';

describe('layerDepth', () => {
  it('reads the depth of a layer entry', () => {
    expect(layerDepth(layerState(2))).toBe(2);
  });

  it.each([null, undefined, 'x', 3, {}, { pctvLayer: '1' }, { pctvLayer: 0 }, { pctvLayer: -1 }])(
    'treats %j as the catalog',
    (state) => {
      expect(layerDepth(state)).toBe(0);
    },
  );

  it('refuses a fractional depth', () => {
    expect(layerDepth({ pctvLayer: 1.5 })).toBe(0);
  });
});

describe('openLayer', () => {
  it('stacks a first layer above the catalog', () => {
    expect(openLayer(0, null)).toEqual({ depth: 1, mode: 'push' });
  });

  it('stacks a nested layer above its parent', () => {
    expect(openLayer(1, null)).toEqual({ depth: 2, mode: 'push' });
  });

  it('reuses the entry a hand-off left on top', () => {
    expect(openLayer(1, 1)).toEqual({ depth: 1, mode: 'replace' });
  });

  it('pushes when the left entry is no longer on top', () => {
    expect(openLayer(0, 1)).toEqual({ depth: 1, mode: 'push' });
  });
});

describe('poppedBy', () => {
  it('closes a layer once Back moved below it', () => {
    expect(poppedBy(2, 1)).toBe(true);
    expect(poppedBy(1, 0)).toBe(true);
  });

  it('keeps a layer when Back closed only the one above it', () => {
    expect(poppedBy(1, 1)).toBe(false);
  });

  it('keeps a layer when Forward moved above it', () => {
    expect(poppedBy(1, 2)).toBe(false);
  });
});

describe('closingOrder', () => {
  it('closes the top layer first', () => {
    expect(closingOrder([1, 2], 0)).toEqual([2, 1]);
  });

  it('keeps the layers at or below the landing entry', () => {
    expect(closingOrder([1, 2], 1)).toEqual([2]);
    expect(closingOrder([1, 2], 2)).toEqual([]);
  });

  it('closes nothing when no layer is open', () => {
    expect(closingOrder([], 0)).toEqual([]);
  });
});

describe('ownsTop', () => {
  it('owns the top entry when nothing is pending', () => {
    expect(ownsTop(1, 1, 0)).toBe(true);
  });

  it('owns it once the pending Back of the layer above has landed', () => {
    expect(ownsTop(1, 2, 1)).toBe(true);
  });

  it('does not own an entry another layer stands on', () => {
    expect(ownsTop(1, 2, 0)).toBe(false);
  });

  it('a layer that never took an entry owns nothing', () => {
    expect(ownsTop(0, 0, 0)).toBe(false);
  });
});

describe('leaveStaleLayers', () => {
  it('goes back over every layer entry of a reloaded page', () => {
    const go = vi.fn();
    leaveStaleLayers({ state: layerState(2), go } as unknown as History);
    expect(go).toHaveBeenCalledWith(-2);
  });

  it('stays on a catalog entry', () => {
    const go = vi.fn();
    leaveStaleLayers({ state: null, go } as unknown as History);
    expect(go).not.toHaveBeenCalled();
  });
});

function Layer({
  name,
  onClose,
  children,
}: {
  readonly name: string;
  readonly onClose: () => void;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  useHistoryLayer(ref);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={name}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" onClick={() => ref.current?.close()}>
        Close {name}
      </button>
      {children}
    </dialog>
  );
}

/** A detail layer that can open a player layer inside it, like DetailDialog. */
function Stack({ log = [] }: { readonly log?: string[] }): React.JSX.Element {
  const [detail, setDetail] = useState(true);
  const [player, setPlayer] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDetail(true)}>
        Open
      </button>
      {detail && (
        <Layer
          name="detail"
          onClose={() => {
            log.push('detail');
            setDetail(false);
          }}
        >
          <button type="button" onClick={() => setPlayer(true)}>
            Play
          </button>
          {player && (
            <Layer
              name="player"
              onClose={() => {
                log.push('player');
                setPlayer(false);
              }}
            />
          )}
        </Layer>
      )}
    </>
  );
}

const depth = (): number => layerDepth(history.state);

async function back(): Promise<void> {
  await act(async () => {
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('useHistoryLayer', () => {
  beforeEach(() => {
    resetHistoryLayers();
    history.replaceState(null, '');
  });
  afterEach(async () => {
    // Leaves the entries a test stacked, so the next one starts on a catalog entry.
    while (depth() > 0) await back();
  });

  it('pushes an entry when a layer opens', () => {
    const push = vi.spyOn(history, 'pushState');
    render(<Stack />);
    expect(depth()).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('closes the layer on Back', async () => {
    render(<Stack />);
    await back();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(depth()).toBe(0);
  });

  it('goes back when the close button closes the layer, leaving no stale entry', async () => {
    render(<Stack />);
    act(() => screen.getByText('Close detail').click());
    await waitFor(() => expect(depth()).toBe(0));
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('closes then Back does not reopen anything nor leave the catalog twice', async () => {
    render(<Stack />);
    act(() => screen.getByText('Close detail').click());
    await waitFor(() => expect(depth()).toBe(0));
    await back();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(depth()).toBe(0);
  });

  it('does not stack entries when a layer is opened and closed again and again', async () => {
    render(<Stack />);
    for (let round = 0; round < 3; round += 1) {
      act(() => screen.getByText('Close detail').click());
      await waitFor(() => expect(depth()).toBe(0));
      act(() => screen.getByText('Open').click());
      expect(depth()).toBe(1);
    }
  });

  it('Back from the player closes only the player, a second Back the detail', async () => {
    render(<Stack />);
    act(() => screen.getByText('Play').click());
    expect(depth()).toBe(2);
    await back();
    expect(screen.queryByRole('dialog', { name: 'player', hidden: true })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'detail', hidden: true })).toBeInTheDocument();
    await back();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('a double Back fired at once closes the player first, then the detail', async () => {
    const log: string[] = [];
    render(<Stack log={log} />);
    act(() => screen.getByText('Play').click());
    await act(async () => {
      history.go(-2);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(log).toEqual(['player', 'detail']);
  });

  it('closing the player by its button keeps the detail and its entry', async () => {
    render(<Stack />);
    act(() => screen.getByText('Play').click());
    act(() => screen.getByText('Close player').click());
    await waitFor(() => expect(depth()).toBe(1));
    expect(screen.getByRole('dialog', { name: 'detail', hidden: true })).toBeInTheDocument();
  });

  it('a layer opened before the closed one has gone back is not closed by that Back', async () => {
    render(<Stack />);
    // Reopened once the close fired, before its Back has landed.
    act(() => screen.getByText('Close detail').click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    act(() => screen.getByText('Open').click());
    expect(depth()).toBe(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole('dialog', { name: 'detail', hidden: true })).toBeInTheDocument();
    expect(depth()).toBe(1);
    await back();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('hands the entry of a layer unmounted without closing to the next one', () => {
    const push = vi.spyOn(history, 'pushState');
    const { rerender } = render(<Layer name="sheet" onClose={() => undefined} />);
    rerender(<p>switching tabs</p>);
    rerender(<Layer name="detail" onClose={() => undefined} />);
    expect(depth()).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('two closes in a row before the first Back lands leave no stale entry', async () => {
    render(<Stack />);
    act(() => screen.getByText('Play').click());
    act(() => screen.getByText('Close player').click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => screen.getByText('Close detail').click());
    await waitFor(() => expect(depth()).toBe(0));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(depth()).toBe(0);
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('Forward onto a closed layer entry goes straight back to the catalog', async () => {
    render(<Stack />);
    await back();
    await act(async () => {
      history.forward();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(depth()).toBe(0);
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });
});
