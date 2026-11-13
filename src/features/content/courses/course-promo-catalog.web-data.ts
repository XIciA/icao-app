import catalog from "../../../../content/courses/catalog.json";

export type WebCourseViewId =
  | 'icao4-initial'
  | 'icao4-retake'
  | 'icao4-preview'
  | 'assessment'
  | 'icao5';

export type WebCourseOutlineSection = {
  title: string;
  items: readonly string[];
};

export type WebCoursePlan = {
  id: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  detailIntro?: string;
  detailLabel?: string;
  popular?: boolean;
  outline?: readonly WebCourseOutlineSection[];
  privileges?: readonly WebCourseOutlineSection[];
};

export type WebCourseView = {
  id: WebCourseViewId;
  label: string;
  title: string;
  description: string;
  plans: readonly WebCoursePlan[];
};

export type WebCoursePromoCatalog = {
  source: { url: string; syncedAt: string; liveHtmlSha256: string };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    destinations: readonly ({ id: 'icao4' | 'icao5'; title: string; description: string; viewId: WebCourseViewId } | { id: 'advantages'; title: string; description: string })[];
  };
  advantages: {
    eyebrow: string;
    title: string;
    description: string;
    items: readonly { id: string; title: string; description: string; icon: 'trend' | 'target' | 'users' | 'shield' }[];
  };
  pricing: {
    eyebrow: string;
    standardOutlineNotice: string;
    detailFooterNote: string;
    tabViewIds: readonly WebCourseViewId[];
    views: Record<WebCourseViewId, WebCourseView>;
  };
  story: {
    eyebrow: string;
    title: string;
    description: string;
    dialogTitle: string;
    dialogDescription: string;
    paragraphs: readonly string[];
    quote: string;
    footer: string;
  };
  contact: { label: string; wechatIds: readonly string[]; brand: string; footer: string };
};

export const webCoursePromoCatalog = catalog as WebCoursePromoCatalog;
