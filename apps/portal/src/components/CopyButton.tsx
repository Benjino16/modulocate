import { useState } from "react";
import { Check } from "lucide-react";

export function CopyButton({ value, label, icon: Icon }: { value: string; label: string; icon: typeof Check }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
    </button>
  );
}
