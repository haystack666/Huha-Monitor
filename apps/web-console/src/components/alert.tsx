import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

type AlertVariant = "default" | "destructive" | "success";

const alertVariantClassName: Record<AlertVariant, string> = {
  default: "border-border bg-card/90 text-foreground",
  destructive: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success"
};

export function Alert({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-2xl border px-4 py-3 text-sm",
        alertVariantClassName[variant],
        className
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn("mb-1 font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm leading-6 [&_p]:leading-6", className)} {...props} />;
}
