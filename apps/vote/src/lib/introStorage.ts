// Per-student, not per-browser-session (contrast with the old sessionStorage
// "fresh login" flag this replaced): a shared school computer can see
// several students take the survey back to back in the same browser tab,
// and a single student's own session can outlive a browser restart (the
// session cookie lasts 7 days, sessionStorage doesn't) — neither should let
// one student's progress skip or hide another's welcome/rule screens.
function introSeenKey(studentId: string) {
  return `modulocate:vote:intro-seen:${studentId}`;
}

export function hasSeenIntro(studentId: string): boolean {
  try {
    return localStorage.getItem(introSeenKey(studentId)) === "1";
  } catch {
    // Storage unavailable (e.g. private browsing): don't block the page over it.
    return true;
  }
}

export function markIntroSeen(studentId: string) {
  try {
    localStorage.setItem(introSeenKey(studentId), "1");
  } catch {
    // ignore
  }
}
