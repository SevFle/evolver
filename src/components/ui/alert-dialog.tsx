"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

function AlertDialog({ children, open: controlledOpen, onOpenChange }: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const handleOpenChange = onOpenChange ?? setInternalOpen;

  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

function AlertDialogTrigger({ children, className }: {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  return (
    <button className={className} onClick={() => onOpenChange(true)} type="button">
      {children}
    </button>
  );
}

function AlertDialogOverlay() {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80"
      onClick={() => onOpenChange(false)}
    />
  );
}

function AlertDialogContent({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, onOpenChange } = React.useContext(AlertDialogContext);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <AlertDialogOverlay />
      <div
        role="alertdialog"
        className={cn(
          "relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          <span className="sr-only">Close</span>
          &times;
        </button>
      </div>
    </div>,
    document.body,
  );
}

function AlertDialogHeader({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col space-y-2", className)}>{children}</div>;
}

function AlertDialogTitle({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>;
}

function AlertDialogDescription({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

function AlertDialogFooter({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-4 flex justify-end gap-2", className)}>{children}</div>
  );
}

function AlertDialogAction({ children, className, onClick }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
        className,
      )}
      onClick={() => {
        onClick?.();
        onOpenChange(false);
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function AlertDialogCancel({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  const { onOpenChange } = React.useContext(AlertDialogContext);
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={() => onOpenChange(false)}
      type="button"
    >
      {children}
    </button>
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
};
