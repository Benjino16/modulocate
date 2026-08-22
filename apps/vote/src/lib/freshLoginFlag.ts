// Marks that the current /vote load followed directly from the emailed
// link's ?code=... auto-login (see login.tsx) — deliberately not set for the
// manual-code-entry fallback, since that's a "lost my session" recovery, not
// a fresh open. Session-scoped (not localStorage): it should only survive the
// single /login -> /vote navigation, not the student's next visit in a new
// tab or after closing the browser.
const KEY = "modulocate:vote:fresh-login";

export function markFreshLogin() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // ignore — worst case the greeting/intro screens just don't show
  }
}

// Pure read, safe to call more than once (e.g. React StrictMode's double
// state-initializer invocation in dev) — pair with clearFreshLoginFlag()
// rather than folding the removal into this call.
export function hasFreshLoginFlag(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// Idempotent — safe to call from an effect that may run twice under
// StrictMode.
export function clearFreshLoginFlag() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
