// 학생 PIN 로그인 공유 헬퍼.
// 학생 계정은 합성 이메일(<아이디>@STUDENT_EMAIL_DOMAIN) + PIN 유도 비밀번호로
// Supabase Auth에 저장된다. 클라이언트(로그인)와 서버(계정 생성/PIN 재설정)가
// 동일한 유도 규칙을 써야 하므로 반드시 이 모듈을 공유한다.

export const STUDENT_EMAIL_DOMAIN = "student.engwb.app";

export function isValidLoginId(loginId: string): boolean {
  return /^[a-z0-9]{3,12}$/.test(loginId);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function studentEmail(loginId: string): string {
  return `${loginId}@${STUDENT_EMAIL_DOMAIN}`;
}

export function isStudentEmail(email: string | null | undefined): boolean {
  return !!email?.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

export function loginIdFromEmail(email: string): string {
  return email.split("@")[0];
}

// Supabase 최소 비밀번호 길이(6자)를 항상 만족하도록 접두사를 붙인다.
// 보안 강도는 PIN 4자리 그대로지만, Supabase 로그인 시도 rate limit이 무차별
// 대입을 막아주고, 노출되는 정보가 아이 학습 기록뿐이라 용도에 적절한 수준.
export function derivePassword(loginId: string, pin: string): string {
  return `ewpin:${loginId}:${pin}`;
}
