// Tiny pub/sub so screens can tell the feed to reload (e.g. after posting a video).
const listeners = new Set<() => void>();

export const onFeedInvalidated = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const invalidateFeed = () => listeners.forEach((fn) => fn());
