import { useEffect, useRef } from "react";
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
  displayScheduleLabel: string | null;
  categoryNames: string[];
  description: string | null;
};

export function ModuleInfoDialog({
  module,
  onOpenChange,
}: {
  module: ModuleInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Switching to a different module (without the dialog ever unmounting in
  // between) would otherwise leave the previous module's scroll position
  // stuck on screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [module?.id]);

  const meta = [module?.displayScheduleLabel, module?.categoryNames.join(", ") || null, module?.teacher]
    .filter(Boolean)
    .join(" • ");

  return (
    <Dialog open={module !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(85vh,660px)] w-[min(94vw,440px)] max-w-none gap-0 overflow-hidden rounded-3xl p-0 shadow-2xl"
      >
        <DialogClose className="absolute top-3.5 right-3.5 z-20 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <X className="size-4" />
          <span className="sr-only">Schließen</span>
        </DialogClose>

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="sticky top-0 z-10 border-b bg-background/95 pt-9 pr-14 pb-4 pl-[22px] backdrop-blur-sm">
            <DialogTitle className="text-xl leading-tight font-extrabold text-foreground">
              {module?.name}
            </DialogTitle>
            {meta && <p className="mt-1.5 text-[13px] text-muted-foreground">{meta}</p>}
          </div>

          <div
            className="px-[22px] pt-4 pb-[30px] text-[14.5px] leading-[1.65] text-foreground
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
