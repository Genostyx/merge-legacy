export function tryWriteSave(
  key: string, payload: unknown,
  storage: () => Pick<Storage, 'setItem'> = () => localStorage
): boolean {
  try {
    storage().setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
