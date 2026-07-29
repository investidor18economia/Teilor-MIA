import { useCallback, useId, useState } from "react";

/**
 * @param {{ label: string, value: string, x: number, y: number }} props
 */
function FounderTooltip({ label, value, x, y, visible }) {
  if (!visible) return null;
  const clampedX = Math.max(8, Math.min(x, 92));
  const clampedY = Math.max(8, Math.min(y, 88));
  return (
    <div
      className="founder-chart-tooltip"
      role="tooltip"
      style={{ left: `${clampedX}%`, top: `${clampedY}%` }}
    >
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

export { FounderTooltip };
