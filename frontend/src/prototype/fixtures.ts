import type { PrototypeState } from './types';

export function fixtures(): PrototypeState {
  return {
    cuts: [
      {
        id: 'cut-september',
        cutDate: '2026-09-01',
        service: '커트',
        areas: ['FRONT', 'SIDE'],
        goodNote: '앞머리 길이가 마음에 듦',
        salonName: '예시 헤어',
        designerName: '지우',
        price: 25000,
      },
      {
        id: 'cut-august',
        cutDate: '2026-08-12',
        service: '커트',
        areas: ['SIDE', 'BACK'],
        goodNote: '전체적으로 가벼운 느낌이에요',
        salonName: '',
        designerName: '',
        price: undefined,
      },
    ],
    progress: [
      {
        id: 'progress-september',
        cutId: 'cut-september',
        observedOn: '2026-09-15',
        areas: ['SIDE'],
        discomfort: '옆머리가 금방 떠요',
        styling: '드라이만 하고 왁스는 쓰지 않아요',
        question: '옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?',
      },
    ],
    photos: [
      {
        id: 'photo-september',
        cutId: 'cut-september',
        date: '2026-09-01',
        url: '/images/sample-cut.jpg',
        caption: '커트 당일 · 예시 사진',
      },
    ],
    designers: [
      {
        id: 'designer-jiu',
        name: '지우',
        introduction:
          '얼굴형과 모발 상태에 맞는 자연스럽고 손질하기 쉬운 스타일을 함께 이야기합니다.\n커트 후 집에서 느낀 점을 기록과 함께 알려 주세요.',
        specialties: ['커트', '스타일 상담', '집에서 손질'],
        affiliations: [
          { salonName: '그린 헤어', period: '2026. 08 – 현재', current: true },
          { salonName: '예시 헤어', period: '2025. 03 – 2026. 07', current: false },
        ],
        reviewExamples: [
          {
            id: 'review-jiu-1',
            content: '사진과 기록을 보고 손질 방법을 자세히 설명해 줬어요.',
            date: '2026-09-20',
          },
          {
            id: 'review-jiu-2',
            content: '제 질문에 맞춰 다음 커트에서 요청할 부분을 정리할 수 있었어요.',
            date: '2026-08-25',
          },
        ],
      },
      {
        id: 'designer-minseo',
        name: '민서',
        introduction:
          '평소 손질 습관과 원하는 길이를 먼저 확인합니다.\n불편한 부위와 유지하고 싶은 부분을 편하게 알려 주세요.',
        specialties: ['짧은 머리', '옆머리', '커트 상담'],
        affiliations: [{ salonName: '온 헤어', period: '2026. 01 – 현재', current: true }],
        reviewExamples: [
          {
            id: 'review-minseo-1',
            content: '부위별로 고민을 나눠 이야기하니 설명하기 편했어요.',
            date: '2026-09-22',
          },
        ],
      },
    ],
    previews: [],
  };
}
