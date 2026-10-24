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
export type ResourceStatus = "active" | "admin_only" | "external";

export type OnboardingResource = {
  id: string;
  label: string;
  description: string;
  category: OnboardingCategory;
  href?: string;
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
  { id: "program-companyb", label: "Company B", description: "Program landing links and operational resources.", category: "Programs", href: "https://magentaportal.company b.com/logon/LogonPoint/tmindex.html", icon: "sparkles", provider: "Company B", status: "external", accent: "pink" },
  { id: "program-companya", label: "Company A", description: "Company A resources and program onboarding links.", category: "Programs", href: "https://www.saraplus.com/e/(S(rmltpvfmpjwr4z2esggfydpx))/ServicePages/Login.aspx?ReturnUrl=%2fe%2fReports%2fReportingHub.aspx", icon: "badge", provider: "Company A", status: "external", accent: "blue" },
  { id: "program-frontier", label: "Frontier", description: "Frontier program entry points.", category: "Programs", href: "https://perfectvisionpoe.my.site.com/poe/s/login/", icon: "globe", provider: "Frontier", status: "external", accent: "red" },
  { id: "program-vivint", label: "Vivint", description: "Vivint program tools and rollout references.", category: "Programs", href: "https://app.smartsheet.com/b/form/019dc191afd772bd8ac12c3084a0c72f", icon: "shield", provider: "Vivint", status: "external", accent: "orange" },

  // UID
  { id: "uid-residential", label: "Residential UID", description: "Residential UID link and setup guidance.", category: "UID", href: "https://form.jotform.com/222554092601146", icon: "id", status: "external", accent: "blue" },
  { id: "uid-commercial", label: "Commercial UID", description: "Commercial UID access resources.", category: "UID", href: "https://form.jotform.com/233545154870155", icon: "id", status: "external", accent: "slate" },
  { id: "uid-dtv", label: "DTV UID", description: "DIRECTV UID setup and access.", category: "UID", href: "https://form.jotform.com/222575485783166", icon: "id", status: "external", accent: "sky" },

  // Tools
  { id: "tool-recruiting-master-sheet", label: "Recruiting Master Sheet", description: "Open the recruiting master sheet for recruiting and rep pipeline tracking.", category: "Tools", href: "https://docs.google.com/spreadsheets/d/1SksjiC-i1PzKO98lVCjpg3Z6i20VZrl5PChfKP-PnbA/edit?usp=sharing", icon: "clipboard", status: "external", accent: "emerald" },
  { id: "tool-pivot-table-formatter", label: "Pivot Table Formatter", description: "Format and organize pivot table reports with the ChatGPT Pivot Table Formatter.", category: "Tools", href: "https://chatgpt.com/g/g-6a5785547ae881918e72a2bdf3d5787f-pivot-table-formatter", icon: "sparkles", status: "external", accent: "emerald" },
  { id: "tool-background-checks", label: "Background Checks", description: "Company B background check workflow.", category: "Tools", href: "https://simpliverified.instascreen.net/sso/login.taz", icon: "shield", provider: "Company B", status: "external", accent: "pink" },
  { id: "tool-lead-request", label: "Lead Request", description: "Request lead routing or lead access.", category: "Tools", href: "https://form.jotform.com/261517764960061", icon: "link", status: "external", accent: "blue" },

  // Forms
  { id: "form-new-rep", label: "New Rep Onboarding Form", description: "Start a new rep onboarding packet.", category: "Forms", href: "https://abenergymarketing.com/fiber", icon: "userPlus", status: "external", accent: "blue" },
];
