const path = require('node:path');
const fs = require('node:fs');
const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'SALU';
pptx.company = 'SALU';
pptx.subject = '현재 구현과 기기 보관 방향을 구분한 검증 전 7주차 발표 예시안';
pptx.title = 'SALU 7주차 발표 예시안';
pptx.lang = 'ko-KR';
pptx.theme = {
  headFontFace: 'Noto Sans CJK KR',
  bodyFontFace: 'Noto Sans CJK KR',
  lang: 'ko-KR',
};

const C = {
  bg: 'F8FAF9', white: 'FFFFFF', ink: '202A3E', muted: '646C7D',
  teal: '155E59', mint: 'E8F2EE', border: 'D9E4E0', blue: '3C57B5',
  coral: 'B96237', peach: 'F7EBE3', navy: '173A3A', dim: 'A8C3BC',
};
const W = 13.333333, H = 7.5;
const ROOT = path.resolve(__dirname, '../../..');
const OUTPUT = path.resolve(__dirname, 'SALU_7주차_발표_예시안.pptx');
const FONT = 'Noto Sans CJK KR';

function box(x, y, w, h) {
  if ([x, y, w, h].some(n => !Number.isFinite(n)) ||
      x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > W + .02 || y + h > H + .02) {
    throw new Error(`슬라이드 밖의 도형: ${JSON.stringify({ x, y, w, h })}`);
  }
}
function text(slide, value, x, y, w, h, size = 20, color = C.ink, bold = false, extra = {}) {
  box(x, y, w, h);
  slide.addText(value, {
    x, y, w, h, fontFace: FONT, fontSize: size, color, bold, margin: 0,
    breakLine: false, valign: 'mid', lang: 'ko-KR', paraSpaceAfterPt: 0,
    ...extra,
  });
}
function rect(slide, x, y, w, h, fill = C.white, border = fill, radius = true) {
  box(x, y, w, h);
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
    x, y, w, h, rectRadius: .13, radius: .13,
    fill: { color: fill }, line: { color: border, width: .8 },
  });
}
function line(slide, x1, y1, x2, y2, color = C.border, arrow = false) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width: 1.3, beginArrowType: 'none', endArrowType: arrow ? 'triangle' : 'none' },
  });
}
function tag(slide, label, x, y, w, bg = C.mint, fg = C.teal) {
  rect(slide, x, y, w, .33, bg);
  text(slide, label, x + .08, y + .025, w - .16, .27, 10.5, fg, true, { align: 'center' });
}
function footer(slide, n, dark = false) {
  const color = dark ? C.dim : C.muted;
  line(slide, .6, 7.03, 12.72, 7.03, dark ? '315554' : C.border);
  text(slide, '검증 전 발표 예시안  ·  2026.10.10 작성', .64, 7.11, 9.8, .2, 10, color);
  text(slide, `${String(n).padStart(2, '0')} / 06`, 11.6, 7.11, 1.06, .2, 10, color, false, { align: 'right' });
}
function base(title, subtitle, n, label = '설계 제안 · 미구현') {
  const slide = pptx.addSlide();
  slide.background = { color: C.bg };
  text(slide, 'SALU', .64, .4, 1.7, .32, 17, C.blue, true);
  tag(slide, label, 10.26, .4, 2.43, label.includes('현재 구현') ? C.mint : C.peach,
    label.includes('현재 구현') ? C.teal : C.coral);
  text(slide, title, .64, 1.04, 12.1, .59, 30, C.ink, true);
  text(slide, subtitle, .66, 1.76, 12, .38, 14.5, C.muted);
  footer(slide, n);
  return slide;
}
function screenshot(slide, filename, x, y, w, h, topFraction, caption) {
  const file = path.join(ROOT, 'docs', 'screenshots', filename);
  const buffer = fs.readFileSync(file);
  const pxW = buffer.readUInt32BE(16), pxH = buffer.readUInt32BE(20);
  const fullH = w * pxH / pxW;
  box(x, y, w, h);
  if (topFraction < 0 || topFraction * fullH + h > fullH) throw new Error('캡처 crop 범위 오류');
  rect(slide, x - .045, y - .045, w + .09, h + .09, C.white, C.border, false);
  slide.addImage({
    path: file, x, y, w, h: fullH,
    sizing: { type: 'crop', w, h, x: 0, y: fullH * topFraction },
    altText: caption,
  });
}
function notes(slide, value) { slide.addNotes(value); }

