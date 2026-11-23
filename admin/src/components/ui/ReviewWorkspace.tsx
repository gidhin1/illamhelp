"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@illamhelp/ui-web/dialog";
import { Banner, Button } from "./primitives";

export type ReviewDecision = "approved" | "rejected";

export function useReviewWorkspace(queueHeadingId: string, reviewHeadingId: string) {
  const [open, setOpen] = useState(false);
  const returnTarget = useRef<HTMLButtonElement | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);

  useEffect(() => {
    if (!focusRevision) return;

    const target = returnTarget.current;
    if (!open && target?.isConnected && target.getClientRects().length) {
      target.focus();
      return;
    }
    document.getElementById(open ? reviewHeadingId : queueHeadingId)?.focus();
  }, [focusRevision, open, queueHeadingId, reviewHeadingId]);

  return {
    open,
    show(trigger: HTMLButtonElement) {
      returnTarget.current = trigger;
      setOpen(true);
      setFocusRevision((current) => current + 1);
    },
    close() {
      if (open) {
        setOpen(false);
        setFocusRevision((current) => current + 1);
      }
    },
  };
}

export function BackToQueue({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="review-back" onClick={onClick}>
      <ArrowLeft size={16} aria-hidden="true" /> Back to queue
    </Button>
  );
}

export function ReviewReceipt({ children }: { children: React.ReactNode }) {
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => summary.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <div ref={summary} tabIndex={-1}><Banner tone="success">{children}</Banner></div>;
}

export function ReviewConfirmation({ decision, subject, children, busy, onClose, onConfirm }: {
  decision: ReviewDecision | null;
  subject: string;
  children: React.ReactNode;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const rejecting = decision === "rejected";

  return (
    <Dialog open={decision !== null} onClose={() => { if (!busy) onClose(); }} titleId="confirm-review-title">
      <h2 id="confirm-review-title">{rejecting ? "Reject" : "Approve"} {subject}?</h2>
      <div className="stack">{children}</div>
      <div className="review-confirm-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="button" variant={rejecting ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
          Confirm {rejecting ? "rejection" : "approval"}
        </Button>
      </div>
    </Dialog>
  );
}
