import type { ReactNode } from 'react';
import { Icon, PageHeading } from './components';
import { Link } from './workspace';
import { useAuth } from './auth/context';
import { useLoginPath } from './auth/pages';

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
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  return (
    <div className="more-screen">
      <PageHeading title="더보기" />
      {!member && (
        <section className="consultation-soft-panel">
          <p>로그인하면 글쓰기, 찜, 알림을 쓸 수 있어요. 커뮤니티 글은 로그인 없이 볼 수 있어요.</p>
          <Link className="button primary" to={loginPath}>
            로그인
          </Link>
        </section>
      )}
      <Group title="커뮤니티">
        <Item to="/community" title="커뮤니티" note="커트 사례와 고민 질문" />
        {member && <Item to="/community/mine" title="내 글" />}
      </Group>
      <Group title="디자이너">
        <Item to="/designers" title="디자이너 찾기" />
        {member && <Item to="/designers?favorites=1" title="찜한 디자이너" />}
        {member && (
          <Item to="/consultations/received" title="받은 상담" note="디자이너 프로필이 있을 때" />
        )}
        {member && <Item to="/account/designer" title="내 디자이너 프로필" />}
      </Group>
      {admin && (
        <Group title="관리자">
          <Item to="/admin/reports" title="신고 처리" note="신고된 글·댓글과 회원 제재" />
        </Group>
      )}
      {member && (
        <Group title="계정">
          <Item to="/notifications" title="알림" />
          <Item to="/account" title="내 계정" />
          <Item to="/backup" title="저장 상태·백업" />
        </Group>
      )}
    </div>
  );
}
