import type { CSSProperties } from "react";
import {
  Backpack,
  Banknote,
  BillList,
  Bolt,
  Book,
  Box,
  Broom,
  Buildings,
  Bus,
  Calculator,
  Card,
  CardReceive,
  CartLargeMinimalistic,
  Case,
  ChefHat,
  Clapperboard,
  Cosmetic,
  Cup,
  CupHot,
  Delivery,
  Devices,
  Dollar,
  DonutBitten,
  Dumbbell,
  Fuel,
  Garage,
  GasStation,
  Gift,
  Global,
  GraphUp,
  Heart,
  Home,
  Hospital,
  Key,
  Laptop,
  MagicStick3,
  MapPoint,
  MenuDots,
  Paw,
  Pill,
  Settings,
  ShieldCheck,
  Sledgehammer,
  Smartphone,
  SquareAcademicCap,
  Star,
  Stethoscope,
  TShirt,
  Tv,
  WalletMoney,
  Waterdrop,
} from "@solar-icons/react";
import type { LucideIcon } from "@/components/flowstate/solarIcons";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  backpack: Backpack,
  banknote: Banknote,
  "bill-list": BillList,
  bolt: Bolt,
  book: Book,
  box: Box,
  broom: Broom,
  buildings: Buildings,
  bus: Bus,
  calculator: Calculator,
  card: Card,
  "card-receive": CardReceive,
  cart: CartLargeMinimalistic,
  case: Case,
  "chef-hat": ChefHat,
  clapperboard: Clapperboard,
  cosmetic: Cosmetic,
  cup: Cup,
  "cup-hot": CupHot,
  delivery: Delivery,
  devices: Devices,
  dollar: Dollar,
  donut: DonutBitten,
  dumbbell: Dumbbell,
  fuel: Fuel,
  garage: Garage,
  "gas-station": GasStation,
  gift: Gift,
  global: Global,
  "graph-up": GraphUp,
  hammer: Sledgehammer,
  heart: Heart,
  home: Home,
  hospital: Hospital,
  key: Key,
  laptop: Laptop,
  "map-point": MapPoint,
  more: MenuDots,
  paw: Paw,
  pill: Pill,
  settings: Settings,
  shield: ShieldCheck,
  shirt: TShirt,
  smartphone: Smartphone,
  "academic-cap": SquareAcademicCap,
  star: Star,
  stethoscope: Stethoscope,
  tv: Tv,
  "wallet-money": WalletMoney,
  waterdrop: Waterdrop,

  // Backward compatibility for categories saved before the catalog migration.
  Briefcase: Case,
  Laptop,
  TrendingUp: GraphUp,
  Gift,
  Plus: MagicStick3,
  Utensils: ChefHat,
  Car: MapPoint,
  ShoppingBag: CartLargeMinimalistic,
  Film: Clapperboard,
  Zap: Bolt,
  Monitor: Devices,
  Heart,
  GraduationCap: SquareAcademicCap,
  Home,
  Wallet: WalletMoney,
  DollarSign: Dollar,
  Tag: MenuDots,
  MoreHorizontal: MenuDots,
};

function isEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value);
}

interface CategoryIconProps {
  icon?: string | null;
  color?: string;
  className?: string;
  containerClassName?: string;
  style?: CSSProperties;
}

export function CategoryIcon({
  icon,
  color = "currentColor",
  className,
  containerClassName,
  style,
}: CategoryIconProps) {
  const key = icon || "more";
  if (isEmoji(key)) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex items-center justify-center text-base leading-none", containerClassName)}
        style={style}
      >
        {key}
      </span>
    );
  }

  const Icon = ICONS[key] || MenuDots;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex items-center justify-center", containerClassName)}
      style={style}
    >
      <Icon className={cn("h-4 w-4", className)} style={{ color }} weight="Linear" />
    </span>
  );
}

export const CATEGORY_ICON_OPTIONS = [
  "cart", "chef-hat", "cup-hot", "donut", "home", "buildings", "bolt", "waterdrop",
  "gas-station", "global", "smartphone", "tv", "fuel", "map-point", "bus", "garage",
  "settings", "key", "broom", "shirt", "devices", "cosmetic", "gift", "hospital",
  "pill", "stethoscope", "dumbbell", "shield", "academic-cap", "book", "laptop",
  "clapperboard", "paw", "card", "bill-list", "calculator", "case", "graph-up",
  "wallet-money", "more",
] as const;
