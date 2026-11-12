"use client";
import { useEffect } from "react";
import type { VinylRecord } from "@/lib/db";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="sheet-up max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-3 font-display text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-accent-ink",
    secondary: "bg-surface-2 text-ink border border-line",
    ghost: "text-ink",
    danger: "text-accent border border-accent/40",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-line bg-bg px-3 text-[16px] text-ink placeholder:text-muted focus:border-accent focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Cover({ record, size = 48 }: { record?: Pick<VinylRecord, "coverUrl" | "artist" | "title">; size?: number }) {
  if (record?.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={record.coverUrl} alt="" width={size} height={size} className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />;
  }
  // A plain record label as a placeholder.
  return (
    <div className="grid shrink-0 place-items-center rounded-md bg-surface-2" style={{ width: size, height: size }}>
      <div className="grid place-items-center rounded-full bg-[#1d1a18]" style={{ width: size * 0.82, height: size * 0.82 }}>
        <div className="rounded-full bg-accent" style={{ width: size * 0.3, height: size * 0.3 }} />
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spin-slow inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
