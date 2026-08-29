import { apiRequest } from "../../lib/api-client";

export const TERMS_TYPES = [
  "SERVICE",
  "PRIVACY",
  "MARKETING",
  "THIRD_PARTY",
  "SENSITIVE_INFO",
  "LOCATION",
] as const;

export type TermsType = (typeof TERMS_TYPES)[number];

export const TERMS_TYPE_LABELS: Record<TermsType, string> = {
  SERVICE: "서비스 이용약관",
  PRIVACY: "개인정보 처리방침",
  MARKETING: "마케팅 정보 수신 동의",
  THIRD_PARTY: "개인정보 제3자 제공 동의",
  SENSITIVE_INFO: "민감정보 수집·이용 동의",
  LOCATION: "위치정보 이용약관",
};

export type TermsDocument = {
  id: string;
  type: TermsType;
  version: string;
  title: string;
  content: string;
  required: boolean;
  effectiveAt: string;
  active: boolean;
};

export type CreateTermsDocumentInput = {
  type: TermsType;
  version: string;
  title: string;
  content: string;
  required: boolean;
  effectiveAt: string;
  activate: boolean;
};

export type UpdateTermsDocumentInput = Omit<
  CreateTermsDocumentInput,
  "activate"
>;

export function getTermsVersions(): Promise<TermsDocument[]> {
  return apiRequest<TermsDocument[]>("/terms/versions");
}

export function createTermsVersion(
  input: CreateTermsDocumentInput,
): Promise<TermsDocument> {
  return apiRequest<TermsDocument>("/terms/versions", {
    method: "POST",
    body: input,
  });
}

export function activateTermsVersion(id: string): Promise<TermsDocument> {
  return apiRequest<TermsDocument>(`/terms/versions/${id}/activate`, {
    method: "POST",
  });
}

export function updateTermsVersion(
  id: string,
  input: UpdateTermsDocumentInput,
): Promise<TermsDocument> {
  return apiRequest<TermsDocument>(`/terms/versions/${id}`, {
    method: "PATCH",
    body: input,
  });
}
