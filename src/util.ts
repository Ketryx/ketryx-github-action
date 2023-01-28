export function hasProperty<T, K extends string>(
  o: T,
  k: K
): o is T & Record<K, unknown> {
  return typeof o === 'object' && k in o;
}
