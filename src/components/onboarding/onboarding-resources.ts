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
export type ResourceStatus = "active" | "coming_soon" | "admin_only" | "external";

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

export const onboardingCategoryOrder: OnboardingCategory[] = ["Programs", "UID", "Tools", "Training", "Forms", "Support"];

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
  { id: "program-tfiber", label: "T-Fiber", description: "Program landing links and operational resources.", category: "Programs", href: "https://magentaportal.t-mobile.com/logon/LogonPoint/tmindex.html", icon: "sparkles", provider: "T-Fiber", status: "external", accent: "pink" },
  { id: "program-att", label: "AT&T", description: "AT&T resources and program onboarding links.", category: "Programs", href: "https://www.saraplus.com/e/(S(rmltpvfmpjwr4z2esggfydpx))/ServicePages/Login.aspx?ReturnUrl=%2fe%2fReports%2fReportingHub.aspx", icon: "badge", provider: "AT&T", status: "external", accent: "blue" },
  { id: "program-frontier", label: "Frontier", description: "Frontier program entry points.", category: "Programs", href: "https://perfectvisionpoe.my.site.com/poe/s/login/", icon: "globe", provider: "Frontier", status: "external", accent: "red" },
  { id: "program-vivint", label: "Vivint", description: "Vivint program tools and rollout references.", category: "Programs", href: "https://app.smartsheet.com/b/form/019dc191afd772bd8ac12c3084a0c72f", icon: "shield", provider: "Vivint", status: "external", accent: "orange" },
  { id: "program-directv", label: "DIRECTV", description: "DIRECTV program materials and launch notes.", category: "Programs", href: "#", icon: "users", provider: "DIRECTV", status: "coming_soon", accent: "sky" },
  { id: "program-wireless", label: "Wireless", description: "Wireless program assets and access points.", category: "Programs", href: "#", icon: "briefcase", provider: "Wireless", status: "coming_soon", accent: "emerald" },

  // UID
  { id: "uid-residential", label: "Residential UID", description: "Residential UID link and setup guidance.", category: "UID", href: "https://form.jotform.com/222554092601146", icon: "id", status: "external", accent: "blue" },
  { id: "uid-commercial", label: "Commercial UID", description: "Commercial UID access resources.", category: "UID", href: "https://form.jotform.com/233545154870155", icon: "id", status: "external", accent: "slate" },
  { id: "uid-dtv", label: "DTV UID", description: "DIRECTV UID setup and access.", category: "UID", href: "https://form.jotform.com/222575485783166", icon: "id", status: "external", accent: "sky" },
  { id: "uid-tfiber", label: "T-Fiber UID", description: "T-Fiber UID request and reference link.", category: "UID", href: "#", icon: "id", provider: "T-Fiber", status: "coming_soon", accent: "pink" },
  { id: "uid-frontier", label: "Frontier UID", description: "Frontier UID lookup and provisioning link.", category: "UID", href: "#", icon: "id", provider: "Frontier", status: "coming_soon", accent: "red" },
  { id: "uid-vivint", label: "Vivint UID", description: "Vivint UID onboarding access.", category: "UID", href: "#", icon: "id", provider: "Vivint", status: "coming_soon", accent: "orange" },

  // Tools
  { id: "tool-recruiting-master-sheet", label: "Recruiting Master Sheet", description: "Open the recruiting master sheet for recruiting and rep pipeline tracking.", category: "Tools", href: "https://docs.google.com/spreadsheets/d/1SksjiC-i1PzKO98lVCjpg3Z6i20VZrl5PChfKP-PnbA/edit?usp=sharing", icon: "clipboard", status: "external", accent: "emerald" },
  { id: "tool-background-checks", label: "Background Checks", description: "T-Fiber background check workflow.", category: "Tools", href: "https://simpliverified.instascreen.net/sso/login.taz", icon: "shield", provider: "T-Fiber", status: "external", accent: "pink" },
  { id: "tool-lead-request", label: "Lead Request", description: "Request lead routing or lead access.", category: "Tools", href: "https://form.jotform.com/261517764960061", icon: "link", status: "external", accent: "blue" },
  { id: "tool-badge-request", label: "Badge Request", description: "Submit a badge request for a rep.", category: "Tools", href: "#", icon: "badge", status: "coming_soon", accent: "emerald" },
  { id: "tool-territory-request", label: "Territory Request", description: "Request territory changes or access.", category: "Tools", href: "#", icon: "globe", status: "coming_soon", accent: "orange" },
  { id: "tool-rep-status", label: "Rep Status Check", description: "Check rep status and onboarding progress.", category: "Tools", href: "#", icon: "clipboard", status: "coming_soon", accent: "slate" },
  { id: "tool-sales-id", label: "Sales ID Lookup", description: "Lookup or verify sales IDs quickly.", category: "Tools", href: "#", icon: "info", status: "coming_soon", accent: "blue" },

  // Training
  { id: "training-att", label: "AT&T Training", description: "AT&T onboarding and selling training.", category: "Training", href: "#", icon: "graduation", provider: "AT&T", status: "coming_soon", accent: "blue" },
  { id: "training-tfiber", label: "T-Fiber Training", description: "T-Fiber enablement and ramp resources.", category: "Training", href: "#", icon: "graduation", provider: "T-Fiber", status: "coming_soon", accent: "pink" },
  { id: "training-frontier", label: "Frontier Training", description: "Frontier learning modules.", category: "Training", href: "#", icon: "graduation", provider: "Frontier", status: "coming_soon", accent: "red" },
  { id: "training-vivint", label: "Vivint Training", description: "Vivint training links and materials.", category: "Training", href: "#", icon: "graduation", provider: "Vivint", status: "coming_soon", accent: "orange" },
  { id: "training-dtv", label: "DIRECTV Training", description: "DIRECTV training resources and docs.", category: "Training", href: "#", icon: "graduation", provider: "DIRECTV", status: "coming_soon", accent: "sky" },
  { id: "training-wireless", label: "Wireless Training", description: "Wireless training and certification items.", category: "Training", href: "#", icon: "graduation", provider: "Wireless", status: "coming_soon", accent: "emerald" },

  // Forms
  { id: "form-new-rep", label: "New Rep Onboarding Form", description: "Start a new rep onboarding packet.", category: "Forms", href: "https://abenergymarketing.com/fiber", icon: "userPlus", status: "external", accent: "blue" },
  { id: "form-manager-request", label: "Manager Request Form", description: "Request a manager or approval flow.", category: "Forms", href: "#", icon: "users", status: "coming_soon", accent: "slate" },
  { id: "form-equipment", label: "Equipment Request", description: "Request hardware or equipment access.", category: "Forms", href: "#", icon: "laptop", status: "coming_soon", accent: "emerald" },
  { id: "form-payroll", label: "Payroll / W9 Form", description: "Payroll setup and compliance form.", category: "Forms", href: "#", icon: "file", status: "coming_soon", accent: "orange" },
  { id: "form-compliance", label: "Compliance Acknowledgment", description: "Compliance acknowledgment and policy review.", category: "Forms", href: "#", icon: "shield", status: "coming_soon", accent: "red" },

  // Support
  { id: "support-helpdesk", label: "Help Desk", description: "Contact help desk or support intake.", category: "Support", href: "#", icon: "help", status: "coming_soon", accent: "blue" },
  { id: "support-import", label: "Report an Import Issue", description: "Flag a problem with import processing.", category: "Support", href: "#", icon: "message", status: "coming_soon", accent: "pink" },
  { id: "support-program-access", label: "Request Program Access", description: "Request access to a program or tool.", category: "Support", href: "#", icon: "link", status: "coming_soon", accent: "emerald" },
  { id: "support-roster-update", label: "Request Roster Update", description: "Submit a roster correction request.", category: "Support", href: "#", icon: "users", status: "coming_soon", accent: "slate" },
  { id: "support-location-change", label: "Request Location Change", description: "Request a location change for a rep.", category: "Support", href: "#", icon: "briefcase", status: "coming_soon", accent: "orange" },
];
