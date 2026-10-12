const fs = require("node:fs");
const path = require("node:path");
const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "SALU";
pptx.company = "SALU";
pptx.title = "SALU 7주차 개발 진행보고 개조식안";
pptx.subject = "6주차 예고와 현재 구현·개발 중 보완·후속 작업의 비교";
pptx.lang = "ko-KR";
pptx.theme = {
  headFontFace: "Noto Sans CJK KR",
  bodyFontFace: "Noto Sans CJK KR",
  lang: "ko-KR",
};

const C = {
  bg: "F8FAF9",
  white: "FFFFFF",
  ink: "202A3E",
  muted: "646C7D",
  teal: "155E59",
  mint: "E8F2EE",
  blue: "3C57B5",
  paleBlue: "EBEFFA",
  border: "D9E4E0",
  coral: "B96237",
  peach: "F7EBE3",
};
const W = 13.333333,
  H = 7.5;
const OUTPUT = path.join(__dirname, "SALU_7주차_발표_진행보고_개조식안.pptx");
const FONT = "Noto Sans CJK KR";

function bounds(x, y, w, h) {
  if (
    [x, y, w, h].some((n) => !Number.isFinite(n)) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > W + 0.02 ||
    y + h > H + 0.02
  ) {
    throw new Error(`슬라이드 밖의 도형: ${JSON.stringify({ x, y, w, h })}`);
  }
}
function text(
  s,
  value,
  x,
  y,
  w,
  h,
  size = 22,
  color = C.ink,
  bold = false,
  extra = {},
) {
  bounds(x, y, w, h);
  s.addText(value, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: size,
    color,
    bold,
    margin: 0,
    valign: "mid",
    lang: "ko-KR",
    paraSpaceAfterPt: 0,
    ...extra,
  });
}
function rect(s, x, y, w, h, fill = C.white, border = fill) {
  bounds(x, y, w, h);
  s.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: border, width: 0.8 },
  });
}
function line(s, x, y, w, color = C.border) {
  s.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: 1 } });
}
function base(title, n) {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  text(s, "SALU · 7주차 개발 진행상황", 0.65, 0.4, 9, 0.3, 15, C.blue, true);
  text(s, title, 0.65, 1.0, 12, 0.6, 31, C.ink, true);
  line(s, 0.65, 7.03, 12.03);
  text(s, "진행보고안 · 2026.10.10 기준", 0.65, 7.13, 9, 0.2, 10, C.muted);
  text(
    s,
    n <= 4 ? `${n} / 4` : "보충 · 검증 범위",
    10.13,
    7.12,
    2.55,
    0.22,
    10,
    C.muted,
    false,
    { align: "right" },
  );
  return s;
}
function notes(s, value) {
  s.addNotes(value);
}
function screenshot(s, filename, x, y, w, h, caption) {
  const file = path.join(__dirname, "progress-assets", filename);
  const buffer = fs.readFileSync(file);
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20);
  if (width !== 390 || height !== 844)
    throw new Error(`예상하지 않은 캡처 크기: ${filename}`);
  bounds(x, y, w, h);
  rect(s, x - 0.025, y - 0.025, w + 0.05, h + 0.05, C.white, C.border);
  s.addImage({ path: file, x, y, w, h, altText: caption });
}

