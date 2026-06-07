"use client";

import { useEffect, useState } from "react";
import {
  fetchByIds,
  fetchList,
  fetchMeta,
  fetchSearch,
  fetchShow,
  fetchShows,
  fetchStream,
  type CatalogItem,
  type CatalogMeta,
  type ListOpts,
  type ListResult,
  type SearchResults,
  type ShowDetail,
  type ShowItem,
  type SortMode,
  type StreamItem,
} from "./catalog-client";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function useAsync<T>(
  factory: ((signal: AbortSignal) => Promise<T>) | null,
  deps: unknown[]
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: factory !== null,
    error: null,
  });
  useEffect(() => {
    // No-op when the caller signals "nothing to fetch yet" by passing null.
    if (factory === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    // Catch BOTH synchronous throws inside the factory and async rejections.
    Promise.resolve()
      .then(() => factory(controller.signal))
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err?.name === "AbortError") return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useMeta(): State<CatalogMeta> {
  return useAsync((signal) => fetchMeta().then((v) => {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return v;
  }), []);
}

export function useList(opts: ListOpts): State<ListResult<CatalogItem>> {
  const key = JSON.stringify(opts);
  return useAsync((signal) => fetchList(opts, signal), [key]);
}

export function useShows(opts: {
  french?: boolean;
  q?: string;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
}): State<ListResult<ShowItem>> {
  const key = JSON.stringify(opts);
  return useAsync((signal) => fetchShows(opts, signal), [key]);
}

export function useShow(slug: string | null): State<ShowDetail> {
  // Pass a null factory when slug is missing so useAsync just stays idle
  // instead of throwing (which would crash the React tree on a live channel
  // whose `showSlug` is legitimately null).
  return useAsync(
    slug
      ? (signal) =>
          fetchShow(slug).then((v) => {
            if (signal.aborted) throw new DOMException("aborted", "AbortError");
            return v;
          })
      : null,
    [slug]
  );
}

export function useStream(id: string | null): State<StreamItem> {
  return useAsync(
    id
      ? (signal) =>
          fetchStream(id).then((v) => {
            if (signal.aborted) throw new DOMException("aborted", "AbortError");
            return v;
          })
      : null,
    [id]
  );
}

export function useSearch(q: string, limit = 20): State<SearchResults> {
  return useAsync((signal) => fetchSearch(q, limit).then((v) => {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return v;
  }), [q, limit]);
}

export function useChannelsByIds(ids: string[]): State<CatalogItem[]> {
  const key = ids.join(",");
  return useAsync(() => fetchByIds(ids), [key]);
}
