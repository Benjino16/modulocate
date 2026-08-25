import { useRef } from "react";
import { useRouter } from "@tanstack/react-router";

type SetId = (id: string | undefined, opts: { push: boolean }) => void;

// Drives a dialog's open state from a URL search param instead of local
// useState, so that (a) the browser back button closes the dialog — it's
// just popping the history entry `open()` pushed — and (b) copying the URL
// while the dialog is open shares a link straight to it.
//
// `open()` pushes a new history entry; explicit closes (Save, Escape,
// overlay click) pop back to it via router.history.back() so the stack
// doesn't grow. If the dialog was reached by deep link/reload instead of a
// same-session open() call, there's no "our" entry to pop back to, so the
// fallback replaces the param away instead.
export function useDialogSearchParam(id: string | undefined, setId: SetId) {
  const router = useRouter();
  const openedByUsRef = useRef(false);

  function open(id: string) {
    openedByUsRef.current = true;
    setId(id, { push: true });
  }

  function onOpenChange(next: boolean) {
    if (next) return;
    if (openedByUsRef.current) {
      openedByUsRef.current = false;
      router.history.back();
    } else {
      setId(undefined, { push: false });
    }
  }

  return { isOpen: id !== undefined, open, onOpenChange };
}
