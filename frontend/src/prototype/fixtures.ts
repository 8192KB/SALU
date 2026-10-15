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
          { salonName: '그린 헤어', period: '2026. 03 – 현재', current: true },
          { salonName: '온 헤어', period: '2022. 03 – 2026. 02', current: false },
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
      // 사진 없는 예시 디자이너는 이름 첫 글자로 표시함
      {
        id: 'designer-seoyun',
        name: '서윤',
        introduction:
          '손상된 모발도 부담 없이 할 수 있는 펌과 관리법을 알려드려요. 평소 손질 습관부터 같이 봐요.',
        specialties: ['펌', '손상모 관리'],
        affiliations: [{ salonName: '바람 헤어', period: '2023. 05 – 현재', current: true }],
        reviewExamples: [
          {
            id: 'review-seoyun-1',
            content: '펌이 자연스럽게 풀려서 손질이 훨씬 편해졌어요.',
            date: '2026-08-28',
          },
        ],
      },
      {
        id: 'designer-dohyun',
        name: '도현',
        introduction:
          '남성 커트와 짧은 머리를 주로 해요. 옆머리 뜨는 고민, 다듬는 주기를 같이 정해 드려요.',
        specialties: ['남성 커트', '투블럭'],
        affiliations: [
          { salonName: '온 헤어', period: '2024. 01 – 현재', current: true },
          { salonName: '그린 헤어', period: '2020. 06 – 2023. 12', current: false },
        ],
        reviewExamples: [
          {
            id: 'review-dohyun-1',
            content: '옆머리가 덜 떠서 아침 손질 시간이 줄었어요.',
            date: '2026-09-10',
          },
          {
            id: 'review-dohyun-2',
            content: '다음에 언제 오면 좋을지까지 알려주셨어요.',
            date: '2026-07-02',
          },
        ],
      },
      {
        id: 'designer-harin',
        name: '하린',
        introduction:
          '피부 톤에 맞는 염색과 가벼운 레이어드 커트를 제안해요. 사진으로 원하는 느낌을 보여 주셔도 좋아요.',
        specialties: ['염색', '레이어드 커트'],
        affiliations: [{ salonName: '마루 헤어', period: '2025. 02 – 현재', current: true }],
        reviewExamples: [],
      },
    ],
    previews: [],
  };
}
