"use client";

import React from "react";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export function Tooltip({
  content,
  title,
  shortcut,
  placement = "top",
  children,
}: {
  content: string;
  title?: string;
  shortcut?: string;
  placement?: TooltipPlacement;
  children: React.ReactElement;
}) {
  return (
    <span
      className="inline-flex"
      data-tooltip={content}
      data-tooltip-title={title}
      data-tooltip-shortcut={shortcut}
      data-tooltip-placement={placement}
    >
      {children}
    </span>
  );
}

