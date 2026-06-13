import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  studentEmail,
  derivePassword,
  isValidLoginId,
  isValidPin,
  isStudentEmail,
  loginIdFromEmail,
} from "@/lib/pin-auth";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// Authorization 헤더의 토큰을 검증하고, 학부모 계정일 때만 uid를 반환
async function authParent(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: prof } = await adminClient()
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (prof?.role !== "parent") return null;

  return data.user.id;
}

function configError(): NextResponse | null {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "서버에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다" },
      { status: 503 }
    );
  }
  return null;
}

// 자녀 계정 생성: { name, loginId, pin }
export async function POST(req: Request) {
  const cfgErr = configError();
  if (cfgErr) return cfgErr;

  const parentId = await authParent(req);
  if (!parentId) {
    return NextResponse.json({ error: "학부모 로그인이 필요합니다" }, { status: 401 });
  }

  let body: { name?: unknown; loginId?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const loginId = typeof body.loginId === "string" ? body.loginId.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (!name) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  if (!isValidLoginId(loginId)) {
    return NextResponse.json(
      { error: "아이디는 영문 소문자·숫자 3~12자로 만들어주세요" },
      { status: 400 }
    );
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4자리여야 해요" }, { status: 400 });
  }

  const admin = adminClient();
  const email = studentEmail(loginId);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: derivePassword(loginId, pin),
    email_confirm: true, // 합성 이메일이므로 인증 메일 없이 즉시 활성화
    user_metadata: { name, role: "student" },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (/already|exists|registered/i.test(msg)) {
      return NextResponse.json({ error: "이미 사용 중인 아이디예요" }, { status: 409 });
    }
    return NextResponse.json({ error: "계정 생성 실패", detail: msg }, { status: 500 });
  }

  const childId = created.user.id;

  // DB 트리거(handle_new_user)가 프로필을 만들지만, 트리거 누락 환경 대비 멱등 upsert
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: childId, email, name, role: "student" }, { onConflict: "id" });
  if (profileError) {
    return NextResponse.json({ error: "프로필 생성 실패", detail: profileError.message }, { status: 500 });
  }

  const { error: linkError } = await admin
    .from("parent_child")
    .upsert({ parent_id: parentId, child_id: childId }, { onConflict: "parent_id,child_id" });
  if (linkError) {
    return NextResponse.json({ error: "자녀 연결 실패", detail: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ loginId, childId });
}

// 기존 이메일 계정 → PIN 계정 전환: { childId, loginId, pin }
// 계정 ID는 그대로 두고 로그인 수단(이메일/비밀번호)만 교체하므로 학습 기록이 유지된다.
export async function PUT(req: Request) {
  const cfgErr = configError();
  if (cfgErr) return cfgErr;

  const parentId = await authParent(req);
  if (!parentId) {
    return NextResponse.json({ error: "학부모 로그인이 필요합니다" }, { status: 401 });
  }

  let body: { childId?: unknown; loginId?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const childId = typeof body.childId === "string" ? body.childId : "";
  const loginId = typeof body.loginId === "string" ? body.loginId.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!childId) return NextResponse.json({ error: "childId가 필요합니다" }, { status: 400 });
  if (!isValidLoginId(loginId)) {
    return NextResponse.json(
      { error: "아이디는 영문 소문자·숫자 3~12자로 만들어주세요" },
      { status: 400 }
    );
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4자리여야 해요" }, { status: 400 });
  }

  const admin = adminClient();

  // 본인 자녀인지 확인
  const { data: link } = await admin
    .from("parent_child")
    .select("id")
    .eq("parent_id", parentId)
    .eq("child_id", childId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: "연결된 자녀가 아닙니다" }, { status: 403 });
  }

  const { data: childProfile } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", childId)
    .single();
  if (!childProfile || childProfile.role !== "student") {
    return NextResponse.json({ error: "학생 계정만 전환할 수 있어요" }, { status: 400 });
  }
  if (isStudentEmail(childProfile.email)) {
    return NextResponse.json({ error: "이미 PIN 계정이에요" }, { status: 400 });
  }

  const email = studentEmail(loginId);
  const { error: updateError } = await admin.auth.admin.updateUserById(childId, {
    email,
    password: derivePassword(loginId, pin),
    email_confirm: true,
  });
  if (updateError) {
    if (/already|exists|registered/i.test(updateError.message)) {
      return NextResponse.json({ error: "이미 사용 중인 아이디예요" }, { status: 409 });
    }
    return NextResponse.json({ error: "전환 실패", detail: updateError.message }, { status: 500 });
  }

  // 화면 표시용 profiles.email도 동기화
  const { error: profileError } = await admin
    .from("profiles")
    .update({ email })
    .eq("id", childId);
  if (profileError) {
    return NextResponse.json({ error: "프로필 갱신 실패", detail: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ loginId });
}

// PIN 재설정: { childId, pin }
export async function PATCH(req: Request) {
  const cfgErr = configError();
  if (cfgErr) return cfgErr;

  const parentId = await authParent(req);
  if (!parentId) {
    return NextResponse.json({ error: "학부모 로그인이 필요합니다" }, { status: 401 });
  }

  let body: { childId?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const childId = typeof body.childId === "string" ? body.childId : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!childId) return NextResponse.json({ error: "childId가 필요합니다" }, { status: 400 });
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4자리여야 해요" }, { status: 400 });
  }

  const admin = adminClient();

  // 본인 자녀인지 확인
  const { data: link } = await admin
    .from("parent_child")
    .select("id")
    .eq("parent_id", parentId)
    .eq("child_id", childId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: "연결된 자녀가 아닙니다" }, { status: 403 });
  }

  const { data: childProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", childId)
    .single();
  if (!childProfile || !isStudentEmail(childProfile.email)) {
    return NextResponse.json(
      { error: "PIN 계정이 아니에요. 이메일로 가입한 계정은 비밀번호를 직접 변경해야 해요." },
      { status: 400 }
    );
  }

  const loginId = loginIdFromEmail(childProfile.email);
  const { error: updateError } = await admin.auth.admin.updateUserById(childId, {
    password: derivePassword(loginId, pin),
  });
  if (updateError) {
    return NextResponse.json({ error: "PIN 변경 실패", detail: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
