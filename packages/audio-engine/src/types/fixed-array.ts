// export type FixedArray<
//   T,
//   N extends number,
//   R extends T[] = [],
// > = R['length'] extends N ? R : FixedArray<T, N, [...R, T]>;

/**
 * A type representing an array with a fixed length `N`.
 * Combines a tuple type of length `N` with a regular array type `T[]`.
 */
export type FixedArray<T, N extends number> = FixedArrayInternal<T, N> & T[];

type FixedArrayInternal<
  T,
  N extends number,
  R extends T[] = [],
> = R['length'] extends N ? R : FixedArrayInternal<T, N, [...R, T]>;

export type BuildIndices<
  N extends number,
  R extends number[] = [],
> = R['length'] extends N ? R[number] : BuildIndices<N, [...R, R['length']]>;
