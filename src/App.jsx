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
import SeasonRosters from './pages/SeasonRosters'
import PollList from './pages/PollList'
import PollCreate from './pages/PollCreate'
import PollVote from './pages/PollVote'
import MatchRecord from './pages/MatchRecord'
import TeamStandings from './pages/TeamStandings'
import TopScorers from './pages/TopScorers'
import SeasonRanking from './pages/SeasonRanking'
import ScorerRanking from './pages/ScorerRanking'
import MemberRoles from './pages/MemberRoles'
import MemberRegister from './pages/MemberRegister'
import PendingApproval from './pages/PendingApproval'
import NoticeBoard from './pages/NoticeBoard'
import NoticeDetail from './pages/NoticeDetail'
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

// ✅ 메뉴별 접근 가능한 권한 정의
const allMenu = [
  { to: '/roster', label: '📋 팀명단', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/attendance', label: '✅ 출석체크', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/attendance/history', label: '📋 출석현황', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/matches', label: '⚽ 경기순서&결과', roles: ['admin', 'executive', 'captain'] },
  { to: '/season-ranking', label: '📸 순위표', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/scorer-ranking', label: '📸 득점순위표', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/players', label: '👤 선수 관리', roles: ['admin', 'executive'] },
  { to: '/attendance/stats', label: '📊 출석률 통계', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/polls', label: '🗳️ 경기 참석 투표', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/notices', label: '📢 공지사항', roles: ['admin', 'executive', 'captain', 'member'] },
  { to: '/seasons', label: '📚 시즌별명단', roles: ['admin', 'executive'] },
  { to: '/member-roles', label: '🔑 회원 권한 관리', roles: ['admin', 'executive'] },
  // 준회원 전용 메뉴
  { to: '/register', label: '📝 회원 등록/정회원 요청', roles: ['associate'] },
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

  // 준회원: 기존대로 등록/검토 페이지
  if (role === 'associate') {
    return <AssociateHome />
  }

  // 그 외 회원: 홈 대시보드
  return <Home />
}

// 실제 앱 내용 (로그인한 사용자만 여기 도달)
function AppContent() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, role, signOut } = useAuth()

  const visibleMenu = allMenu.filter((item) => item.roles.includes(role))

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* 배경 로고 */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src={logoImg} alt="" className="w-96 h-96 object-contain opacity-[0.07]" />
      </div>

      {/* 상단 네비게이션 (sticky) - 메뉴바 + 티커가 한 덩어리로 고정 */}
      <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 py-4">
          {/* 🍔 메뉴 + 햄버거 버튼 (왼쪽) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
            aria-label="메뉴"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
            <span className="font-medium text-base">메뉴</span>
          </button>

          {/* 오른쪽: 내 정보 + 로그아웃 + 로고 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {profile && (
              <div className="flex flex-col items-end leading-tight">
                <span className="text-white text-xs sm:text-sm font-medium">{profile.name}</span>
                <span className="text-emerald-400 text-[10px] sm:text-xs">{ROLE_LABELS[role] || role}</span>
              </div>
            )}
            <button
              onClick={signOut}
              className="text-slate-300 hover:text-white text-xs sm:text-sm px-2 sm:px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              로그아웃
            </button>
            <Link to="/" className="text-lg sm:text-2xl font-bold text-emerald-400 whitespace-nowrap" onClick={() => setMenuOpen(false)}>
              FM FC
            </Link>
          </div>
        </div>

        {/* ⬇️ 위에서 아래로 펼쳐지는 드롭다운 패널 */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out border-t border-slate-700/50 ${
            menuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="w-full max-w-6xl mx-auto px-4 py-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {visibleMenu.map((item) => (
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

        {/* 📢 공지 티커 (nav 안쪽 = 메뉴바에 딱 붙어서 함께 고정) */}
        <NoticeTicker />
      </nav>

      {/* 🌑 배경 오버레이 (열렸을 때만) */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/40 z-20"
        ></div>
      )}

      {/* 페이지 내용 */}
      <main className="w-full max-w-6xl mx-auto p-4 sm:p-6 relative z-0">
        <Routes>
          {/* 홈 - 권한별 분기 (대시보드 또는 준회원 페이지) */}
          <Route path="/" element={<HomeRedirect />} />

          {/* 선수 관리 (관리자·임원 전용) */}
          <Route path="/players" element={<Protected allowed={['admin', 'executive']}><PlayerList /></Protected>} />
          <Route path="/players/new" element={<Protected allowed={['admin', 'executive']}><PlayerForm /></Protected>} />
          <Route path="/players/:id/edit" element={<Protected allowed={['admin', 'executive']}><PlayerForm /></Protected>} />

          {/* 준회원: 회원 등록/정회원 요청 */}
          <Route path="/register" element={<Protected allowed={['associate', 'admin', 'executive']}><MemberRegister /></Protected>} />

          {/* 출석 */}
          <Route path="/attendance" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceCheck /></Protected>} />
          <Route path="/attendance/history" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceHistory /></Protected>} />
          <Route path="/attendance/stats" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><AttendanceStats /></Protected>} />

          {/* 팀명단 / 시즌별명단 */}
          <Route path="/roster" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><TeamRoster /></Protected>} />
          <Route path="/seasons" element={<Protected allowed={['admin', 'executive']}><SeasonRosters /></Protected>} />

          {/* 투표 */}
          <Route path="/polls" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollList /></Protected>} />
          <Route path="/polls/new" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollCreate /></Protected>} />
          <Route path="/polls/:id" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollVote /></Protected>} />

          {/* 경기 */}
          <Route path="/matches" element={<Protected allowed={['admin', 'executive', 'captain']}><MatchRecord /></Protected>} />

          {/* 순위표 / 득점순위표 */}
          <Route path="/season-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><SeasonRanking /></Protected>} />
          <Route path="/scorer-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><ScorerRanking /></Protected>} />

          {/* 공지사항 (모든 회원 열람) - 상세/작성/수정은 컴포넌트 내부에서 권한 처리 */}
          <Route path="/notices" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><NoticeBoard /></Protected>} />
          <Route path="/notices/new" element={<Protected allowed={['admin', 'executive']}><NoticeDetail /></Protected>} />
          <Route path="/notices/:id" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><NoticeDetail /></Protected>} />

          {/* 회원 권한 관리 (관리자·임원) */}
          <Route path="/member-roles" element={<Protected allowed={['admin', 'executive']}><MemberRoles /></Protected>} />

          {/* 숨김 메뉴 (직접 접근만) - 관리자/임원만 */}
          <Route path="/standings" element={<Protected allowed={['admin', 'executive']}><TeamStandings /></Protected>} />
          <Route path="/scorers" element={<Protected allowed={['admin', 'executive']}><TopScorers /></Protected>} />

          {/* 잘못된 경로는 홈으로 */}
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