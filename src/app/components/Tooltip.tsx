"use client";

import React from "react";
import clsx from "clsx";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** Primary explanation shown inside the tooltip */
  content: string;
  /** Optional bold heading shown above the description */
  title?: string;
  /** Optional keyboard shortcut badge (e.g. "F2", "⌘K") */
  shortcut?: string;
  /** Preferred placement relative to the trigger element */
  placement?: TooltipPlacement;
  /** Child element(s) wrapped by the tooltip trigger */
  children: React.ReactNode;
  /** Optional wrapper className */
  className?: string;
  /** Render inline-flex wrapper (default) or block */
  asBlock?: boolean;
}

/**
 * Declarative Tooltip wrapper that integrates with GlobalTooltipLayer
 * and automatically respects the user's Settings -> Feature Tooltips toggle.
 */
export function Tooltip({
  content,
  title,
  shortcut,
  placement = "top",
  children,
  className,
  asBlock = false,
}: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <span
      data-tooltip={content}
      data-tooltip-title={title}
      data-tooltip-shortcut={shortcut}
      data-tooltip-placement={placement}
      className={clsx(asBlock ? "block" : "inline-flex items-center", className)}
    >
      {children}
    </span>
  );
}
