"use client";

/**
 * Reusable confirmation dialog component.
 *
 * Replaces the native browser confirm() and prompt() with a professional
 * styled AlertDialog. Used across admin, team, tasks, funding, and other
 * views for destructive actions (delete, revoke, remove, suspend, etc.).
 *
 * Usage:
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({
 *     title: "Delete user?",
 *     description: "This will anonymize their PII and revoke all access.",
 *     confirmText: "Delete",
 *     variant: "destructive",
 *   });
 *   if (ok) { ... }
 *
 *   // With input (replaces prompt()):
 *   const result = await confirm({
 *     title: "Reason for suspension",
 *     description: "Enter an optional reason.",
 *     input: true,
 *     inputPlaceholder: "Reason…",
 *     confirmText: "Suspend",
 *     variant: "destructive",
 *   });
 *   if (ok) { console.log(result.value); }
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Trash2, ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "warning";
  input?: boolean;
  inputPlaceholder?: string;
  inputValue?: string;
};

type ConfirmResult = { ok: boolean; value?: string };

type ConfirmContextType = {
  confirm: (opts: ConfirmOptions) => Promise<ConfirmResult>;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmDialogProvider>");
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [resolver, setResolver] = useState<((r: ConfirmResult) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<ConfirmResult> => {
    setOpts(options);
    setInputVal(options.inputValue ?? "");
    setOpen(true);
    return new Promise<ConfirmResult>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolver?.({ ok: true, value: opts?.input ? inputVal : undefined });
    setResolver(null);
    setOpts(null);
  };

  const handleCancel = () => {
    setOpen(false);
    resolver?.({ ok: false });
    setResolver(null);
    setOpts(null);
  };

  const variant = opts?.variant ?? "default";
  const icon =
    variant === "destructive" ? <Trash2 className="h-6 w-6 text-destructive" /> :
    variant === "warning" ? <ShieldAlert className="h-6 w-6 text-amber-500" /> :
    <Info className="h-6 w-6 text-primary" />;

  const actionClass =
    variant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : variant === "warning"
      ? "bg-amber-600 text-white hover:bg-amber-700"
      : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                variant === "destructive" && "bg-destructive/10",
                variant === "warning" && "bg-amber-500/10",
                variant === "default" && "bg-primary/10",
              )}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <AlertDialogTitle className="text-base">{opts?.title}</AlertDialogTitle>
                {opts?.description && (
                  <AlertDialogDescription className="text-sm mt-1 whitespace-pre-wrap">
                    {opts.description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>
          {opts?.input && (
            <Input
              autoFocus
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={opts.inputPlaceholder}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {opts?.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(actionClass)}
            >
              {opts?.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
