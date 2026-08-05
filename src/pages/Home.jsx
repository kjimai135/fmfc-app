import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// 권한 한글 이름
const ROLE_LABELS = {
  admin: '관리자',
  executive: '임원',
  captain: '주장·부주장',
  member: '정회원',
  associate: '준회원',
}

// 대시보드에 보여줄 메뉴 (준회원 전용 메뉴 제외)
const dashboardMenu = [
  { to: '/roster', icon: '📋', label: '팀명단', desc: '전체 선수 명단 확인', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/attendance', icon: '✅', label: '출석체크', desc: '경기·훈련 출석 체크', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/attendance/history', icon: '🗓️', label: '출석현황', desc: '날짜별 출석 기록', roles: ['admin', 'executive', 'captain', 'member'] },
  // ⚽ 경기순서 & 결과: 정회원 제외 (결과는 '경기 스케쥴'에서 열람 가능)
  { to: '/matches', icon: '⚽', label: '경기순서 & 결과', desc: '경기 일정과 결과 기록', roles: ['admin', 'executive', 'captain'] },
  { to: '/calendar', icon: '📅', label: '경기 스케쥴', desc: '월별 경기·구장 일정', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/season-ranking', icon: '🏆', label: '순위표', desc: '시즌 순위 확인', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/scorer-ranking', icon: '👟', label: '득점순위표', desc: '득점왕 순위 확인', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/players', icon: '👤', label: '선수 관리', desc: '선수 등록·수정·삭제', roles: ['admin', 'executive'] },
  { to: '/attendance/stats', icon: '📊', label: '출석률 통계', desc: '선수별 출석률 분석', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/polls', icon: '🗳️', label: '경기 참석 투표', desc: '경기 참석 여부 투표', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/notices', icon: '📢', label: '공지사항', desc: '팀 공지 확인·작성', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/letter', icon: '💌', label: '마음의 편지', desc: '회장님께 익명으로 전하기', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/seasons', icon: '📚', label: '시즌별명단', desc: '시즌별 선수 명단', roles: ['admin', 'executive'] },
  { to: '/member-roles', icon: '🔑', label: '회원 권한 관리', desc: '회원 권한 부여·변경', roles: ['admin', 'executive'] },
]

function Home() {
  const { profile, role } = useAuth()

  // 권한에 맞는 메뉴만 필터링
  const visibleMenu = dashboardMenu.filter((item) => item.roles.includes(role))

  return (
    <div className="max-w-5xl mx-auto">
      {/* 환영 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-white">
            안녕하세요, {profile?.name || '회원'}님 👋
          </h1>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium">
            {ROLE_LABELS[role] || role}
          </span>
        </div>
        <p className="text-slate-400">FM FC 관리 시스템에 오신 것을 환영합니다. ⚽</p>
      </div>

      {/* 메뉴 카드 그리드 (항상 3열 유지) */}
      <div className="grid grid-cols-3 gap-4">
        {visibleMenu.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-200">
              {item.icon}
            </div>
            <h2 className="text-white font-semibold text-base mb-1 group-hover:text-emerald-400 transition-colors">
              {item.label}
            </h2>
            <p className="text-slate-500 text-xs leading-relaxed">
              {item.desc}
            </p>
          </Link>
        ))}
      </div>

      {/* 접근 가능한 메뉴가 없을 때 */}
      {visibleMenu.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🔒</p>
          <p>접근 가능한 메뉴가 없습니다.</p>
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default Home