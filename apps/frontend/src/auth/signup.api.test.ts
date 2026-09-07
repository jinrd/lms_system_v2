import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../lib/api-client";
import { signup } from "./signup.api";

vi.mock("../lib/api-client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

describe("공개 회원가입 API 계약", () => {
  it("인증 없이 가입 정보를 전송한다", async () => {
    const input = {
      loginId: "student01",
      password: "password123",
      name: "학생",
      phone: "010-1234-5678",
      birthDate: "2000-01-01",
      gender: "UNDISCLOSED" as const,
      isMinorAtSignup: false,
      agreedTermsDocumentIds: ["11111111-1111-4111-8111-111111111111"],
    };
    await signup(input);
    expect(apiRequest).toHaveBeenCalledWith("/auth/signup", {
      method: "POST",
      skipAuth: true,
      body: input,
    });
  });
});