async function main() {
  {
    const s = pptx.addSlide();
    s.background = { color: C.navy };
    text(s, 'SALU', .7, .58, 3, .66, 40, 'CDE9DC', true);
    tag(s, '7주차 · 검증 전 예시안', 9.52, .74, 3.1, '315554', 'DCECE7');
    text(s, '기록은 혼자 시작하고,\n필요할 때 상담으로', .7, 2.05, 11.9, 1.55, 41, C.white, true, { breakLine: false });
    text(s, '가입 부담 없이 남긴 변화가 다음 요청의 자료가 되도록', .74, 4.08, 11.8, .47, 21, 'D7E7E2');
    const steps = [
      ['01', '내 기기에 기록'], ['02', '필요한 자료 선택'], ['03', '디자이너와 소통'],
    ];
    steps.forEach(([number, label], i) => {
      const x = .74 + i * 4.17;
      text(s, number, x, 5.54, .51, .36, 15, C.dim, true);
      text(s, label, x + .62, 5.47, 3.21, .5, 22, C.white, true);
      if (i < 2) text(s, '→', x + 3.78, 5.51, .4, .4, 21, C.dim);
    });
    footer(s, 1, true);
    notes(s, '발표 예시안이며 2026-10-10 현재 구현과 후속 계획을 구분합니다. 6주차에는 커트 기록과 경과를 디자이너 상담으로 연결하는 방향을 발표했습니다. 이번에는 기록을 시작할 때 로그인을 요구하기보다 먼저 개인 보관을 이용하고, 필요할 때 선택 자료로 상담하는 방향을 검토합니다. 기기 저장·백업·실제 상담은 아직 구현하지 않았습니다.');
  }
  {
    const s = base('현재는 기록에서 상담 준비까지 연결했습니다',
      '실제 React 화면 캡처  ·  화면 속 기록·사진·인물은 메모리 예시', 2, '현재 구현 · 저장은 예시');
    screenshot(s, 'record-mobile.png', .7, 2.51, 2.21, 3.75, .20, '가상 커트 기록과 경과의 실제 React 캡처 일부');
    screenshot(s, 'preview-mobile.png', 3.18, 2.51, 2.21, 3.75, .09, '실제 전송 전 상담 요청 미리보기의 React 캡처 일부');
    text(s, '커트·생활 경과', .72, 6.38, 2.16, .31, 14, C.teal, true, { align: 'center' });
    text(s, '선택한 자료·상대', 3.2, 6.38, 2.16, .31, 14, C.teal, true, { align: 'center' });
    rect(s, 5.89, 2.47, 6.79, 1.27, C.mint);
    text(s, '실제 Spring 인증 연결', 6.13, 2.68, 6.22, .38, 21, C.teal, true);
    text(s, '로그인 · 회원 확인 · 로그아웃 · CSRF', 6.13, 3.17, 6.23, .3, 15.5, C.ink);
    text(s, '클릭 가능한 기록·준비 흐름', 6.13, 4.02, 6.15, .42, 22, C.ink, true);
    text(s, '커트 → 경과 → 필요한 자료 선택\n→ 요청 작성 → 전송 전 미리보기', 6.13, 4.6, 6.14, .92, 20, C.ink);
    rect(s, 5.89, 5.84, 6.79, .82, C.peach);
    text(s, '재접속 보존 · 실제 전송은 미구현', 6.12, 6.04, 6.34, .39, 18, C.coral, true);
    notes(s, '화면은 저장소 docs/screenshots의 실제 React 브라우저 캡처 일부입니다. 커트와 경과의 작성·수정, 자료 선택, 상대 지정, 과거 선택본을 보존하는 미리보기는 메모리 예시로 구현했습니다. 인증만 실제 Spring 서버와 연결되어 있습니다. 기록 영구 저장·사진 업로드·상담 전송·디자이너 답변은 미구현입니다. 근거: docs/features/FR01-current-state-review.md, docs/login.md, docs/prototype-plan.md. 기존 화면 검증을 기기 저장이나 실제 상담 검증으로 설명하지 않습니다.');
  }
  {
    const s = base('첫 접속에서는 기록할지, 둘러볼지 고릅니다',
      '기록을 원치 않아도 계속 이용  ·  재방문은 내 기록과 이어 쓰던 준비본부터', 3);
    rect(s, .65, 2.53, 5.63, 3.76, C.white, C.border);
    text(s, '커트 기록 남겨볼까요?', .98, 3.06, 4.97, .52, 25, C.ink, true);
    text(s, '기억해 둘 변화부터 짧게 남겨 보세요.\n사진과 미용실 정보는 나중에 더해도 됩니다.', .99, 3.8, 4.86, .78, 16, C.muted);
    rect(s, .98, 4.88, 4.97, .55, C.teal);
    text(s, '커트 기록 남기기', 1.12, 4.98, 4.69, .35, 17, C.white, true, { align: 'center' });
    rect(s, .98, 5.55, 4.97, .47, C.white, C.border);
    text(s, '지금은 커뮤니티 둘러보기', 1.12, 5.63, 4.69, .29, 15, C.teal, true, { align: 'center' });
    tag(s, '새 첫 화면의 설계 예시', .98, 2.74, 2.5);
    const choices = [
      ['기록 남기기', '로그인 없이 기기에 보관', C.mint, C.teal],
      ['그냥 둘러보기', '공개된 사례만 읽기', C.white, C.ink],
      ['다시 방문하기', '내 기록 · 요청 준비 이어 쓰기', C.white, C.ink],
    ];
    choices.forEach(([title, desc, bg, fg], i) => {
      const y = 2.53 + i * 1.19;
      rect(s, 6.86, y, 5.81, .98, bg, C.border);
      text(s, title, 7.12, y + .15, 5.23, .35, 20, fg, true);
      text(s, desc, 7.13, y + .6, 5.2, .24, 14, C.muted);
    });
    text(s, '기기 저장·새 첫 화면·커뮤니티 열람은 미구현', 6.93, 6.22, 5.65, .43, 14.5, C.coral, true);
    notes(s, '왼쪽은 편집 가능한 도형으로 만든 신규 첫 화면의 설계 예시이며, 실제 앱 화면이나 기능 시연이 아닙니다. 커뮤니티 열람 API와 데이터는 현재 없습니다. 기기 저장도 미구현입니다. 재방문 때 기존 자료를 바로 찾을 수 있게 하고, 기록을 남기지 않는 사용자에게 회원가입을 반복해서 요구하지 않는 방향입니다. 기록 없이 질문부터 전송하는 정책은 별도 결정이며 이 첫 진입 제안으로 확정된 것이 아닙니다.');
  }
  {
    const s = base('보관·백업·공유는 각각 사용자가 선택합니다',
      '혼자 쓰는 경로도 완결  ·  서버를 쓰는 순간에만 계정과 전달 범위 확인', 4);
    rect(s, .65, 2.53, 4.85, 3.62, C.mint);
    tag(s, '로그인 없이 개인 사용', .92, 2.79, 2.64);
    text(s, '내 기기에 보관', .94, 3.42, 4.3, .45, 25, C.teal, true);
    text(s, '커트 · 날짜별 경과 · 개인 요청 준비\n선택 사진은 파일 본체도 보관', .96, 4.06, 4.24, .77, 17.5, C.ink);
    line(s, .96, 5.07, 5.17, 5.07, 'BAD4CA');
    text(s, '직접 파일로 백업 · 가져와 복원', .96, 5.37, 4.23, .42, 18, C.teal, true);
    text(s, '→', 5.68, 4.11, .59, .5, 30, C.muted, false, { align: 'center' });
    const rows = [
      ['비공개 서버 백업', '내 계정에 명시적으로 보관 · 복원'],
      ['디자이너 1:1 상담', '선택한 상대에게 고른 자료만 전송'],
      ['커뮤니티 공개', '내가 공개할 사례만 별도로 게시'],
    ];
    rows.forEach(([title, desc], i) => {
      const y = 2.53 + i * 1.25;
      rect(s, 6.57, y, 6.1, 1.08, C.white, C.border);
      text(s, title, 6.83, y + .17, 5.54, .35, 20, C.ink, true);
      text(s, desc, 6.85, y + .66, 5.48, .27, 14.5, C.muted);
    });
    rect(s, .65, 6.35, 12.02, .41, C.navy);
    text(s, '로그인만으로 업로드하지 않기  ·  로그아웃해도 기기 기록 유지', .88, 6.4, 11.56, .29, 15.5, C.white, true, { align: 'center' });
    notes(s, '이 장은 제품 방향이며 실제 기기 저장·파일 복원·서버 백업·상담 전송·커뮤니티 작성은 미구현입니다. 로그인 자체로 전체 기록을 자동 업로드하지 않습니다. 상담은 선택한 내용의 사본을 보내며, 전체 기록 백업부터 강요하지 않는 방향입니다. 비공개 백업은 자동 동기화와 별개이고 상담·공개 동의와도 구분합니다. 기기의 보관함과 서버 계정별 자료의 수명을 나누며 공용 기기 접근·삭제·복원 충돌 정책은 구현 전에 결정해야 합니다.');
  }
  {
    const s = base('7주차는 저장한 기록을 다시 여는 것까지',
      '다음 구현·검증 목표  ·  지금 동작하는 기능과 앞으로 확인할 기준을 구분', 5, '다음 목표 · 검증 전');
    const steps = [
      ['01', '기록 시작', '첫 제안에서\n작성 / 건너뛰기'],
      ['02', '기기 저장', '텍스트 커트에\n날짜별 경과 추가'],
      ['03', '다시 접속', '새로고침 · 종료 뒤\n같은 내용 확인'],
      ['04', '상담 준비', '같은 자료를 골라\n기존 미리보기로'],
    ];
    steps.forEach(([n, title, desc], i) => {
      const x = .65 + i * 3.09;
      rect(s, x, 2.58, 2.76, 2.36, i === 2 ? C.mint : C.white, C.border);
      text(s, n, x + .22, 2.81, 2.27, .32, 15, C.teal, true);
      text(s, title, x + .22, 3.35, 2.3, .4, 23, C.ink, true);
      text(s, desc, x + .22, 4.01, 2.29, .65, 15, C.muted);
      if (i < 3) text(s, '→', x + 2.8, 3.58, .29, .34, 17, C.muted, false, { align: 'center' });
    });
    rect(s, .65, 5.2, 7.8, 1.52, C.mint);
    text(s, '완료를 판단할 기준', .92, 5.41, 7.23, .35, 19, C.teal, true);
    text(s, '재접속 후 같은 기록  ·  저장 실패 시 입력 유지\n로그인·로그아웃으로 기기 기록 삭제 없음', .94, 5.91, 7.15, .58, 16, C.ink);
    rect(s, 8.73, 5.2, 3.94, 1.52, C.peach);
    text(s, '시간이 되면 추가', 8.99, 5.41, 3.39, .35, 19, C.coral, true);
    text(s, '파일 백업·복원\n사진 본체 저장·재열람', 9.02, 5.91, 3.31, .58, 16, C.ink);
    notes(s, '7주차 필수 추천은 로그인 없는 텍스트 커트·경과 저장과 재접속 보존, 같은 자료로 기존 상담 준비에 이어지는 흐름입니다. 이 기준은 아직 통과 결과가 아니라 다음 목표입니다. 6주차에서 발표한 회원별 서버 DB 저장·타인 접근 차단 약속은 기기 저장 뒤로 순서를 조정했다고 설명해야 합니다. 파일 백업은 빈 보관함에 실제 가져와 복원할 수 있어야 완료입니다. 사진은 임시 blob 주소만으로 보존했다고 주장하지 않으며, 사진을 포함하는 경우 본체의 저장·재열람과 백업 제공 시 사진 복원까지 확인해야 합니다. 실제 상담과 서버 백업·설치형 앱은 이번 필수 범위로 확장하지 않습니다.');
  }
  {
    const s = base('시험 주간 뒤, 고른 기록으로 상담을 연결합니다',
      '핵심은 기록의 개수보다 고객과 디자이너가 같은 자료로 대화하는 흐름', 6, '이후 순서 · 확정 전');
    const rows = [
      ['7주차', '개인 기록을 다시 열기', '텍스트 저장 · 재접속 · 기존 상담 준비 연결', C.mint, C.teal],
      ['8주차', '시험 · 발표 없음', '개발 여유로 산정하지 않음 · 새 기능 납기 약속 없음', C.peach, C.coral],
      ['이후 후보', '실제 프로필과 HTTP 상담', '선택 자료 전송 → 디자이너 답변 → 이력 재열람', C.white, C.ink],
    ];
    rows.forEach(([week, title, desc, bg, fg], i) => {
      const y = 2.55 + i * 1.22;
      rect(s, .65, y, 12.02, 1.04, bg, C.border);
      text(s, week, .94, y + .31, 1.39, .37, 20, fg, true);
      text(s, title, 2.57, y + .16, 9.67, .4, 22, fg, true);
      text(s, desc, 2.59, y + .67, 9.59, .25, 14.5, C.muted);
    });
    text(s, '현재 화면 흐름 확인 → 저장 연결 후 재검증 → 두 계정 왕복 상담 확인', .78, 6.37, 11.8, .4, 17, C.teal, true);
    notes(s, '다음 발표는 7주차이며 8주차는 시험으로 발표가 없다는 사용자 확인을 반영했습니다. 정확한 발표일과 시험일은 아직 확인하지 않았습니다. 시험 주간을 개발 여유 한 주로 계산하지 않습니다. 이후 실제 디자이너 프로필·선택 파일 업로드·HTTP 상담 연결은 후보이며 완료 날짜는 저장 검증 후 작업량을 다시 추정합니다. 상담의 완료 증거는 고객과 디자이너 두 실제 계정이 선택 자료로 질문·답변하고 제3자와 미선택 기록 접근이 차단되는 것입니다. 후기·공개 사례·댓글·자동 동기화·실시간·앱 포장은 핵심 흐름 뒤에 필요성과 남은 기간을 보고 조정합니다.');
  }
  await pptx.writeFile({ fileName: OUTPUT, compression: true });
  process.stdout.write(`PPTX: ${path.basename(OUTPUT)}, 6장 생성\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
