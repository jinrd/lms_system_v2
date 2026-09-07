import { apiRequest } from "../lib/api-client";

export type SignupGender = "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED";

export type SignupInput = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  email?: string;
  birthDate: string;
  gender: SignupGender;
  isMinorAtSignup: boolean;
  guardianName?: string;
  guardianPhone?: string;
  agreedTermsDocumentIds: string[];
};

export type SignupResponse = {
  id: string;
  status: "PENDING_APPROVAL";
};

export function signup(input: SignupInput): Promise<SignupResponse> {
  return apiRequest<SignupResponse>("/auth/signup", {
    method: "POST",
    skipAuth: true,
    body: input,
  });
}
