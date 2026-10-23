import { CSSProperties } from 'react';

const GOLDEN_ANGLE = 137.508;

export function getCollectionColorStyles(colorIndex: number | undefined | null): {
  icon: CSSProperties;
  label: CSSProperties;
  sidebar: CSSProperties;
} {
  const safeIndex = Number.isInteger(colorIndex) && Number(colorIndex) >= 0
    ? Number(colorIndex)
    : 0;
  const hue = (safeIndex * GOLDEN_ANGLE) % 360;
  const color = `hsl(${hue} 68% 48%)`;

  return {
    icon: {
      backgroundColor: `hsl(${hue} 68% 48% / 0.16)`,
      color,
    },
    label: {
      backgroundColor: `hsl(${hue} 68% 48% / 0.08)`,
      borderColor: `hsl(${hue} 68% 48% / 0.28)`,
      color,
    },
    sidebar: {
      backgroundColor: `hsl(${hue} 68% 48% / 0.16)`,
      borderColor: `hsl(${hue} 68% 48% / 0.32)`,
      color,
    },
  };
}

export const GENERAL_COLLECTION_STYLE = {
  icon: {
    backgroundColor: 'rgb(148 163 184 / 0.16)',
    color: 'rgb(100 116 139)',
  },
  label: {
    backgroundColor: 'rgb(148 163 184 / 0.08)',
    borderColor: 'rgb(148 163 184 / 0.28)',
    color: 'rgb(71 85 105)',
  },
};
