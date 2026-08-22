import { Button } from "@modulocate/ui/components/button";

// Full-page step shown before the survey (welcome text, then the student's
// rule text) — deliberately not a dialog, per the user's ask, and reusing the
// same big bottom button as the final "Wahl abschicken" step so the whole
// flow reads as one continuous action.
export function IntroScreen({
  title,
  html,
  buttonLabel,
  onContinue,
}: {
  title: string;
  html: string;
  buttonLabel: string;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6 pb-28">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div
        className="text-[15px] leading-[1.65] text-foreground
          [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-base [&_h4]:font-bold [&_h4]:first:mt-0
          [&_p]:my-0 [&_p]:mb-3.5 [&_p]:last:mb-0
          [&_ul]:my-0 [&_ul]:mb-3.5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button size="lg" className="w-full max-w-sm text-base" onClick={onContinue}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
