const fs = require("node:fs");
const path = require("node:path");
const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "SALU";
pptx.company = "SALU";
pptx.title = "SALU 7주차 발표 초안 · 2026-10-12";
pptx.subject = "지난주 예고에 따른 기록·경과 화면 개발 진행 보고";
pptx.lang = "ko-KR";
pptx.theme = {
  headFontFace: "Noto Sans CJK KR",
  bodyFontFace: "Noto Sans CJK KR",
  lang: "ko-KR",
};

const C = {
  bg: "F7F9F8",
  ink: "173E3C",
  teal: "155E59",
  muted: "647B79",
  line: "DCE6E3",
  white: "FFFFFF",
  soft: "EAF2EF",
  coral: "B4543E",
  peach: "F8EDE7",
};
const W = 13.333333;
const H = 7.5;
const OUTPUT = path.join(__dirname, "SALU_7주차_발표_초안_20261012.pptx");

function bounds(x, y, w, h) {
  if (
    [x, y, w, h].some((v) => !Number.isFinite(v)) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > W + 0.01 ||
    y + h > H + 0.01
  ) {
    throw new Error(`슬라이드 경계: ${JSON.stringify({ x, y, w, h })}`);
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
    fontFace: "Noto Sans CJK KR",
    fontSize: size,
    color,
    bold,
    margin: 0,
    valign: "mid",
    breakLine: false,
    paraSpaceAfterPt: 0,
    lang: "ko-KR",
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
function line(s, x, y, w, color = C.line) {
  s.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: 1 } });
}
function base(title, page, hidden = false) {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.hidden = hidden;
  text(
    s,
    "SALU · 7주차 개발 진행 보고",
    0.65,
    0.33,
    11.9,
    0.3,
    14,
    C.teal,
    true,
  );
  text(s, title, 0.65, 0.89, 12, 0.62, 30, C.ink, true);
  line(s, 0.65, 7.04, 12.03);
  text(
    s,
    "발표 초안 · 2026.10.12 현재 코드 기준",
    0.65,
    7.15,
    9.2,
    0.18,
    10,
    C.muted,
  );
  text(
    s,
    hidden ? "질문 대응 · 숨김" : `${page} / 3`,
    10.2,
    7.13,
    2.47,
    0.23,
    10,
    C.muted,
    false,
    { align: "right" },
  );
  return s;
}
function screenshot(s, filename, x, y, w) {
  const file = path.join(__dirname, "draft-assets-20261012", filename);
  const b = fs.readFileSync(file);
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  if (width !== 390 || height !== 740)
    throw new Error(`캡처 크기: ${filename}`);
  const h = (w * height) / width;
  bounds(x, y, w, h);
  rect(s, x - 0.02, y - 0.02, w + 0.04, h + 0.04, C.white, C.line);
  s.addImage({
    path: file,
    x,
    y,
    w,
    h,
    altText: `현재 SALU 개인 화면: ${filename}, 발표용 가상 기록`,
  });
}

