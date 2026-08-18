import type { ComponentType, SVGProps } from "react";
import {
  AddSquare,
  AltArrowLeft,
  AltArrowRight,
  ArrowLeftDown,
  ArrowRightDown,
  ArrowRightUp,
  Bell,
  Bag,
  Bolt,
  Buildings,
  Calendar,
  CalendarDate,
  CalendarMark,
  Card,
  Case,
  Chart2,
  ChatSquare,
  CheckCircle,
  ChefHat,
  Clapperboard,
  CloseCircle,
  DangerTriangle,
  DocumentText,
  Dollar,
  Download as SolarDownload,
  Eye,
  FileSmile,
  FolderOpen as SolarFolderOpen,
  Gift as SolarGift,
  Global,
  GraphDown,
  GraphUp,
  Heart as SolarHeart,
  Home as SolarHome,
  Laptop as SolarLaptop,
  Layers as SolarLayers,
  Lightbulb as SolarLightbulb,
  MagicStick3,
  Magnifer,
  MenuDots,
  MinusCircle,
  Monitor as SolarMonitor,
  Pen2,
  RefreshCircle,
  SafeSquare,
  SendSquare,
  Settings as SolarSettings,
  ShieldCheck as SolarShieldCheck,
  Smartphone as SolarSmartphone,
  SquareAcademicCap,
  Star as SolarStar,
  Sun as SolarSun,
  TShirt,
  Tag as SolarTag,
  Target as SolarTarget,
  TrashBinMinimalistic,
  Upload as SolarUpload,
  Wallet as SolarWallet,
} from "@solar-icons/react";

export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { weight?: "Linear" }>;

export const Plus = AddSquare;
export const ChevronLeft = AltArrowLeft;
export const ChevronRight = AltArrowRight;
export const Sparkles = MagicStick3;
export const TrendingUp = GraphUp;
export const TrendingDown = GraphDown;
export const ArrowDownLeft = ArrowLeftDown;
export const ArrowUpRight = ArrowRightUp;
export const ArrowDownRight = ArrowRightDown;
export { ArrowRightUp, ArrowRightDown };
export const CreditCard = Card;
export const PiggyBank = SafeSquare;
export const Loader2 = RefreshCircle;
export const Repeat2 = RefreshCircle;
export const RefreshCw = RefreshCircle;
export const Search = Magnifer;
export const X = CloseCircle;
export { Calendar };
export const CalendarIcon = Calendar;
export const CalendarDays = CalendarDate;
export const CalendarClock = CalendarMark;
export const Download = SolarDownload;
export const Upload = SolarUpload;
export const FileSpreadsheet = FileSmile;
export const FileText = DocumentText;
export const BarChart3 = Chart2;
export const Settings = SolarSettings;
export const FolderOpen = SolarFolderOpen;
export const Trash2 = TrashBinMinimalistic;
export const AlertTriangle = DangerTriangle;
export { Global as Globe, Bell, Eye };
export const ShieldCheck = SolarShieldCheck;
export const Target = SolarTarget;
export const Pencil = Pen2;
export const Check = CheckCircle;
export { CheckCircle as CheckCircle2 };
export const MoreVertical = MenuDots;
export const MoreHorizontal = MenuDots;
export const Wallet = SolarWallet;
export const Smartphone = SolarSmartphone;
export const Bitcoin = Dollar;
export const Star = SolarStar;
export const Sun = SolarSun;
export const Layers = SolarLayers;
export const Tag = SolarTag;
export const Info = SolarLightbulb;
export const Brain = MagicStick3;
export const Lightbulb = SolarLightbulb;
export const MessageSquare = ChatSquare;
export const Send = SendSquare;
export const Zap = Bolt;
export const Minus = MinusCircle;
export const Building2 = Buildings;
export const Landmark = Buildings;
export const Shirt = TShirt;
export const GraduationCap = SquareAcademicCap;
export const Film = Clapperboard;
export const Utensils = ChefHat;
export const Heart = SolarHeart;
export const Home = SolarHome;
export const ShoppingBag = Bag;
export const Monitor = SolarMonitor;
export const Car = Buildings;
export const Briefcase = Case;
export const Gift = SolarGift;
export const DollarSign = Dollar;
export const Laptop = SolarLaptop;
