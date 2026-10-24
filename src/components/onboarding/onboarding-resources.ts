import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BadgeInfo,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  IdCard,
  Laptop,
  Link2,
  MessageSquareMore,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  UserPlus,
} from "lucide-react";

export type OnboardingCategory = "Programs" | "UID" | "Tools" | "Training" | "Forms" | "Support";
export type ResourceStatus = "active" | "admin_only" | "demo";

export type OnboardingResource = {
  id: string;
  label: string;
  description: string;
  category: OnboardingCategory;
  icon?: string;
  provider?: string;
  status: ResourceStatus;
  accent?: string;
};

export const onboardingCategoryOptions: OnboardingCategory[] = ["Programs", "UID", "Tools", "Training", "Forms", "Support"];

export const onboardingIcons: Record<string, LucideIcon> = {
  badge: BadgeCheck,
  info: BadgeInfo,
  briefcase: BriefcaseBusiness,
  clipboard: ClipboardCheck,
  file: FileText,
  globe: Globe,
  graduation: GraduationCap,
  help: Headphones,
  id: IdCard,
  laptop: Laptop,
  link: Link2,
  message: MessageSquareMore,
  phone: Phone,
  shield: ShieldCheck,
  sparkles: Sparkles,
  users: Users,
  userPlus: UserPlus,
};

export const onboardingResources: OnboardingResource[] = [
  // Programs
  { id: "program-companyb", label: "Company B", description: "Program landing links and operational resources.", category: "Programs", icon: "sparkles", provider: "Company B", status: "demo", accent: "pink" },
  { id: "program-companya", label: "Company A", description: "Company A resources and program onboarding links.", category: "Programs", icon: "badge", provider: "Company A", status: "demo", accent: "blue" },
  { id: "program-companyc", label: "Company C", description: "Company C program entry points.", category: "Programs", icon: "globe", provider: "Company C", status: "demo", accent: "red" },
  { id: "program-companyd", label: "Company D", description: "Company D program tools and rollout references.", category: "Programs", icon: "shield", provider: "Company D", status: "demo", accent: "orange" },

  // UID
  { id: "uid-residential", label: "Residential UID", description: "Residential UID link and setup guidance.", category: "UID", icon: "id", status: "demo", accent: "blue" },
  { id: "uid-commercial", label: "Commercial UID", description: "Commercial UID access resources.", category: "UID", icon: "id", status: "demo", accent: "slate" },
  { id: "uid-media", label: "Media UID", description: "Media program UID setup and access.", category: "UID", icon: "id", status: "demo", accent: "sky" },

  // Tools
  { id: "tool-recruiting-master-sheet", label: "Recruiting Master Sheet", description: "Open the recruiting master sheet for recruiting and rep pipeline tracking.", category: "Tools", icon: "clipboard", status: "demo", accent: "emerald" },
  { id: "tool-pivot-table-formatter", label: "Pivot Table Formatter", description: "Format and organize pivot table reports with a report formatting tool.", category: "Tools", icon: "sparkles", status: "demo", accent: "emerald" },
  { id: "tool-background-checks", label: "Background Checks", description: "Company B background check workflow.", category: "Tools", icon: "shield", provider: "Company B", status: "demo", accent: "pink" },
  { id: "tool-lead-request", label: "Lead Request", description: "Request lead routing or lead access.", category: "Tools", icon: "link", status: "demo", accent: "blue" },

  // Forms
  { id: "form-new-rep", label: "New Rep Onboarding Form", description: "Start a new rep onboarding packet.", category: "Forms", icon: "userPlus", status: "demo", accent: "blue" },
];
