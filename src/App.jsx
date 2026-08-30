import { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
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
import Rankings from './pages/Rankings'
import SeasonArchive from './pages/SeasonArchive'
import SeasonTransition from './pages/SeasonTransition'
import StarManage from './pages/StarManage'
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
  { to: '/rankings', label: '🏆 순위 (팀·득점)', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/attendance/stats', label: '📊 출석율', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
  { to: '/stars', label: '⭐ 별 현황', roles: ['admin', 'executive', 'captain', 'member'], group: 'general' },
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

// 🔄 아래로 당겨서 새로고침 (Pull to Refresh)
function usePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const pulling = useRef(false)

  const THRESHOLD = 80 // 이 이상 당기면 새로고침
  const MAX_PULL = 120 // 최대 당김 표시 거리

  useEffect(() => {
    function onTouchStart(e) {
      // 페이지 맨 위에서만 시작
      if (window.scrollY > 0) {
        pulling.current = false
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    function onTouchMove(e) {
      if (!pulling.current || startY.current === null || refreshing) return
      // 스크롤이 내려가면 취소
      if (window.scrollY > 0) {
        pulling.current = false
        setPullDistance(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // 저항감 있게 (당길수록 덜 움직임)
        const dist = Math.min(MAX_PULL, dy * 0.5)
        setPullDistance(dist)
      } else {
        setPullDistance(0)
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return
      if (pullDistance >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        setPullDistance(THRESHOLD)
        // 살짝 딜레이 후 새로고침 (사용자에게 피드백)
        setTimeout(() => {
          window.location.reload()
        }, 300)
      } else {
        setPullDistance(0)
      }
      pulling.current = false
      startY.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullDistance, refreshing])

  return { pullDistance, refreshing, THRESHOLD }
}

// 🔄 당기는 인디케이터 UI
function PullIndicator({ pullDistance, refreshing, threshold }) {
  if (pullDistance <= 0 && !refreshing) return null

  const ready = pullDistance >= threshold
  const opacity = Math.min(1, pullDistance / 40)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: `${pullDistance}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        pointerEvents: 'none',
        opacity,
        transition: refreshing ? 'height 0.2s ease' : 'none',
      }}
    >
      <div
        className="bg-slate-800 border border-emerald-500/40 rounded-full px-4 py-2 shadow-lg flex items-center gap-2"
        style={{ transform: `translateY(${Math.min(10, pullDistance / 8)}px)` }}
      >
        <span
          className="text-emerald-400 text-lg leading-none"
          style={{
            display: 'inline-block',
            transform: refreshing ? 'rotate(0deg)' : `rotate(${pullDistance * 3}deg)`,
            transition: 'transform 0.1s linear',
          }}
        >
          {refreshing ? '⏳' : ready ? '↻' : '↓'}
        </span>
        <span className="text-slate-200 text-xs font-semibold whitespace-nowrap">
          {refreshing ? '새로고침 중...' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}
        </span>
      </div>
    </div>
  )
}

// ⭐ 내 별 개수 조회 (전체 + 잔여)
function useMyStars(playerId) {
  const [stars, setStars] = useState({ total: 0, remain: 0 })

  useEffect(() => {
    let alive = true
    if (!playerId) {
      setStars({ total: 0, remain: 0 })
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('player_stars')
        .select('used_at')
        .eq('player_id', playerId)
      
      if (alive && data) {
        const total = data.length
        const remain = data.filter(s => !s.used_at).length
        setStars({ total, remain })
      }
    })()
    return () => { alive = false }
  }, [playerId])

  return stars
}

// 🌟 진한 노란색 별 배지 (숫자 포함 - 네비용) — 글자 검정·두껍게
function DarkStarBadge({ count = 0, size = 24 }) {
  const n = Number(count) || 0
  const digits = String(n).length
  const fontSize = digits >= 3 ? size * 0.34 : digits === 2 ? size * 0.40 : size * 0.46

  return (
    <span
      className="relative inline-flex items-center justify-center align-middle flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <path
          d="M12 1.8l3.09 6.26 6.91 1.01-5 4.87 1.18 6.88L12 17.57l-6.18 3.25L7 13.94l-5-4.87 6.91-1.01L12 1.8z"
          fill="#f59e0b"
          stroke="#b45309"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="relative font-black leading-none"
        style={{
          fontSize,
          color: '#000000',
          marginTop: size * 0.06,
        }}
      >
        {n}
      </span>
    </span>
  )
}

// ⭐ 연한 노란색 별 배지 (숫자 포함 - 네비용) — 글자 검정·두껍게
function LightStarBadge({ count = 0, size = 24 }) {
  const n = Number(count) || 0
  const digits = String(n).length
  const fontSize = digits >= 3 ? size * 0.34 : digits === 2 ? size * 0.40 : size * 0.46

  return (
    <span
      className="relative inline-flex items-center justify-center align-middle flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <path
          d="M12 1.8l3.09 6.26 6.91 1.01-5 4.87 1.18 6.88L12 17.57l-6.18 3.25L7 13.94l-5-4.87 6.91-1.01L12 1.8z"
          fill="#fef08a"
          stroke="#facc15"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="relative font-black leading-none"
        style={{
          fontSize,
          color: '#000000',
          marginTop: size * 0.06,
        }}
      >
        {n}
      </span>
    </span>
  )
}
// 실제 앱 내용 (로그인한 사용자만 여기 도달)
function AppContent() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, role, isPresident, signOut } = useAuth()
  const { pullDistance, refreshing, THRESHOLD } = usePullToRefresh()

  const myStars = useMyStars(profile?.player_id)

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
      {/* 🔄 당겨서 새로고침 인디케이터 */}
      <PullIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={THRESHOLD} />

      {/* 배경 로고 */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src={logoImg} alt="" className="w-96 h-96 object-contain opacity-[0.07]" />
      </div>

      {/* 당기는 동안 화면 살짝 밀림 효과 */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : 'none',
          transition: pullDistance === 0 ? 'transform 0.25s ease' : 'none',
        }}
      >
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

            {/* 오른쪽: 내 정보(아이콘+이름) + 별 + 로그아웃 + 로고 */}
            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
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

              {/* ⭐ 내 별 개수 (전체 + 잔여) → 별 현황으로 이동 */}
              {profile?.player_id && role !== 'associate' && (
                <Link
                  to="/stars"
                  onClick={() => setMenuOpen(false)}
                  title={`전체 별 ${myStars.total}개 · 잔여 별 ${myStars.remain}개 → 별 현황 보기`}
                  className="flex items-center gap-1.5 hover:scale-105 transition-transform"
                >
                  <DarkStarBadge count={myStars.total} size={24} />
                  <span className="text-slate-600">·</span>
                  <LightStarBadge count={myStars.remain} size={24} />
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
              <Link to="/" className="text-2xl sm:text-4xl font-bold text-emerald-400 whitespace-nowrap ml-2 sm:ml-4" onClick={() => setMenuOpen(false)}>
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
            <Route path="/polls/new" element={<Protected allowed={['admin', 'executive']}><PollCreate /></Protected>} />
            <Route path="/polls/:id" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><PollVote /></Protected>} />

            <Route path="/matches" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><MatchRecord /></Protected>} />

            <Route path="/calendar" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><CalendarPage /></Protected>} />

            {/* 🏆 순위 통합 (팀순위 + 득점순위 스와이프) */}
            <Route path="/rankings" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><Rankings /></Protected>} />
            {/* 개별 직접 접근용 (기존 유지) */}
            <Route path="/season-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><SeasonRanking /></Protected>} />
            <Route path="/scorer-ranking" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><ScorerRanking /></Protected>} />

            {/* 🏆 팀 아카이브 - 관리자·임원만 */}
            <Route path="/archive" element={<Protected allowed={['admin', 'executive']}><SeasonArchive /></Protected>} />

            {/* ⭐ 별 현황 - 전 회원 조회 가능 (수정은 화면 내부에서 admin/executive만) */}
            <Route path="/stars" element={<Protected allowed={['admin', 'executive', 'captain', 'member']}><StarManage /></Protected>} />

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