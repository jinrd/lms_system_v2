export const TERMS_TYPES = [
  'SERVICE',
  'PRIVACY',
  'MARKETING',
  'THIRD_PARTY',
  'SENSITIVE_INFO',
  'LOCATION',
] as const;

export type TermsType = (typeof TERMS_TYPES)[number];
