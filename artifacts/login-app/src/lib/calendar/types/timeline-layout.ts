import type { CSSProperties } from "react";

export type TimelineResourceRef = {
  id: string;
  name: string;
};

export type TimelineEventLayout = {
  eventId: string;
  resourceId: string;
  stackIndex: number;
  stackCount: number;
  leftPercent: number;
  widthPercent: number;
  style: CSSProperties;
};

export type TimelineResourceLaneLayout = {
  resourceId: string;
  resourceName: string;
  stackCount: number;
  laneHeightPx: number;
  events: TimelineEventLayout[];
};

export type TimelineLayoutResult = {
  lanes: TimelineResourceLaneLayout[];
  totalHeightPx: number;
  timeAxisWidthPx: number;
};
