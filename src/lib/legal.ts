// 이용약관·개인정보 처리방침·사업자 정보 표시에 쓰는 값.
// 사업자 등록 후 빈 칸("")을 채우세요. 빈 칸은 화면에 "(준비 중)"으로 보이거나 숨겨집니다.

// 약관·처리방침 내용을 바꾸면 이 값을 새 날짜로 올리세요.
// 기존 회원은 다음에 부모 화면을 열 때 다시 동의하게 됩니다.
// (supabase/seed.sql의 테스트 계정 terms_version도 같이 바꿔야 로컬 테스트에서 동의 화면이 뜨지 않습니다)
export const TERMS_VERSION = "2026-11-11";

export const LEGAL = {
  serviceName: "영어 단어 학습",
  effectiveDate: "2026년 11월 11일", // 약관·처리방침 시행일

  // 사업자 정보 (전자상거래법상 사이트 하단 표시 사항)
  companyName: "", // 상호
  ceoName: "", // 대표자
  businessNumber: "", // 사업자등록번호 (예: 123-45-67890)
  mailOrderNumber: "", // 통신판매업 신고번호 (유료 판매 시작 전 신고)
  address: "", // 사업장 주소
  email: "", // 고객 문의 이메일
  phone: "", // 고객 문의 전화 (선택)

  // 개인정보 보호책임자 (개인사업자는 보통 대표자 본인)
  privacyOfficer: "", // 성명
  privacyEmail: "", // 연락처 이메일 (비우면 고객 문의 이메일)

  // 회원·학습 데이터가 저장되는 곳 (Supabase 프로젝트 Settings > General > Region)
  dataRegion: "", // 예: "대한민국 서울 (AWS ap-northeast-2)"
};

export const PENDING = "(준비 중)";

export function orPending(value: string): string {
  return value.trim() || PENDING;
}

// 화면에 이름처럼 쓰는 운영 주체. 상호가 없으면 서비스 이름
export function operatorName(): string {
  return LEGAL.companyName.trim() || LEGAL.serviceName;
}

export function privacyContactEmail(): string {
  return LEGAL.privacyEmail.trim() || LEGAL.email.trim();
}
