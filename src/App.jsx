import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import Home from './pages/Home'
import PlayerList from './pages/PlayerList'
import PlayerForm from './pages/PlayerForm'
import AttendanceCheck from './pages/AttendanceCheck'
import AttendanceHistory from './pages/AttendanceHistory'
import AttendanceStats from './pages/AttendanceStats'
import TeamRoster from './pages/TeamRoster'
import PollList from './pages/PollList'
import PollCreate from './pages/PollCreate'
import PollVote from './pages/PollVote'
import MatchRecord from './pages/MatchRecord'
import TeamStandings from './pages/TeamStandings'
import TopScorers from './pages/TopScorers'
import SeasonRanking from './pages/SeasonRanking'
import ScorerRanking from './pages/ScorerRanking'
import SeasonArchive from './pages/SeasonArchive'
import SeasonTransition from './pages/SeasonTransition'
import MyProfile from './pages/MyProfile'
import MemberRoles from './pages/MemberRoles'
import MemberRegister from './pages/MemberRegister'
import PendingApproval from './pages/PendingApproval'
import NoticeBoard from './pages/NoticeBoard'
import NoticeDetail from './pages/NoticeDetail'
import LetterBoard from './pages/LetterBoard'
import CalendarPage from './pages/CalendarPage'
import NoticeTicker from './components/NoticeTicker'
import logoImg from './assets/logo.png'
import './App.css'

// 권한 한글 이름 (표시용)
const ROLE_LABELS = {
  admin: '관리자',
  executive: '임원',
  captain: '주장·부주장',
  member: '정회원',
  associate: '준회원',
}

// ✅ 메뉴별 접근 권한 + 그룹(group) 정의
// group: 'general'(일반) | 'game'(경기) | 'manage'(관리) | 'associate'(준회원)
const allMenu = [
  // ⚽ 경기
  { to: '/attendance', label: '✅ 출석체크', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/attendance/history', label: '🗓️ 출석현황', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/polls', label: '🗳️ 투표', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },
  { to: '/calendar', label: '📅 일정', roles: ['admin', 'executive', 'captain', 'member'], group: 'game' },

  // 📋 일반
  { to: '/roster', label: '📋 팀명단', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/season-ranking', label: '🏆 팀순위', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/scorer-ranking', label: '👟 득점순위', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/attendance/stats', label: '📊 출석율', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/notices', label: '📢 공지', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/letter', label: '💌 마음의 편지', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },

  // 🔧 관리
  { to: '/matches', label: '⚽ 경기 생성 및 기록', roles: ['admin', 'executive', 'captain'], group: 'manage' },
  { to: '/archive', label: '🗂️ 아카이브', roles: ['admin', 'executive'], group: 'manage' },
  { to: '/players', label: '🧑 회원관리', roles: ['admin', 'executive'], group: 'manage' },
  { to: '/member-roles', label: '🔑 권한관리', roles: ['admin', 'executive'], group: 'manage' },
  // 🔄 시즌 전환: 관리자·회장만 (executive에게도 메뉴는 보이되, 페이지 내부에서 admin/회장만 실행 가능)
  { to: '/season-transition', label: '🔄 시즌 전환', roles: ['admin', 'executive'], group: 'manage' },

  // 📝 준회원 전용
  { to: '/register', label: '📝 회원 등록/정회원 요청', roles: ['associate'], group: 'associate' },
]

// ✅ 권한 없을 때 보여줄 화면
function NoAccess() {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-white mb-2">접근 권한이 없습니다</h2>
      <p className="text-slate-400">이 메뉴에 접근할 수 있는 권한이 없습니다.<br />관리자에게 문의해 주세요.</p>
    </div>
  )
}

// ✅ 권한에 따라 페이지를 보여주거나 막는 래퍼
function Protected({ allowed, children }) {
  const { role, profile } = useAuth()

  if (!profile) {
    return (
      <div className="text-center py-20 text-slate-400">
        ⏳ 권한 확인 중...
      </div>
    )
  }

  if (!allowed.includes(role)) return <NoAccess />
  return children
}

// ✅ 준회원 홈: 신청 전이면 등록 페이지, 신청 후면 검토 중 페이지
function AssociateHome() {
  const { profile } = useAuth()
  if (profile?.player_id) {
    return <PendingApproval />
  }
  return <MemberRegister />
}

// ✅ 로그인 후 첫 화면 라우팅 (권한별 홈)
function HomeRedirect() {
  const { role, profile } = useAuth()

  if (!profile) {
    return (
      <div className="text-center py-20 text-slate-400">
        ⏳ 권한 확인 중...
      </div>
    )
  }

  if (role === 'associate') {
    return <AssociateHome />
  }

  return <Home />
}

