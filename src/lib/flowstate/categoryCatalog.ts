export type FinanceCategoryType = "income" | "expense";

export interface SystemCategoryDefinition {
  id: string;
  slug: string;
  name: string;
  name_my: string;
  icon: string;
  color: string;
  type: FinanceCategoryType;
  group: string;
  group_my: string;
  sort_order: number;
  keywords: string[];
}

const C = {
  mint: "#34D399",
  green: "#22C55E",
  cyan: "#38BDF8",
  blue: "#60A5FA",
  violet: "#A78BFA",
  pink: "#F472B6",
  rose: "#FB7185",
  amber: "#FBBF24",
  orange: "#FB923C",
  slate: "#94A3B8",
};

function item(
  type: FinanceCategoryType,
  group: string,
  groupMy: string,
  order: number,
  slug: string,
  name: string,
  nameMy: string,
  icon: string,
  color: string,
  keywords: string[] = [],
): SystemCategoryDefinition {
  return {
    id: `flowstate-system-${type}-${slug}`,
    slug,
    name,
    name_my: nameMy,
    icon,
    color,
    type,
    group,
    group_my: groupMy,
    sort_order: order,
    keywords,
  };
}

export const SYSTEM_CATEGORY_CATALOG_VERSION = 2;

export const SYSTEM_CATEGORY_CATALOG: readonly SystemCategoryDefinition[] = [
  item("income", "Work income", "အလုပ်ဝင်ငွေ", 100, "salary", "Salary", "လစာ", "case", C.green, ["paycheck", "wage"]),
  item("income", "Work income", "အလုပ်ဝင်ငွေ", 110, "freelance", "Freelance & Contract", "အလွတ်တန်းနှင့် စာချုပ်ဝင်ငွေ", "laptop", C.mint, ["client", "project"]),
  item("income", "Work income", "အလုပ်ဝင်ငွေ", 120, "bonus", "Bonus & Commission", "ဘောနပ်စ်နှင့် ကော်မရှင်", "cup", C.amber, ["incentive"]),
  item("income", "Business income", "စီးပွားရေးဝင်ငွေ", 200, "business-revenue", "Business Revenue", "စီးပွားရေးရငွေ", "buildings", C.mint, ["sales", "shop"]),
  item("income", "Business income", "စီးပွားရေးဝင်ငွေ", 210, "rental-income", "Rental Income", "ငှားရမ်းခရငွေ", "home", C.green, ["property", "lease"]),
  item("income", "Returns", "အကျိုးအမြတ်", 300, "investment-return", "Investment Return", "ရင်းနှီးမြှုပ်နှံမှုအမြတ်", "graph-up", C.cyan, ["stock", "fund"]),
  item("income", "Returns", "အကျိုးအမြတ်", 310, "interest-dividend", "Interest & Dividends", "အတိုးနှင့် အစုရှယ်ယာဝင်ငွေ", "dollar", C.blue, ["bank interest"]),
  item("income", "Returns", "အကျိုးအမြတ်", 320, "crypto-income", "Crypto Income", "ခရစ်ပတိုဝင်ငွေ", "wallet-money", C.violet, ["staking", "airdrop", "usdt"]),
  item("income", "Other income", "အခြားဝင်ငွေ", 400, "gift-received", "Gifts Received", "လက်ဆောင်ရငွေ", "gift", C.pink),
  item("income", "Other income", "အခြားဝင်ငွေ", 410, "refund", "Refund & Reimbursement", "ပြန်အမ်းငွေ", "card-receive", C.cyan, ["cashback"]),
  item("income", "Other income", "အခြားဝင်ငွေ", 490, "other-income", "Other Income", "အခြားဝင်ငွေ", "more", C.slate),

  item("expense", "Food & drink", "အစားအသောက်", 100, "groceries", "Groceries & Market", "ကုန်စုံနှင့် စျေးဝယ်", "cart", C.orange, ["supermarket", "market", "food"]),
  item("expense", "Food & drink", "အစားအသောက်", 110, "restaurant", "Restaurant & Dining", "စားသောက်ဆိုင်", "chef-hat", C.orange, ["dinner", "lunch", "breakfast"]),
  item("expense", "Food & drink", "အစားအသောက်", 120, "cafe", "Cafe & Drinks", "ကော်ဖီနှင့် သောက်စရာ", "cup-hot", C.amber, ["coffee", "tea"]),
  item("expense", "Food & drink", "အစားအသောက်", 130, "snacks", "Snacks", "မုန့်နှင့် အဆာပြေ", "donut", C.pink),
  item("expense", "Food & drink", "အစားအသောက်", 140, "food-delivery", "Food Delivery", "အစားအသောက်ပို့ဆောင်မှု", "delivery", C.orange, ["grab food", "foodpanda"]),

  item("expense", "Housing & rent", "အိမ်နှင့် ငှားရမ်းခ", 200, "home-rent", "Home / Apartment Rent", "အိမ်နှင့် တိုက်ခန်းငှားခ", "home", C.amber, ["house rent", "apartment"]),
  item("expense", "Housing & rent", "အိမ်နှင့် ငှားရမ်းခ", 210, "office-rent", "Office / Shop Rent", "ရုံးနှင့် ဆိုင်ခန်းငှားခ", "buildings", C.amber, ["workspace", "shop rent"]),
  item("expense", "Housing & rent", "အိမ်နှင့် ငှားရမ်းခ", 220, "storage-rent", "Storage Rent", "ဂိုဒေါင်နှင့် သိုလှောင်ခ", "box", C.slate, ["warehouse"]),
  item("expense", "Housing & rent", "အိမ်နှင့် ငှားရမ်းခ", 230, "home-maintenance", "Home Maintenance", "အိမ်ပြုပြင်ထိန်းသိမ်းမှု", "hammer", C.orange, ["repair"]),

  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 300, "electricity", "Electricity Bill", "မီတာခ", "bolt", C.amber, ["power", "meter"]),
  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 310, "water", "Water Bill", "ရေဖိုး", "waterdrop", C.cyan),
  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 320, "cooking-gas", "Cooking Gas", "ဂတ်စ်ဖိုး", "gas-station", C.orange, ["lpg", "gas"]),
  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 330, "internet", "Internet / Wi-Fi", "အင်တာနက်နှင့် Wi-Fi", "global", C.blue, ["broadband", "wifi"]),
  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 340, "mobile-phone", "Mobile Phone", "ဖုန်းဘေလ်", "smartphone", C.violet, ["sim", "top up", "data"]),
  item("expense", "Utilities & bills", "ဝန်ဆောင်ခနှင့် ဘေလ်များ", 350, "tv-streaming", "TV & Streaming", "တီဗီနှင့် Streaming", "tv", C.violet, ["netflix", "youtube", "subscription"]),

  item("expense", "Transport", "သွားလာရေး", 400, "fuel", "Fuel", "ဆီဖိုး", "fuel", C.orange, ["petrol", "diesel"]),
  item("expense", "Transport", "သွားလာရေး", 410, "taxi-rideshare", "Taxi & Ride Share", "တက္ကစီနှင့် Ride Share", "map-point", C.blue, ["grab", "taxi"]),
  item("expense", "Transport", "သွားလာရေး", 420, "public-transport", "Public Transport", "အများပြည်သူသယ်ယူပို့ဆောင်ရေး", "bus", C.cyan, ["train"]),
  item("expense", "Transport", "သွားလာရေး", 430, "parking-tolls", "Parking & Tolls", "ကားပါကင်နှင့် လမ်းခ", "garage", C.slate),
  item("expense", "Transport", "သွားလာရေး", 440, "vehicle-maintenance", "Vehicle Maintenance", "ယာဉ်ပြုပြင်ထိန်းသိမ်းမှု", "settings", C.blue, ["service", "repair"]),
  item("expense", "Transport", "သွားလာရေး", 450, "vehicle-rental", "Vehicle Rental", "ကားနှင့် ဆိုင်ကယ်ငှားခ", "key", C.violet, ["car rent", "bike rent"]),

  item("expense", "Shopping", "စျေးဝယ်", 500, "household-supplies", "Household Supplies", "အိမ်သုံးပစ္စည်း", "broom", C.blue, ["cleaning"]),
  item("expense", "Shopping", "စျေးဝယ်", 510, "clothing", "Clothing & Shoes", "အဝတ်အစားနှင့် ဖိနပ်", "shirt", C.pink, ["fashion"]),
  item("expense", "Shopping", "စျေးဝယ်", 520, "electronics", "Electronics", "အီလက်ထရွန်နစ်ပစ္စည်း", "devices", C.cyan, ["phone", "computer"]),
  item("expense", "Shopping", "စျေးဝယ်", 530, "personal-care", "Personal Care", "တစ်ကိုယ်ရေသုံးနှင့် အလှအပ", "cosmetic", C.pink, ["beauty", "haircut", "skincare"]),
  item("expense", "Shopping", "စျေးဝယ်", 540, "gifts-shopping", "Gifts", "လက်ဆောင်ဝယ်ယူမှု", "gift", C.rose),

  item("expense", "Health", "ကျန်းမာရေး", 600, "doctor-hospital", "Doctor & Hospital", "ဆရာဝန်နှင့် ဆေးရုံ", "hospital", C.rose, ["clinic"]),
  item("expense", "Health", "ကျန်းမာရေး", 610, "pharmacy", "Pharmacy & Medicine", "ဆေးဆိုင်နှင့် ဆေးဝါး", "pill", C.cyan, ["prescription"]),
  item("expense", "Health", "ကျန်းမာရေး", 620, "dental", "Dental Care", "သွားနှင့်ခံတွင်း", "stethoscope", C.blue, ["dentist"]),
  item("expense", "Health", "ကျန်းမာရေး", 630, "fitness", "Fitness & Gym", "အားကစားနှင့် Gym", "dumbbell", C.mint, ["workout"]),
  item("expense", "Health", "ကျန်းမာရေး", 640, "health-insurance", "Health Insurance", "ကျန်းမာရေးအာမခံ", "shield", C.violet),

  item("expense", "Education", "ပညာရေး", 700, "tuition-courses", "Tuition & Courses", "ကျောင်းလခနှင့် သင်တန်းကြေး", "academic-cap", C.violet),
  item("expense", "Education", "ပညာရေး", 710, "books-supplies", "Books & Supplies", "စာအုပ်နှင့် သင်ထောက်ကူ", "book", C.blue, ["stationery"]),
  item("expense", "Education", "ပညာရေး", 720, "learning-software", "Learning Software", "လေ့လာရေး Software", "laptop", C.cyan, ["course app"]),

  item("expense", "Entertainment & leisure", "ဖျော်ဖြေရေးနှင့် အပန်းဖြေ", 800, "movies-events", "Movies & Events", "ရုပ်ရှင်နှင့် ပွဲများ", "clapperboard", C.violet, ["cinema", "concert"]),
  item("expense", "Entertainment & leisure", "ဖျော်ဖြေရေးနှင့် အပန်းဖြေ", 810, "games", "Games", "ဂိမ်း", "gamepad", C.pink),
  item("expense", "Entertainment & leisure", "ဖျော်ဖြေရေးနှင့် အပန်းဖြေ", 820, "hobbies", "Hobbies", "ဝါသနာနှင့် အပန်းဖြေ", "star", C.amber),
  item("expense", "Entertainment & leisure", "ဖျော်ဖြေရေးနှင့် အပန်းဖြေ", 830, "travel", "Travel & Vacation", "ခရီးသွားနှင့် အားလပ်ရက်", "global", C.cyan, ["hotel", "flight", "trip"]),

  item("expense", "Financial", "ငွေကြေးဆိုင်ရာ", 900, "bank-card-fees", "Bank & Card Fees", "ဘဏ်နှင့် ကတ်ဝန်ဆောင်ခ", "card", C.rose, ["fee"]),
  item("expense", "Financial", "ငွေကြေးဆိုင်ရာ", 910, "loan-debt", "Loan & Debt Payment", "ချေးငွေနှင့် အကြွေးပေးဆပ်မှု", "bill-list", C.rose, ["credit card debt"]),
  item("expense", "Financial", "ငွေကြေးဆိုင်ရာ", 920, "taxes", "Taxes", "အခွန်", "calculator", C.amber),
  item("expense", "Financial", "ငွေကြေးဆိုင်ရာ", 930, "insurance", "Insurance", "အာမခံ", "shield", C.violet),

  item("expense", "Family & care", "မိသားစုနှင့် စောင့်ရှောက်မှု", 1000, "childcare", "Childcare", "ကလေးစောင့်ရှောက်မှု", "heart", C.pink),
  item("expense", "Family & care", "မိသားစုနှင့် စောင့်ရှောက်မှု", 1010, "family-support", "Family Support", "မိသားစုထောက်ပံ့မှု", "heart", C.rose),
  item("expense", "Family & care", "မိသားစုနှင့် စောင့်ရှောက်မှု", 1020, "pets", "Pets", "အိမ်မွေးတိရစ္ဆာန်", "paw", C.amber, ["cat", "dog"]),
  item("expense", "Family & care", "မိသားစုနှင့် စောင့်ရှောက်မှု", 1030, "donations", "Donations & Charity", "လှူဒါန်းမှု", "gift", C.mint, ["helping others"]),

  item("expense", "Business costs", "စီးပွားရေးကုန်ကျစရိတ်", 1100, "advertising", "Advertising & Marketing", "ကြော်ငြာနှင့် စျေးကွက်ရှာဖွေမှု", "graph-up", C.pink, ["ads"]),
  item("expense", "Business costs", "စီးပွားရေးကုန်ကျစရိတ်", 1110, "staff-contractors", "Staff & Contractors", "ဝန်ထမ်းနှင့် ကန်ထရိုက်တာ", "case", C.blue, ["payroll"]),
  item("expense", "Business costs", "စီးပွားရေးကုန်ကျစရိတ်", 1120, "office-supplies", "Office Supplies", "ရုံးသုံးပစ္စည်း", "backpack", C.cyan),
  item("expense", "Business costs", "စီးပွားရေးကုန်ကျစရိတ်", 1130, "business-tools", "Business Tools & Software", "လုပ်ငန်းသုံး Tool နှင့် Software", "laptop", C.violet, ["saas"]),
  item("expense", "Other", "အခြား", 1990, "other-expense", "Other Expense", "အခြားအသုံးစရိတ်", "more", C.slate),
];

export const CATEGORY_GROUP_ORDER = [...new Set(SYSTEM_CATEGORY_CATALOG.map((category) => category.group))];

export function isLegacyBroadSystemCategory(category: {
  id?: string | null;
  is_system?: boolean | null;
  catalog_version?: number | null;
  group?: string | null;
}): boolean {
  return Boolean(
    category.is_system
    && !category.catalog_version
    && !category.group
    && !String(category.id || "").startsWith("flowstate-system-"),
  );
}

export function categorySearchText(category: {
  name: string;
  name_my?: string | null;
  group?: string | null;
  group_my?: string | null;
  keywords?: string[] | null;
}): string {
  return [
    category.name,
    category.name_my,
    category.group,
    category.group_my,
    ...(category.keywords || []),
  ].filter(Boolean).join(" ");
}
