'use client';
import * as React from 'react';
import { tagModules } from '@/lib/apriltag';

/** High-contrast tag36h11 marker as crisp SVG. The white ring is the required quiet zone. */
export const AprilTag = React.memo(function AprilTag({ id, className, title }: { id: number; className?: string; title?: string }) {
  const grid = React.useMemo(() => tagModules(id), [id]);
  const rects: React.ReactNode[] = [];
  grid.forEach((row, y) =>
    row.forEach((white, x) => {
      if (!white) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
    }),
  );
  return (
    <svg viewBox="0 0 10 10" className={className} shapeRendering="crispEdges" role="img" aria-label={title ?? `Check-In Tag ${id}`}>
      <rect width="10" height="10" fill="#fff" />
      <g fill="#000">{rects}</g>
    </svg>
  );
});
