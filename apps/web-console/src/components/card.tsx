import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card/95 p-6 shadow-panel backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}

