import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shortCompanyId } from "@/lib/billing/format";

type CopyCompanyIdButtonProps = {
  companyId: string;
  label?: string;
};

export function CopyCompanyIdButton({ companyId, label }: CopyCompanyIdButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 font-mono text-xs" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? shortCompanyId(companyId)}
    </Button>
  );
}