// 실제 앱 내용 (로그인한 사용자만 여기 도달)
function AppContent() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, role, isPresident, signOut } = useAuth()

  const visibleMenu = allMenu.filter((item) => item.roles.includes(role))

  // 그룹별 분류 (순서: 경기 → 일반 → 관리 → 준회원)
  const menuSections = [
    { key: 'game', title: '⚽ 경기 메뉴', color: 'text-sky-400', sub: '' },
    { key: 'general', title: '📋 일반 메뉴', color: 'text-emerald-400', sub: '' },
    { key: 'manage', title: '🔧 관리 메뉴', color: 'text-amber-400', sub: '관리자·임원 전용' },
    { key: 'associate', title: '📝 회원 등록', color: 'text-purple-400', sub: '' },
  ]
    .map((sec) => ({ ...sec, items: visibleMenu.filter((m) => m.group === sec.key) }))
    .filter((sec) => sec.items.length > 0)

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* 배경 로고 */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src={logoImg} alt="" className="w-96 h-96 object-contain opacity-[0.07]" />
      </div>

      {/* 상단 네비게이션 (sticky) */}
      <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 py-6">
          {/* 🍔 메뉴 (햄버거 아이콘만) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            title="메뉴"
            className="flex items-center text-white p-2 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
            aria-label="메뉴"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
          </button>

          {/* 오른쪽: 내 정보(아이콘+이름) + 로그아웃 + 로고 */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {profile && (
              <Link
                to="/my-profile"
                title="내 정보"
                className="flex items-center gap-1.5 text-white hover:text-emerald-400 transition-colors whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path>
                </svg>
                <span className="text-sm sm:text-lg font-medium">
                  {profile.name}({isPresident ? '회장' : (ROLE_LABELS[role] || role)})
                </span>
              </Link>
            )}
            <button
              onClick={signOut}
              title="로그아웃"
              aria-label="로그아웃"
              className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
            <Link to="/" className="text-2xl sm:text-4xl font-bold text-emerald-400 whitespace-nowrap ml-4" onClick={() => setMenuOpen(false)}>
              FM FC&nbsp;
            </Link>
          </div>
        </div>

        {/* ⬇️ 드롭다운 패널 (그룹별) */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out border-t border-slate-700/50 ${
            menuOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="w-full max-w-6xl mx-auto px-4 py-4 space-y-4">
            {menuSections.map((sec) => (
              <div key={sec.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-bold ${sec.color}`}>{sec.title}</span>
                  {sec.sub && <span className="text-slate-500 text-xs">{sec.sub}</span>}
                  <div className="flex-1 h-px bg-slate-700/60"></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {sec.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className="text-slate-300 hover:text-white px-4 py-3 rounded-lg hover:bg-slate-700 bg-slate-700/40 text-center font-medium transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 📢 공지 티커 */}
        <NoticeTicker />
      </nav>

      {/* 🌑 배경 오버레이 */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/40 z-20"
        ></div>
      )}

      {/* 페이지 내용 */}
      <main className="w-full max-w-6xl mx-auto p-4 sm:p-6 relative z-0">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/players" element={<Protected allowed={['admin', 'executive']}><PlayerList /></Protected>} />
          <Route path="/players/new" element={<Protected allowed={['admin', 'executive']}><PlayerForm /></Protected>} />
          <Route path="/players/:id/edit" element={<Protected allowed={['admin', 'executive']}><PlayerForm /></Protected>} />

          <Route path="/my-profile" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><MyProfile /></Protected>} />

          <Route path="/register" element={<Protected allowed={['associate', 'admin', 'executive']}><MemberRegister /></Protected>} />

          <Route path="/attendance" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceCheck /></Protected>} />
          <Route path="/attendance/history" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceHistory /></Protected>} />
          <Route path="/attendance/stats" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceStats /></Protected>} />

          <Route path="/roster" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><TeamRoster /></Protected>} />

          <Route path="/polls" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollList /></Protected>} />
          <Route path="/polls/new" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollCreate /></Protected>} />
          <Route path="/polls/:id" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollVote /></Protected>} />

          <Route path="/matches" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><MatchRecord /></Protected>} />

          <Route path="/calendar" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><CalendarPage /></Protected>} />

          <Route path="/season-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><SeasonRanking /></Protected>} />
          <Route path="/scorer-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><ScorerRanking /></Protected>} />

          {/* 🏆 팀 아카이브 - 관리자·임원만 */}
          <Route path="/archive" element={<Protected allowed={['admin', 'executive']}><SeasonArchive /></Protected>} />

          {/* 🔄 시즌 전환 - 라우트는 admin/executive 통과, 실제 실행은 페이지에서 admin/회장만 */}
          <Route path="/season-transition" element={<Protected allowed={['admin', 'executive']}><SeasonTransition /></Protected>} />

          <Route path="/notices" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><NoticeBoard /></Protected>} />
          <Route path="/notices/new" element={<Protected allowed={['admin', 'executive']}><NoticeDetail /></Protected>} />
          <Route path="/notices/:id" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><NoticeDetail /></Protected>} />

          <Route path="/letter" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><LetterBoard /></Protected>} />

          <Route path="/member-roles" element={<Protected allowed={['admin', 'executive']}><MemberRoles /></Protected>} />

          <Route path="/standings" element={<Protected allowed={['admin', 'executive']}><TeamStandings /></Protected>} />
          <Route path="/scorers" element={<Protected allowed={['admin', 'executive']}><TopScorers /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

// 로그인 여부에 따라 화면 분기
function Root() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        ⏳ 불러오는 중...
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return <AppContent />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Root />
      </Router>
    </AuthProvider>
  )
}

export default App