async function main() {
  {
    const s = base("지난주 계획과 이번 주 결과", 1);
    text(s, "6주차 예고", 0.94, 2.03, 4.32, 0.38, 22, C.muted, true);
    text(s, "이번 주 구현", 6.19, 2.03, 5.86, 0.38, 22, C.teal, true);
    const rows = [
      ["React 입력·목록 화면", "커트 입력·목록·상세 연결"],
      ["커트·경과 저장·조회", "기기 보관·재접속 후 재조회"],
      ["같은 커트에 경과 추가", "커트별 날짜·변화 기록 연결"],
    ];
    rows.forEach(([plan, result], i) => {
      const y = 2.67 + i * 1.04;
      rect(s, 0.65, y, 12.03, 0.91, C.white, C.line);
      text(s, plan, 0.94, y + 0.2, 4.65, 0.5, 23, C.ink);
      text(s, "→", 5.52, y + 0.25, 0.38, 0.39, 22, C.muted);
      text(s, result, 6.19, y + 0.2, 6.11, 0.5, 23, C.teal, true);
    });
    rect(s, 0.65, 6.0, 12.03, 0.58, C.soft);
    text(
      s,
      "목업 기준 구상 → 직접 작성·저장·조회 가능한 화면",
      0.94,
      6.12,
      11.4,
      0.33,
      22,
      C.teal,
      true,
    );
    text(
      s,
      "완료 기준 확인: 재로그인 유지·계정 분리 — 현재 계정 백업 범위",
      0.73,
      6.76,
      11.95,
      0.23,
      12,
      C.muted,
    );
    s.addNotes(
      "약 40~50초. 지난주에는 커트와 경과를 저장하고 조회하는 기능을 React 입력·목록 화면과 연결하겠다고 말씀드렸습니다. 이번에는 커트 기록을 작성하고 목록과 상세에서 확인한 뒤, 같은 커트에 날짜별 경과를 추가하는 화면을 구현했습니다. 목업과 화면 구상에서 실제 조작하는 흐름으로 넘어간 단계입니다. 기록 유지와 계정 분리는 현재 기기 저장·계정 백업 범위에서 확인했습니다.\n근거: 캡스톤 실제 6주차_캡스톤발표.pptx 12장. 입력·목록과 같은 커트의 경과 추가가 다음 주 예고이며, 재로그인 유지·타인 접근 차단은 완료 기준입니다. 현재 개인 영역은 IndexedDB 기기 보관과 로그인 후 암호화 백업 API를 사용합니다. 별도 커트/경과 도메인 테이블 CRUD와 상담 참여자 권한까지 완료했다고 말하지 않습니다. 최신 코드·검증 원본: docs/personal-storage.md, docs/features/FR02-personal-storage-and-account-backup.md, docs/plans/2026-10-12-screen-audit-and-theme.md. 서버 구조·ZIP·소셜 기능을 본문에서 별도 설명하지 않습니다.",
    );
  }
  {
    const s = base("커트 입력 → 조회 → 경과 추가", 2);
    const screens = [
      ["01  커트 작성", "cut-input-mobile.png"],
      ["02  기록 조회", "records-mobile.png"],
      ["03  경과 추가", "progress-detail-mobile.png"],
    ];
    screens.forEach(([title, file], i) => {
      const x = 0.65 + i * 4.13;
      text(s, title, x, 1.68, 3.78, 0.37, 21, C.teal, true, {
        align: "center",
      });
      screenshot(s, file, x + 0.67, 2.15, 2.43);
      if (i < 2) text(s, "→", x + 3.75, 4.25, 0.42, 0.5, 24, C.muted);
    });
    text(
      s,
      "현재 React 개인 화면 · 가상 기록으로 직접 작성 · 저장 후 새로고침 확인",
      0.73,
      6.84,
      11.88,
      0.19,
      11,
      C.muted,
    );
    s.addNotes(
      "약 70~90초, 캡처 설명 또는 짧은 시연. 커트한 날짜와 부위, 좋았던 점을 입력하고 저장하면 목록과 상세에서 다시 확인할 수 있습니다. 이후 손질하면서 느낀 변화를 같은 커트의 경과로 추가합니다. 화면의 가상 사례는 10월 5일 커트에서 앞머리 길이가 마음에 들었지만, 일주일 뒤인 10월 12일에 옆머리가 다시 뜬 경우입니다. 처음 기록과 D+7 경과를 함께 볼 수 있고, 경과는 필요할 때만 작성합니다.\n짧은 시연은 커트 입력 → 저장 → 목록·상세 → 경과 추가 → 같은 상세에서 확인만 진행하며 캡처 설명 일부를 대체합니다. 로그인·백업·전체 커트 준비 과정까지 늘리지 않습니다.\n캡처: 2026-10-12 정상 개발 React http://127.0.0.1:5174, Chromium 390×740, 밝은 화면·reduced motion·새 비로그인 브라우저. /examples 경로를 사용하지 않고 개인 /records/new에서 실제 가상 기록을 작성했습니다. 사진 없는 최소 기록이며 캡처 자체에는 사진 저장 시연이 없습니다. 입력과 경과 상세는 실제 스크롤 위치에서 캡처했습니다. 날짜·문장은 발표용 가상 자료이고 사용자 평가 결과가 아닙니다. 같은 커트에 경과를 저장한 뒤 새로고침, 목록의 경과 1건, 상세 재진입과 D+7 문구를 직접 확인했습니다. 관련 pageerror/앱 console error와 가로 넘침 없음. 실제 서버 계정 저장을 새로 검증한 캡처는 아닙니다.",
    );
  }
  {
    const s = base("피드백과 다음 개발", 3);
    text(s, "조원 시연·피드백", 0.88, 2.05, 5.6, 0.42, 24, C.teal, true);
    text(s, "다음 연결", 7.01, 2.05, 5.45, 0.42, 24, C.teal, true);
    line(s, 0.87, 2.67, 5.46);
    line(s, 7.01, 2.67, 5.44);
    const sections = [
      [
        0.88,
        "직접 기록하고 경과 추가",
        "입력·저장·조회에서 막힌 지점 확인",
        "문구·버튼·이동 보완",
        "불편한 과정부터 수정 순서 결정",
      ],
      [
        7.01,
        "실제 디자이너 프로필 연결",
        "등록 프로필과 선택 자료 연결",
        "상담 요청·답변·이력",
        "선택 자료로 요청을 보내고 왕복 확인",
      ],
    ];
    sections.forEach(([x, title1, desc1, title2, desc2]) => {
      text(s, title1, x, 3.02, 5.5, 0.47, 23, C.ink, true);
      text(s, desc1, x, 3.65, 5.5, 0.43, 18, C.muted);
      text(s, title2, x, 4.56, 5.5, 0.47, 23, C.ink, true);
      text(s, desc2, x, 5.19, 5.5, 0.43, 18, C.muted);
    });
    rect(s, 0.65, 6.21, 12.03, 0.63, C.peach);
    text(
      s,
      "8주차 시험·발표 없음 / 다음 발표 범위는 피드백 후 확정",
      0.95,
      6.35,
      11.44,
      0.32,
      19,
      C.coral,
      true,
    );
    s.addNotes(
      "약 35~45초. 기록과 경과의 기본 흐름을 조원들이 직접 사용해 보고, 처음 진입과 입력·저장·이동에서 막힌 부분을 우선 확인할 예정입니다. 피드백을 받아 문구와 화면을 보완한 뒤 실제 디자이너 프로필과 상담 요청·답변을 연결하겠습니다. 8주차는 시험으로 발표가 없습니다. 다음 발표 범위와 일정은 피드백과 작업량을 보고 확정하겠습니다.\n조원 피드백은 아직 수집 전으로 기록돼 있으며 실제 사례·만족도 수치를 만들지 않습니다. 개인 커트 준비의 자료 선택·작성·저장 전 확인·보관 화면은 현재 구현되어 있지만 이번 본문에서는 전체 단계를 소개하지 않습니다. 실제 등록 디자이너 API·상담 전송/답변·이력·후기 작성·커뮤니티는 후속입니다. 6주차 11장의 이후 프로필·상담 연결 순서를 참고하되 새 납기를 약속하지 않습니다. NAS 컨테이너 설치 이력과 공개 HTTPS 주소 제공 여부는 별개이며 보충 장에서만 설명합니다.",
    );
  }
  {
    const s = base("보충: 검증 범위와 현재 단계", 4, true);
    const rows = [
      [
        "화면·기기 보관",
        "기존 전체 화면 E2E 102개",
        "기록·경과·초안·ZIP·테마 포함",
      ],
      [
        "인증·계정 백업",
        "실제 Spring 인증 13개 / 계정 저장 5개",
        "salu_test에서 계정 복원·분리 등 확인",
      ],
      [
        "업무 기능",
        "개인 기록·커트 준비 화면까지",
        "도메인 기록 API·실제 프로필·상담은 후속",
      ],
      [
        "공유 상태",
        "NAS 내부 컨테이너 설치·시연 기록",
        "외부 HTTPS·최신 UI 반영·조원 피드백 후속",
      ],
    ];
    rows.forEach(([topic, result, scope], i) => {
      const y = 1.95 + i * 1.13;
      line(s, 0.85, y + 0.94, 11.63);
      text(s, topic, 0.87, y + 0.08, 2.7, 0.4, 21, C.teal, true);
      text(s, result, 3.68, y + 0.02, 8.7, 0.42, 21, C.ink, true);
      text(s, scope, 3.68, y + 0.54, 8.7, 0.34, 16, C.muted);
    });
    text(
      s,
      "자동 검증 항목 수 · 조원 사용성 평가 결과와 구분",
      0.88,
      6.67,
      11.45,
      0.25,
      13,
      C.muted,
    );
    s.addNotes(
      "질문 대응용 숨김 장이며 기본 PDF에서는 제외. 수치는 docs/plans/2026-10-12-screen-audit-and-theme.md의 기존 최종 실행 결과를 확인한 것입니다. 이번 PPT 작업에서 전체 102/13/5를 재실행하지 않았습니다. 102는 PC/모바일 전체 화면·기기 보관/ZIP/테마 범위이며 커트·경과만의 테스트 개수나 사용자 만족도 점수가 아닙니다. 계정 백업은 개인 자료를 암호화 저장·복원하는 API이며 별도 커트/경과 도메인 CRUD와 구분합니다. 현재 캡처에서 새로 확인한 범위는 개인 기록 작성→경과 추가→새로고침→목록·상세 재진입, PC/모바일 첫 화면입니다.\nNAS: docs/nas-preview.md의 최신 실행 기록에 따르면 20261011-flow 태그 컨테이너와 MySQL을 cwsn에 설치하고 SSH 터널로 PC/모바일 내부 시연했습니다. 기존 Docker 전달 이미지와 NAS 내부 시연은 10/11 스냅샷입니다. 10/12 최신 UI를 NAS에 재빌드·반영했거나 외부 HTTPS 주소가 연결됐다고 주장하지 않습니다. NPM 호스트·DNS·TLS·조원 계정 발급·Git 최신 변경 업로드·조원 피드백은 문서상 후속입니다. 실제 Google/네이버 동의·실물 모바일/Safari·스크린리더는 기존 검증 범위 밖입니다.\n자료 기준: 현재 로컬 작업 트리, 실제 6주차 발표 12장, personal-storage.md, FR02, focused-task-flow.md, screen-audit-and-theme.md, nas-preview.md. 발표 본문에 서버 구조·ZIP·소셜·도커 전반을 추가하지 않습니다.",
    );
  }
  await pptx.writeFile({ fileName: OUTPUT, compression: true });
  process.stdout.write(
    `PPTX: ${path.basename(OUTPUT)}, 본문 3장 + 숨김 보충 1장\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
