import type { PrototypeState } from './types';

export function fixtures(): PrototypeState {
  return {
    cuts: [
      {
        id: 'cut-september',
        cutDate: '2026-09-01',
        service: '커트',
        areas: ['FRONT', 'SIDE'],
        goodNote: '',
        salonName: '그린 헤어',
        designerName: '지우',
        designerProfileId: 'designer-jiu',
        price: 25000,
      },
      {
        id: 'cut-july',
        cutDate: '2026-07-12',
        service: '커트',
        areas: ['SIDE', 'BACK'],
        goodNote: '전체적으로 가벼운 느낌이에요',
        salonName: '그린 헤어',
        designerName: '지우',
        designerProfileId: 'designer-jiu',
        price: undefined,
      },
      {
        id: 'cut-may',
        cutDate: '2026-05-03',
        service: '커트',
        areas: ['TOP', 'BACK'],
        goodNote: '뒷볼륨을 정리했어요',
        salonName: '그린 헤어',
        designerName: '지우',
        designerProfileId: 'designer-jiu',
        price: 30000,
      },
    ],
    progress: [
      {
        id: 'progress-september',
        cutId: 'cut-september',
        observedOn: '2026-09-15',
        areas: ['SIDE'],
        discomfort: '옆머리가 떠요',
        styling: '드라이만 하고 왁스는 쓰지 않아요',
        question: '옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?',
      },
      {
        id: 'progress-july',
        cutId: 'cut-july',
        observedOn: '2026-07-19',
        areas: ['BACK'],
        discomfort: '일주일 뒤 뒷머리가 무거워졌어요',
        styling: '아침에 드라이로 볼륨을 넣어요',
        question: '다음에는 뒤쪽을 조금 더 가볍게 정리할 수 있을까요?',
      },
    ],
    photos: [
      {
        id: 'photo-september',
        cutId: 'cut-september',
        date: '2026-09-01',
        url: '/images/cut-september.png',
        caption: '커트 당일',
      },
      {
        id: 'photo-july',
        cutId: 'cut-july',
        date: '2026-07-12',
        url: '/images/cut-july.png',
        caption: '커트 당일',
      },
      {
        id: 'photo-may',
        cutId: 'cut-may',
        date: '2026-05-03',
        url: '/images/cut-may.png',
        caption: '커트 당일',
      },
    ],
    designers: [
      {
        id: 'designer-jiu',
        name: '지우',
        avatarUrl: '/images/jiu-profile.png',
        introduction:
          '얼굴형과 모발 상태에 맞는 자연스럽고 손질하기 쉬운 스타일을 제안해드려요. 편하게 고민을 말씀해주세요.',
        specialties: ['커트', '스타일 상담'],
        affiliations: [
          { salonName: '그린 헤어', period: '2026. 08 – 현재', current: true },
          { salonName: '온 헤어', period: '2025. 03 – 2026. 07', current: false },
        ],
        reviewExamples: [
          {
            id: 'review-jiu-1',
            content: '친절하고 자세하게 알려주셔서 좋았어요.',
            date: '2024-08-20',
          },
          {
            id: 'review-jiu-2',
            content: '제 머리 고민을 잘 이해해주시고 현실적인 방법을 알려주셨어요.',
            date: '2024-07-14',
          },
        ],
      },
    ],
    previews: [],
  };
}
