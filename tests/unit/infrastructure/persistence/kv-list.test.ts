import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import { pagedKvList } from '../../../../src/infrastructure/persistence/kv-list.js';

type Metadata = { asOfRound: number };

interface KvPage {
  keys: Array<{ name: string; metadata?: Metadata }>;
  list_complete: boolean;
  cursor?: string;
}

function makeKv(pages: KvPage[]): { kv: KVNamespace; get: ReturnType<typeof vi.fn> } {
  let i = 0;
  const get = vi.fn();
  const list = vi.fn(async () => {
    if (i >= pages.length) throw new Error('no more pages');
    return pages[i++];
  });
  const kv = { list, get } as unknown as KVNamespace;
  return { kv, get };
}

describe('pagedKvList', () => {
  it('walks a single page with list_complete: true', async () => {
    const { kv } = makeKv([
      {
        keys: [
          { name: 'a', metadata: { asOfRound: 1 } },
          { name: 'b', metadata: { asOfRound: 2 } },
          { name: 'c', metadata: { asOfRound: 3 } },
        ],
        list_complete: true,
      },
    ]);
    const transform = vi.fn((key: string, meta: Metadata | undefined) =>
      meta ? ([key, meta.asOfRound] as const) : null,
    );
    const out = await pagedKvList<Metadata, readonly [string, number]>({
      kv,
      prefix: 'p:',
      transform,
    });
    expect(out).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(transform).toHaveBeenCalledTimes(3);
  });

  it('walks across multiple pages via cursor', async () => {
    const { kv } = makeKv([
      {
        keys: [{ name: 'a', metadata: { asOfRound: 1 } }],
        list_complete: false,
        cursor: 'c1',
      },
      {
        keys: [{ name: 'b', metadata: { asOfRound: 2 } }],
        list_complete: false,
        cursor: 'c2',
      },
      {
        keys: [{ name: 'c', metadata: { asOfRound: 3 } }],
        list_complete: true,
      },
    ]);
    const out = await pagedKvList<Metadata, [string, number]>({
      kv,
      prefix: 'p:',
      transform: (key, meta) => (meta ? [key, meta.asOfRound] : null),
    });
    expect(out).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('terminates defensively on falsy cursor with list_complete: false', async () => {
    const { kv } = makeKv([
      {
        keys: [{ name: 'a', metadata: { asOfRound: 1 } }],
        list_complete: false,
        cursor: '',
      },
    ]);
    const out = await pagedKvList<Metadata, [string, number]>({
      kv,
      prefix: 'p:',
      transform: (key, meta) => (meta ? [key, meta.asOfRound] : null),
    });
    expect(out).toEqual([['a', 1]]);
  });

  it('drops entries for which transform returns null', async () => {
    const { kv } = makeKv([
      {
        keys: [
          { name: 'a', metadata: { asOfRound: 1 } },
          { name: 'b' }, // no metadata → transform returns null
          { name: 'c', metadata: { asOfRound: 3 } },
        ],
        list_complete: true,
      },
    ]);
    const out = await pagedKvList<Metadata, [string, number]>({
      kv,
      prefix: 'p:',
      transform: (key, meta) => (meta ? [key, meta.asOfRound] : null),
    });
    expect(out).toEqual([
      ['a', 1],
      ['c', 3],
    ]);
  });

  it('returns [] for an empty page', async () => {
    const { kv } = makeKv([{ keys: [], list_complete: true }]);
    const transform = vi.fn((_k: string, _m: Metadata | undefined) => null);
    const out = await pagedKvList<Metadata, string>({
      kv,
      prefix: 'p:',
      transform,
    });
    expect(out).toEqual([]);
    expect(transform).not.toHaveBeenCalled();
  });

  it('types metadata as M for the transform callback (compile-time)', async () => {
    const { kv } = makeKv([{ keys: [], list_complete: true }]);
    await pagedKvList<Metadata, [string, number]>({
      kv,
      prefix: 'p:',
      transform: (key, meta) => {
        expectTypeOf(key).toEqualTypeOf<string>();
        expectTypeOf(meta).toEqualTypeOf<Metadata | undefined>();
        return null;
      },
    });
  });

  it('never calls kv.get', async () => {
    const { kv, get } = makeKv([
      {
        keys: [{ name: 'a', metadata: { asOfRound: 1 } }],
        list_complete: true,
      },
    ]);
    await pagedKvList<Metadata, [string, number]>({
      kv,
      prefix: 'p:',
      transform: (key, meta) => (meta ? [key, meta.asOfRound] : null),
    });
    expect(get).not.toHaveBeenCalled();
  });
});