async function main() {
  {
    const s = base("이번 주 개발 진행 상황", 1);
    text(s, "6주차 예고", 0.9, 1.99, 3.05, 0.4, 20, C.blue, true);
    text(s, "현재 결과", 4.12, 1.99, 5.04, 0.4, 20, C.teal, true);
    text(s, "진행 상태", 10.02, 1.99, 2.25, 0.4, 20, C.muted, true);
    const rows = [
      [
        "계정·권한 연결",
        "실제 로그인·회원 확인·로그아웃",
        "인증 연결\n기록 권한은 후속",
        C.mint,
        C.teal,
      ],
      [
        "커트·경과 저장·조회",
        "입력·수정·조회 화면\n기록은 메모리 보관",
        "화면 구현\n영구 저장은 후속",
        C.peach,
        C.coral,
      ],
      [
        "React 기록 화면",
        "소개 홈·내 기록·커트 준비\n개인 기록·예시 체험 분리",
        "화면 구성",
        C.mint,
        C.teal,
      ],
    ];
    rows.forEach(([plan, result, status, bg, fg], i) => {
      const y = 2.64 + i * 1.12;
      rect(s, 0.65, y, 12.03, 0.95, C.white, C.border);
      text(s, plan, 0.9, y + 0.19, 3.1, 0.54, 21, C.ink, true);
      text(s, result, 4.12, y + 0.14, 5.6, 0.67, 20, C.ink);
      rect(s, 9.85, y + 0.1, 2.61, 0.75, bg);
      text(s, status, 9.97, y + 0.13, 2.38, 0.68, 17, fg, true, {
        align: "center",
      });
    });
    rect(s, 0.65, 6.17, 12.03, 0.56, C.paleBlue);
    text(
      s,
      "지난주 목업 → 실제 입력·이동 가능한 화면",
      0.94,
      6.27,
      11.45,
      0.35,
      20,
      C.blue,
      true,
    );
    notes(
      s,
      "약 35~45초. 지난주에는 계정과 기록 저장, React 화면을 연결하겠다고 말씀드렸습니다. 현재는 실제 로그인과 기록·경과 입력, 다음 커트 준비 화면까지 연결했습니다. 다만 기록은 메모리에만 보관돼서 재접속 후 유지와 계정별 기록 권한은 아직 남아 있습니다.\n근거: 실제 6주차_캡스톤발표.pptx의 12장, docs/prototype-plan.md 최신 홈 구현 결과, docs/login.md. 인증 연결을 전체 권한 완료로 말하지 않습니다. 기록 DB·사진 업로드·상담 전송은 미구현입니다.",
    );
  }
  {
    const s = base("구현한 사용 흐름", 2);
    text(
      s,
      "경과는 선택 · 커트 준비는 자료 선택 → 요청 작성 → 내용 확인",
      0.68,
      1.72,
      12,
      0.35,
      17,
      C.muted,
    );
    const screens = [
      ["소개 홈", "기록 시작", "home-mobile.png"],
      ["커트·경과", "날짜별 입력·수정", "record-mobile.png"],
      ["참고 자료 선택", "필요한 내용 선택", "materials-mobile.png"],
      ["내용 확인", "다음 커트 요청 정리", "preview-mobile.png"],
    ];
    screens.forEach(([title, subtitle, filename], i) => {
      const x = 0.65 + i * 3.08;
      text(s, title, x, 2.14, 2.78, 0.35, 20, C.teal, true, {
        align: "center",
      });
      text(s, subtitle, x, 2.5, 2.78, 0.22, 15, C.muted, false, {
        align: "center",
      });
      if (i < 3) text(s, "→", x + 2.77, 2.18, 0.32, 0.28, 18, C.muted);
      screenshot(
        s,
        filename,
        x + 0.49,
        2.82,
        1.8,
        (1.8 * 844) / 390,
        `실제 React ${title} 화면, 발표용 가상 기록과 사진`,
      );
    });
    text(
      s,
      "실제 React 캡처 · 발표용 가상 자료 · 실제 상담 전송 전",
      0.69,
      6.79,
      11.95,
      0.22,
      12,
      C.muted,
    );
    notes(
      s,
      "약 60~80초. 이번에는 목업을 보여주는 단계에서 실제 입력하고 이동하는 단계로 넘어갔습니다. 커트한 날의 기록에 경과를 추가하고, 필요한 내용만 골라 다음 커트 요청을 정리할 수 있습니다. 경과는 꼭 작성할 필요가 없고, 준비 과정은 자료 선택·요청 작성·내용 확인 순서입니다. 여기까지는 준비본이며 실제 디자이너에게 전송되지는 않습니다.\n캡처: 2026-10-10~11 정상 React 5174·Spring 8081 실행, Chromium 390×844, 비로그인. 가상 커트·샘플 사진·경과 작성 → 메모·경과 선택 → 요청 작성 → 내용 확인 → 준비 목록을 실제 조작했습니다. 사진은 기존 CC0 예시 사진이며 실제 시술/사용자 자료가 아닙니다. 선택되지 않은 사진은 이번 준비본에 포함하지 않았습니다. 이미지 출처: Alex Neman, CC0, https://commons.wikimedia.org/wiki/File:Man_with_brown_bob_haircut_from_behind.jpg . 이미지·문구는 기록 DB 저장 증거가 아닙니다. 내용 확인 캡처는 작성한 요청과 준비 마치기 버튼을 볼 수 있는 실제 스크롤 위치이며, 같은 가상 자료로 재현했습니다. 짧은 시연은 캡처 설명 일부를 대체하고 시간에 추가하지 않습니다.",
    );
  }
  {
    const s = base("개발 중 보완한 부분", 3);
    text(s, "확인한 문제", 2.56, 2.02, 4.27, 0.36, 20, C.muted, true);
    text(s, "바꾼 동작", 7.25, 2.02, 5.07, 0.36, 20, C.teal, true);
    const rows = [
      [
        "첫 화면",
        "가상 기록부터 표시",
        "소개 홈·빈 개인 기록\n예시 체험 별도 분리",
      ],
      [
        "화면 순서",
        "기능 나열\n다음 행동 강조 부족",
        "준비 행동 우선 표시\n커트 준비 3단계 안내",
      ],
      [
        "입력 동작",
        "지역 형식 날짜\n선택 정보 즉시 열림·닫힘",
        "연·월·일 날짜 표시\n선택 정보 펼침 전환",
      ],
    ];
    rows.forEach(([topic, before, after], i) => {
      const y = 2.64 + i * 1.12;
      rect(s, 0.65, y, 12.03, 0.95, C.white, C.border);
      text(s, topic, 0.92, y + 0.27, 1.44, 0.35, 21, C.blue, true);
      text(s, before, 2.56, y + 0.16, 3.92, 0.63, 21, C.ink);
      text(s, "→", 6.55, y + 0.3, 0.36, 0.33, 20, C.muted);
      text(s, after, 7.25, y + 0.16, 5.03, 0.63, 21, C.teal, true);
    });
    rect(s, 0.65, 6.17, 12.03, 0.56, C.mint);
    text(
      s,
      "PC·모바일 화면 54개 / 실제 인증 11개 통과",
      0.94,
      6.27,
      11.44,
      0.35,
      20,
      C.teal,
      true,
    );
    notes(
      s,
      "약 45~60초. 흐름을 확인하면서 처음 사용하는 사람이 무엇부터 해야 하는지 모호한 부분을 발견했습니다. 그래서 설명 홈을 만들고 개인 기록과 예시를 나눴습니다. 기록 상세에는 다음 커트 준비를 강조하고, 날짜 표시와 선택 정보의 펼침 동작도 정리했습니다. PC·모바일 화면 흐름과 실제 서버 로그인을 나눠 검증했습니다.\n근거: docs/prototype-plan.md 날짜/선택 정보 보완과 최신 홈·흐름 구현 결과. 54개는 서버 없는 화면 전용 E2E, 11개는 실제 인증 E2E입니다. 외부 사용자 평가가 아니며 기록 DB 저장 검증도 아닙니다. 마지막 프로필 정보 순서 조정 후 영향받는 기존 12개를 추가 재검증했습니다.",
    );
  }
  {
    const s = base("남은 작업과 다음 순서", 4);
    const rows = [
      ["01", "기록 보존", "저장 범위 확정 → 커트·경과 저장·재조회"],
      ["02", "계정별 기록", "서버 소유권 연결 → 타인 접근 검증"],
      ["03", "실제 상담", "프로필·선택 자료 전송 → 두 계정 질문·답변"],
    ];
    rows.forEach(([num, title, desc], i) => {
      const y = 2.15 + i * 1.1;
      text(s, num, 0.84, y + 0.1, 0.7, 0.43, 23, C.blue, true);
      text(s, title, 1.78, y + 0.06, 2.72, 0.45, 23, C.ink, true);
      text(s, desc, 4.78, y + 0.1, 7.66, 0.55, 21, C.ink);
      line(s, 0.84, y + 0.83, 11.6);
    });
    rect(s, 0.65, 5.72, 12.03, 0.63, C.peach);
    text(
      s,
      "현재 기록: 이번 접속만 보관 / 새로고침·인증 전환 시 소실",
      0.94,
      5.85,
      11.44,
      0.34,
      19,
      C.coral,
      true,
    );
    text(
      s,
      "8주차 시험 · 발표 없음 / 이후 일정은 작업량 확인 후 조정",
      0.82,
      6.54,
      11.71,
      0.35,
      19,
      C.muted,
    );
    notes(
      s,
      "약 35~45초. 다음은 저장 범위를 확정하고 실제 기록을 저장·조회하는 부분을 연결할 예정입니다. 기록 유지와 다른 계정의 접근 차단을 확인한 뒤 실제 디자이너 상담을 이어 붙이겠습니다. 기기 보관과 서버 백업의 범위는 그 전에 정리해야 합니다. 8주차는 시험으로 발표가 없어, 이후 일정은 남은 작업량을 보고 조정하겠습니다.\n이 순서는 후속 제안입니다. 기기 저장·파일 백업·서버 기록 DB·실제 상담·사진 업로드는 미구현이고 납기를 약속하지 않습니다. 8주차 발표 없음은 사용자 확인 근거이며 정확한 발표/시험 날짜는 넣지 않습니다. 개인 자료의 저장 수명과 인증 경계는 실제 저장 기능 구현 전에 확정해야 합니다.",
    );
  }
  {
    const s = base("보충: 검증 범위", 5);
    s.hidden = true;
    text(s, "화면 흐름", 0.88, 2.12, 3.1, 0.43, 25, C.teal, true);
    text(s, "PC 27 + 모바일 27 = 54개 통과", 4.15, 2.12, 8.23, 0.43, 24, C.ink);
    text(
      s,
      "입력·수정·선택·초안 재진입·개인/예시 분리",
      4.16,
      2.76,
      8.18,
      0.44,
      20,
      C.muted,
    );
    line(s, 0.87, 3.53, 11.54);
    text(s, "실제 인증", 0.88, 3.96, 3.1, 0.43, 25, C.blue, true);
    text(s, "Spring·MySQL 연결 / 11개 통과", 4.15, 3.96, 8.23, 0.43, 24, C.ink);
    text(
      s,
      "로그인·회원 확인·세션·로그아웃·CSRF",
      4.16,
      4.61,
      8.18,
      0.44,
      20,
      C.muted,
    );
    rect(s, 0.65, 5.56, 12.03, 1.02, C.peach);
    text(s, "별도 후속 검증", 0.91, 5.75, 3.12, 0.33, 20, C.coral, true);
    text(
      s,
      "기록 영구 저장·소유권 / 사진 업로드 / 실제 상담 왕복",
      4.15,
      5.75,
      8.1,
      0.6,
      20,
      C.ink,
    );
    notes(
      s,
      "질문 대응용 숨김 슬라이드. test:e2e 54개(46.5초): PC 1440×1000, 모바일 390×844, 화면 전용 모드이며 서버/외부 HTTP·영구 저장 없이 입력·초안·선택본·분리 흐름 검증. test:auth 11개(18.9초): 실제 Spring8081·MySQL3307에서 로그인 실패/성공·회원 조회·세션 교체·cookie·새로고침·로그아웃 확인. 장애·CSRF 오류 일부는 브라우저 응답 재현이며 실제 MySQL 중단 검증이 아닙니다. 마지막 디자이너 프로필 배치 변경 후 영향받는 기존 12개 추가 통과, build·format:check 통과. 정상 서버의 320·390·1440px 주요 화면에서 가로 넘침·JS 오류 없음. 이 숫자는 외부 사용성 평가나 기록 DB·상담 참여자 검증을 뜻하지 않습니다. 근거: docs/prototype-plan.md, docs/login.md. 본문 PDF에서는 이 슬라이드를 제외합니다.",
    );
  }
  await pptx.writeFile({ fileName: OUTPUT, compression: true });
  process.stdout.write(
    `PPTX: ${path.basename(OUTPUT)}, 본문 4장 + 숨김 보충 1장\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
