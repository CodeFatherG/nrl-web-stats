/**
 * Shared cursor-paged KV list walker.
 *
 * Centralises the `for (;;) { kv.list({ cursor }) }` loop previously
 * duplicated across every KV-backed adapter's coverage-probe / list method.
 * See `specs/041-kv-envelope-extraction/contracts/kv-list.md`.
 */

/**
 * Walk every entry under `prefix` using KV's cursor pagination, invoking
 * `transform(key, metadata)` for each. Entries for which `transform` returns
 * `null` are dropped. Returns the concatenated, non-null results.
 *
 * The helper never calls `kv.get` — it iterates `kv.list` only, mirroring
 * existing coverage-probe behaviour.
 */
export async function pagedKvList<M, R>(args: {
  kv: KVNamespace;
  prefix: string;
  transform: (key: string, metadata: M | undefined) => R | null;
}): Promise<R[]> {
  const out: R[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await args.kv.list<M>({ prefix: args.prefix, cursor });
    for (const entry of page.keys) {
      const mapped = args.transform(entry.name, entry.metadata);
      if (mapped !== null) out.push(mapped);
    }
    if (page.list_complete) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return out;
}
