import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@modulocate/ui/components/dialog";

type ModuleInfo = {
  id: string;
  name: string;
  teacher: string | null;
  scheduleLabel: string | null;
  description: string | null;
};

// Distance (px) the header collapses over before the title has fully
// shrunk onto the dark banner — matches the reference design.
const COLLAPSE_RANGE = 60;

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

// Cross-fades a CSS color pair via oklch mixing so the header background and
// title/meta text slide smoothly from the light "card" state to the dark
// "banner" state as the user scrolls, instead of snapping at a threshold.
function mix(from: string, to: string, progress: number) {
  return `color-mix(in oklch, ${from} ${Math.round((1 - progress) * 100)}%, ${to})`;
}

export function ModuleInfoDialog({
  module,
  onOpenChange,
}: {
  module: ModuleInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // `progress` lives here in the parent, not in DialogContent, so switching
  // to a different module (without the dialog ever unmounting in between)
  // would otherwise leave the previous module's scroll position — and its
  // collapsed dark header — stuck on screen.
  useEffect(() => {
    setProgress(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [module?.id]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const p = Math.max(0, Math.min(1, e.currentTarget.scrollTop / COLLAPSE_RANGE));
    setProgress(p);
  }

  const meta = [module?.scheduleLabel, module?.teacher].filter(Boolean).join(" · ");

  return (
    <Dialog open={module !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(85vh,660px)] w-[min(94vw,440px)] max-w-none gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl"
      >
        <DialogClose className="absolute top-3.5 right-3.5 z-20 flex size-8 items-center justify-center rounded-full bg-[oklch(0.94_0.004_250)] text-[oklch(0.3_0.01_250)] transition-colors hover:bg-[oklch(0.88_0.004_250)]">
          <X className="size-4" />
          <span className="sr-only">Schließen</span>
        </DialogClose>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            className="sticky top-0 z-10 pr-14 pb-4 pl-[22px]"
            style={{
              paddingTop: `${lerp(36, 20, progress)}px`,
              background: mix("#fff", "oklch(0.16 0.01 250)", progress),
            }}
          >
            <DialogTitle
              className="leading-tight font-extrabold"
              style={{
                fontSize: `${lerp(23, 16, progress)}px`,
                color: mix("oklch(0.18 0.01 250)", "#fff", progress),
              }}
            >
              {module?.name}
            </DialogTitle>
            {meta && (
              <p
                className="mt-1.5 text-[13px]"
                style={{ color: mix("oklch(0.45 0.01 250)", "rgba(255,255,255,0.65)", progress) }}
              >
                {meta}
              </p>
            )}
          </div>

          <div
            className="px-[22px] pb-[30px] text-[14.5px] leading-[1.65] text-[oklch(0.28_0.01_250)]
              [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-[15px] [&_h4]:font-bold [&_h4]:first:mt-0
              [&_p]:my-0 [&_p]:mb-3.5 [&_p]:last:mb-0
              [&_ul]:my-0 [&_ul]:mb-3.5 [&_ul]:list-disc [&_ul]:pl-5"
          >
            {module?.description ? (
              <div dangerouslySetInnerHTML={{ __html: module.description }} />
            ) : (
              <p className="text-muted-foreground">Weitere Modulinformationen folgen hier bald.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
