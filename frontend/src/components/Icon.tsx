import {
  Bird,
  Box,
  Boxes,
  Flower2,
  GraduationCap,
  Grid3x3,
  Hexagon,
  PawPrint,
  Plane,
  Smile,
  Square,
  Zap,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "graduation-cap": GraduationCap,
  square: Square,
  "paw-print": PawPrint,
  bird: Bird,
  "flower-2": Flower2,
  box: Box,
  plane: Plane,
  zap: Zap,
  smile: Smile,
  boxes: Boxes,
  "grid-3x3": Grid3x3,
  hexagon: Hexagon,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const I = CATEGORY_ICONS[name] ?? Square;
  return <I className={className ?? "h-4 w-4"} aria-hidden />;
}
