import { createRootRoute, stripSearchParams, useNavigate, useSearch as useRouterSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { searchDefaults, searchSchema, type Search } from "./search";

export const rootRoute = createRootRoute({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(searchDefaults)] },
});

export const useSearch = (): Search => useRouterSearch({ from: rootRoute.id }) as Search;

/** Merge a patch into the URL search params (replacing history so sliders don't flood it). */
export function useSetSearch() {
  const navigate = useNavigate();
  return useCallback(
    (patch: Partial<Search>, opts: { push?: boolean } = {}) =>
      navigate({ to: ".", search: ((prev: Search) => ({ ...prev, ...patch })) as never, replace: !opts.push }),
    [navigate],
  );
}
