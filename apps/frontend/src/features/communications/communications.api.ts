import { apiRequest } from "../../lib/api-client";

export type Paginated<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type NoticeType = "STUDENT" | "INSTRUCTOR";
export type NoticeScope = "ALL" | "CLASSES";

export type Notice = {
  id: string;
  type: NoticeType;
  scope: NoticeScope;
  title: string;
  content: string;
  important: boolean;
  publishedFrom: string | null;
  publishedUntil: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
  classTargets: Array<{ classId: string; name: string }>;
};

export type MyNotice = Omit<Notice, "content" | "authorId" | "updatedAt" | "classTargets"> & {
  isRead: boolean;
};

export type MyNoticeDetail = MyNotice & { content: string; readAt: string };

export type NoticeInput = {
  type: NoticeType;
  scope: NoticeScope;
  title: string;
  content: string;
  important?: boolean;
  publishedFrom?: string;
  publishedUntil?: string;
  classTargetIds?: string[];
};

export type NoticeUpdateInput = Partial<Omit<NoticeInput, "type" | "scope" | "publishedFrom" | "publishedUntil">> & {
  publishedFrom?: string | null;
  publishedUntil?: string | null;
};

export function getMyNotices(input: { page?: number; important?: boolean } = {}): Promise<Paginated<MyNotice>> {
  const params = new URLSearchParams({ page: String(input.page ?? 1), limit: "20" });
  if (input.important !== undefined) params.set("important", String(input.important));
  return apiRequest(`/me/notices?${params.toString()}`);
}

export function getUnreadNoticeCount(): Promise<{ count: number }> {
  return apiRequest("/me/notices/unread-count");
}

export function getMyNotice(id: string): Promise<MyNoticeDetail> {
  return apiRequest(`/me/notices/${id}`);
}

export function getNotices(input: { page?: number; keyword?: string; type?: NoticeType; scope?: NoticeScope } = {}): Promise<Paginated<Notice>> {
  const params = new URLSearchParams({ page: String(input.page ?? 1), limit: "20" });
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.type) params.set("type", input.type);
  if (input.scope) params.set("scope", input.scope);
  return apiRequest(`/notices?${params.toString()}`);
}

export function createNotice(input: NoticeInput): Promise<Notice> {
  return apiRequest("/notices", { method: "POST", body: input });
}

export function updateNotice(id: string, input: NoticeUpdateInput): Promise<Notice> {
  return apiRequest(`/notices/${id}`, { method: "PATCH", body: input });
}

export function deleteNotice(id: string): Promise<void> {
  return apiRequest(`/notices/${id}`, { method: "DELETE" });
}

export type InquiryType = "CLASS" | "GENERAL";
export type InquiryStatus = "RECEIVED" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";

export type InquiryListItem = {
  id: string;
  type: InquiryType;
  classId: string | null;
  className: string | null;
  authorId: string;
  title: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  replyCount: number;
};

export type InquiryReply = { id: string; authorId: string | null; content: string; createdAt: string };
export type InquiryDetail = Omit<InquiryListItem, "replyCount"> & { content: string; replies: InquiryReply[] };

export function getInquiries(input: { page?: number; type?: InquiryType; status?: InquiryStatus; classId?: string } = {}): Promise<Paginated<InquiryListItem>> {
  const params = new URLSearchParams({ page: String(input.page ?? 1), limit: "20" });
  if (input.type) params.set("type", input.type);
  if (input.status) params.set("status", input.status);
  if (input.classId) params.set("classId", input.classId);
  return apiRequest(`/inquiries?${params.toString()}`);
}

export function getInquiry(id: string): Promise<InquiryDetail> {
  return apiRequest(`/inquiries/${id}`);
}

export function createInquiry(input: { type: InquiryType; classId?: string; title: string; content: string }): Promise<InquiryDetail> {
  return apiRequest("/inquiries", { method: "POST", body: input });
}

export function replyInquiry(id: string, content: string): Promise<InquiryDetail> {
  return apiRequest(`/inquiries/${id}/replies`, { method: "POST", body: { content } });
}

export function closeInquiry(id: string): Promise<InquiryDetail> {
  return apiRequest(`/inquiries/${id}/close`, { method: "POST" });
}

export type Handover = {
  id: string;
  classId: string;
  className: string;
  fromInstructorId: string | null;
  fromInstructorName: string | null;
  toInstructorId: string;
  toInstructorName: string;
  title: string;
  content: string;
  createdById: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

export function getHandovers(input: { page?: number; classId?: string; acknowledged?: boolean } = {}): Promise<Paginated<Handover>> {
  const params = new URLSearchParams({ page: String(input.page ?? 1), limit: "20" });
  if (input.classId) params.set("classId", input.classId);
  if (input.acknowledged !== undefined) params.set("acknowledged", String(input.acknowledged));
  return apiRequest(`/handovers?${params.toString()}`);
}

export function getHandover(id: string): Promise<Handover> {
  return apiRequest(`/handovers/${id}`);
}

export function createHandover(input: { classId: string; toInstructorId: string; fromInstructorId?: string; title: string; content: string }): Promise<Handover> {
  return apiRequest("/handovers", { method: "POST", body: input });
}

export function updateHandover(id: string, input: { title?: string; content?: string }): Promise<Handover> {
  return apiRequest(`/handovers/${id}`, { method: "PATCH", body: input });
}

export function acknowledgeHandover(id: string): Promise<Handover> {
  return apiRequest(`/handovers/${id}/acknowledge`, { method: "POST" });
}
