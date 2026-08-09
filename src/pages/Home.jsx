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

// group: 'general' | 'game' | 'manage'
const dashboardMenu = [
  // ⚽ 경기
  { to: '/attendance', icon: '✅', label: '출석체크', desc: '경기·훈련 출석 체크', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/attendance/history', icon: '🗓️', label: '출석현황', desc: '날짜별 출석 기록', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/polls', icon: '🗳️', label: '투표', desc: '경기 참석 여부 투표', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/calendar', icon: '📅', label: '일정', desc: '월별 경기·구장 일정', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },

  { to: '/roster', icon: '📋', label: '팀명단', desc: '전체 선수 명단 확인', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/rankings', icon: '🏆', label: '순위', desc: '팀 순위 · 득점 순위', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/attendance/stats', icon: '📊', label: '출석율', desc: '선수별 출석률 분석', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/notices', icon: '📢', label: '공지', desc: '팀 공지 확인·작성', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/letter', icon: '💌', label: '마음의 편지', desc: '회장님께 익명으로 전하기', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },

  // 🔧 관리
  { to: '/matches', icon: '⚽', label: '경기 생성 및 기록', desc: '경기 생성·스코어 기록', roles: ['admin', 'executive', 'captain'], group: 'manage' },
  { to: '/archive', icon: '🗂️', label: '아카이브', desc: '시즌별 우승·기록 보관', roles: ['admin', 'executive'], group: 'manage' },
  { to: '/players', icon: '🧑', label: '회원관리', desc: '회원 등록·수정·삭제', roles: ['admin', 'executive'], group: 'manage' },
  { to: '/member-roles', icon: '🔑', label: '권한관리', desc: '회원 권한 부여·변경', roles: ['admin', 'executive'], group: 'manage' },
  { to: '/season-transition', icon: '🔄', label: '시즌 전환', desc: '새 시즌으로 전환·초기화', roles: ['admin'], group: 'manage' },
]

function MenuCard({ item }) {
  return (
    <Link
      to={item.to}
      className="group bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10 flex flex-col items-center text-center"
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
  )
}

function Home() {
  const { profile, role } = useAuth()

  const visibleMenu = dashboardMenu.filter((item) => item.roles.includes(role))

  const sections = [
    { key: 'game', title: '⚽ 경기 메뉴', color: 'text-sky-400', sub: '' },
    { key: 'general', title: '📋 일반 메뉴', color: 'text-emerald-400', sub: '' },
    { key: 'manage', title: '🔧 관리 메뉴', color: 'text-amber-400', sub: '관리자·임원 전용' },
  ]
    .map((sec) => ({ ...sec, items: visibleMenu.filter((m) => m.group === sec.key) }))
    .filter((sec) => sec.items.length > 0)

  return (
    <div className="max-w-5xl mx-auto">
      {/* 환영 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-white">
            안녕하세요, {profile?.name || '회원'}님
          </h1>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium">
            {ROLE_LABELS[role] || role}
          </span>
        </div>

      </div>

      {/* 그룹별 섹션 */}
      {sections.map((sec) => (
        <div key={sec.key} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-lg font-bold ${sec.color}`}>{sec.title}</span>
            {sec.sub && <span className="text-slate-500 text-xs">{sec.sub}</span>}
            <div className="flex-1 h-px bg-slate-700/60"></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {sec.items.map((item) => (
              <MenuCard key={item.to} item={item} />
            ))}
          </div>
        </div>
      ))}

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