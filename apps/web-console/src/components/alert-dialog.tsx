import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";

interface AlertDialogContextValue {
  open: boolean;
  present: boolean;
  closing: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext(): AlertDialogContextValue {
  const context = useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialog components must be used within AlertDialog");
  }
  return context;
}

export function AlertDialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
      return;
    }

    if (!present) {
      return;
    }

    setClosing(true);
    const timer = window.setTimeout(() => {
      setPresent(false);
      setClosing(false);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [open, present]);

  useEffect(() => {
    if (!present) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [present]);

  const value = useMemo(
    () => ({ open, present, closing, onOpenChange, titleId, descriptionId }),
    [closing, descriptionId, onOpenChange, open, present, titleId]
  );

  return (
    <AlertDialogContext.Provider value={value}>{children}</AlertDialogContext.Provider>
  );
}

export function AlertDialogPortal({ children }: { children: ReactNode }) {
  const { present } = useAlertDialogContext();

  if (!present || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

export function AlertDialogOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { closing } = useAlertDialogContext();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm",
        closing ? "animate-overlay-out" : "animate-overlay-in",
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { open, closing, onOpenChange, titleId, descriptionId } = useAlertDialogContext();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTarget =
      contentRef.current?.querySelector<HTMLButtonElement>("[data-alert-dialog-primary]") ??
      contentRef.current?.querySelector<HTMLButtonElement>("button");

    focusTarget?.focus();
  }, [open]);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={contentRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn(
            "huha-surface-strong w-full max-w-lg rounded-3xl border border-border p-6 shadow-panel",
            closing ? "animate-modal-out" : "animate-modal-in",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-left", className)} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-wrap justify-end gap-2", className)} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useAlertDialogContext();
  return <h2 id={titleId} className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useAlertDialogContext();
  return (
    <p id={descriptionId} className={cn("text-sm leading-6 text-muted", className)} {...props} />
  );
}

export function AlertDialogAction({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      data-alert-dialog-primary="true"
      className={cn(
        "rounded-2xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-70",
        className
      )}
      onClick={onClick}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onOpenChange } = useAlertDialogContext();

  return (
    <button
      type="button"
      className={cn(
        "rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-70",
        className
      )}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      }}
    />
  );
}
