// In-memory fixed-window counters. Enough for one server process; counts reset
// when the server restarts. Keys combine the route with the client address and,
// for sign-in, the email, so one person guessing passwords is slowed per account
// and per address.
export function createRateLimiter({ now = () => Date.now() } = {}) {
  const windows = new Map();
  let checks = 0;
  return {
    /** true when the call is allowed; false when the limit is reached. */
    take(key, limit, windowMs) {
      const t = now();
      if (++checks % 1000 === 0) for (const [k, w] of windows) if (w.reset <= t) windows.delete(k);
      const current = windows.get(key);
      if (!current || current.reset <= t) {
        windows.set(key, { count: 1, reset: t + windowMs });
        return true;
      }
      if (current.count >= limit) return false;
      current.count++;
      return true;
    },
    reset(key) {
      windows.delete(key);
    },
  };
}
