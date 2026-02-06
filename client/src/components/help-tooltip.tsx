import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ReactNode } from "react";

interface HelpTooltipProps {
  content: ReactNode;
  testId?: string;
}

export function HelpTooltip({ content, testId }: HelpTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
          data-testid={testId ? `button-help-${testId}` : undefined}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" side="top">
        {content}
      </PopoverContent>
    </Popover>
  );
}
