import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

export function useAlgoTopQuery<TData>(
  options: UseQueryOptions<TData, Error, TData, readonly unknown[]>,
) {
  return useQuery<TData, Error, TData, readonly unknown[]>(options);
}
