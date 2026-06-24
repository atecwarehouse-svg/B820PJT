// 업로드된 사진의 방향(회전) 검사 — Gemini Vision 사용.
// 사진이 옆으로 눕거나 거꾸로 찍혀 있으면 저장을 막기 위한 판정.
//
// 안전장치(fail-open): API 키 미설정·호출 실패·타임아웃 시에는 검사를 건너뛰고
// { rotated:false } 를 반환하여 정상 업로드가 막히지 않도록 한다.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 8000;

const PROMPT =
  "이 사진이 똑바로 세워진 정상 방향인지 판단하라. " +
  "차량 단말기·안테나·번호판·표출기 등 피사체나 글자가 옆으로 눕거나(90도) 거꾸로(180도) 되어 있으면 rotated=true. " +
  "정상 방향이면 rotated=false. 애매하거나 판단이 어려우면 rotated=false(정상)로 간주하라. " +
  "reason 에는 판단 근거를 한국어로 짧게 적어라.";

export interface RotationResult {
  rotated: boolean;
  reason?: string;
}

export interface CompareResult {
  match: boolean;
  reason?: string;
}

const COMPARE_PROMPT =
  "두 사진을 비교한다. 첫 번째는 올바른 예시(기준) 사진이고, 두 번째는 사용자가 올린 사진이다. " +
  "촬영 대상('LABEL' 칸)이 같은 종류의 장비/대상을 비슷한 구도로 찍은 것인지 판단하라. " +
  "명백히 다른 장비이거나 전혀 다른 장면(칸을 잘못 선택)으로 보이면 match=false. " +
  "같은 종류로 보이면 match=true. 애매하거나 판단이 어려우면 match=true(통과)로 간주하라. " +
  "reason 에는 근거를 한국어로 짧게 적어라.";

// 업로드 사진이 기준사진과 같은 대상/구도인지 비교. fail-open(키 없음·오류 시 match=true).
export async function comparePhotoToReference(
  uploaded: Buffer,
  reference: Buffer,
  label: string,
): Promise<CompareResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { match: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: COMPARE_PROMPT.replace("LABEL", label || "해당") },
              { inline_data: { mime_type: "image/jpeg", data: reference.toString("base64") } },
              { inline_data: { mime_type: "image/jpeg", data: uploaded.toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { match: { type: "boolean" }, reason: { type: "string" } },
            required: ["match"],
          },
        },
      }),
    });
    if (!res.ok) return { match: true };
    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { match: true };
    const parsed = JSON.parse(text) as CompareResult;
    // match가 명시적으로 false일 때만 불일치로 본다(보수적).
    return { match: parsed.match !== false, reason: parsed.reason };
  } catch {
    return { match: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPhotoRotation(buffer: Buffer): Promise<RotationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // 키 미설정 → 검사 생략 (기존 업로드 동작 유지)
    return { rotated: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              rotated: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["rotated"],
          },
        },
      }),
    });

    if (!res.ok) {
      // 호출 실패 → fail-open (업로드 허용)
      return { rotated: false };
    }

    const json = await res.json();
    const text: string | undefined =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { rotated: false };

    const parsed = JSON.parse(text) as RotationResult;
    return { rotated: parsed.rotated === true, reason: parsed.reason };
  } catch {
    // 네트워크 오류·타임아웃·파싱 실패 → fail-open
    return { rotated: false };
  } finally {
    clearTimeout(timer);
  }
}
