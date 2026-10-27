import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, PageHeading } from './components';
import { Link } from './workspace';
import { useAuth } from './auth/context';
import { directoryRequest } from './auth/api';
import { useLoginPath } from './auth/pages';
import { useOnReactivate } from './realtime';

function Item({ to, title, note }: { to: string; title: string; note?: string }) {
  return (
    <li>
      <Link to={to}>
        <span>
          <strong>{title}</strong>
          {note && <small>{note}</small>}
        </span>
        <Icon name="arrow" size={16} />
      </Link>
    </li>
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="more-group">
      <h2>{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

// 하단 메뉴 맨 오른쪽. 기록·준비·상담 밖의 기능을 모아 둠
export function MorePage() {
  const { state } = useAuth();
  const loginPath = useLoginPath();
  const member = state.status === 'authenticated';
  const memberId = state.status === 'authenticated' ? state.member.id : null;
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  // 받은 상담은 디자이너 프로필이 있는 회원에게만 보여 줌. 확인하지 못하면(null) 숨기지 않음
  const [designer, setDesigner] = useState<boolean | null>(null);
  const checkDesigner = useCallback(() => {
    if (memberId === null) return;
    return directoryRequest<{ id: string }>('/api/my/designer-profile').then(
      (profile) => setDesigner(Boolean(profile)),
      () => setDesigner(null),
    );
  }, [memberId]);
  useEffect(() => {
    setDesigner(null);
    void checkDesigner();
  }, [checkDesigner]);
  // 프로필을 등록하고 돌아오면 받은 상담이 바로 보이게 다시 확인함
  useOnReactivate(checkDesigner);
  return (
    <div className="more-screen">
      <PageHeading title="더보기" />
      {!member && (
        <section className="consultation-soft-panel">
          <p>
            로그인하면 글쓰기, 찜, 알림을 쓸 수 있어요.
            <br />
            커뮤니티 글은 로그인 없이 볼 수 있어요.
          </p>
          <Link className="button primary" to={loginPath}>
            로그인
          </Link>
        </section>
      )}
      <Group title="커뮤니티">
        <Item to="/community" title="전체 글" note="커트 사례와 고민 질문" />
        {member && <Item to="/community/mine" title="내 글" />}
      </Group>
      <Group title="디자이너">
        <Item to="/designers" title="디자이너 찾기" />
        {member && <Item to="/designers?favorites=1" title="찜한 디자이너" />}
        {member && designer !== false && <Item to="/consultations/received" title="받은 상담" />}
        {member && <Item to="/account/designer" title="내 디자이너 프로필" />}
      </Group>
      {admin && (
        <Group title="관리자">
          <Item to="/admin/reports" title="신고 처리" note="신고된 글과 댓글, 회원 제재" />
        </Group>
      )}
      {member && (
        <Group title="계정">
          <Item to="/notifications" title="알림" />
          <Item to="/account" title="내 계정" />
          <Item to="/backup" title="기록 백업" />
        </Group>
      )}
    </div>
  );
}
