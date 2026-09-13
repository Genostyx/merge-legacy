/** Only the action which acquired the lock may release it. */
export async function withInputRecovery(
  action: (setLocked: (locked: boolean) => void) => Promise<void>,
  setLocked: (locked: boolean) => void,
  onError: (error: unknown) => void
): Promise<void> {
  let ownsLock = false;
  try {
    await action((locked) => { ownsLock = locked; setLocked(locked); });
  } catch (error) {
    onError(error);
  } finally {
    if (ownsLock) setLocked(false);
  }
}
