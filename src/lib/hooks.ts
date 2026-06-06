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
  factory: (signal: AbortSignal) => Promise<T>,
  deps: unknown[]
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    factory(controller.signal)
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
  return useAsync((signal) => {
    if (!slug) throw new Error("missing show slug");
    return fetchShow(slug).then((v) => {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      return v;
    });
  }, [slug]);
}

export function useStream(id: string | null): State<StreamItem> {
  return useAsync((signal) => {
    if (!id) throw new Error("missing channel id");
    return fetchStream(id).then((v) => {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      return v;
    });
  }, [id]);
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
