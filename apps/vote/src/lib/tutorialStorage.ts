const TUTORIAL_VERSION = "v1";

function tutorialSeenKey(studentId: string) {
  return `modulocate:vote:tutorial-seen:${TUTORIAL_VERSION}:${studentId}`;
}

export function hasSeenTutorial(studentId: string) {
  try {
    return localStorage.getItem(tutorialSeenKey(studentId)) === "1";
  } catch {
    // Storage unavailable (e.g. private browsing): don't block the page over it.
    return true;
  }
}

export function markTutorialSeen(studentId: string) {
  try {
    localStorage.setItem(tutorialSeenKey(studentId), "1");
  } catch {
    // ignore
  }
}
