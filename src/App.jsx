import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
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
import logoImg from './assets/logo.png'
import './App.css'

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  // ☰ 모든 메뉴 (햄버거 안에 통합)
  // 🔕 숨김: 전적(/standings), 득점왕(/scorers) — 필요하면 아래 줄 주석 해제
  const allMenu = [
    { to: '/roster', label: '📋 팀명단' },
    { to: '/attendance', label: '✅ 출석체크' },
    { to: '/attendance/history', label: '📋 출석현황' },
    { to: '/matches', label: '⚽ 경기순서&결과' },
    { to: '/season-ranking', label: '📸 순위표' },
    { to: '/scorer-ranking', label: '📸 득점순위표' },
    { to: '/', label: '👤 선수 관리' },
    { to: '/attendance/stats', label: '📊 출석률 통계' },
    { to: '/polls', label: '🗳️ 경기 참석 투표' },
    // { to: '/standings', label: '🏆 전적' },
    // { to: '/scorers', label: '👑 득점왕' },
    { to: '/seasons', label: '📚 시즌별명단' },
  ]

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 relative">
        {/* 배경 로고 */}
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
          <img src={logoImg} alt="" className="w-96 h-96 object-contain opacity-[0.07]" />
        </div>

        {/* 상단 네비게이션 (sticky) */}
        <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-6 py-4">
            {/* 로고 */}
            <Link to="/" className="text-2xl font-bold text-emerald-400 flex-shrink-0" onClick={() => setMenuOpen(false)}>
              ⚽ FM FC
            </Link>

            {/* 🍔 메뉴 + 햄버거 버튼 */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
              aria-label="메뉴"
            >
              <span className="font-medium text-base">메뉴</span>
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              )}
            </button>
          </div>

          {/* ⬇️ 위에서 아래로 펼쳐지는 드롭다운 패널 */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out border-t border-slate-700/50 ${
              menuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allMenu.map((item) => (
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
        </nav>

        {/* 🌑 배경 오버레이 (열렸을 때만) */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 bg-black/40 z-20"
          ></div>
        )}

        {/* 페이지 내용 */}
        <main className="max-w-6xl mx-auto p-6 relative z-0">
          <Routes>
            <Route path="/" element={<PlayerList />} />
            <Route path="/players/new" element={<PlayerForm />} />
            <Route path="/players/:id/edit" element={<PlayerForm />} />
            <Route path="/attendance" element={<AttendanceCheck />} />
            <Route path="/attendance/history" element={<AttendanceHistory />} />
            <Route path="/attendance/stats" element={<AttendanceStats />} />
            <Route path="/roster" element={<TeamRoster />} />
            <Route path="/seasons" element={<SeasonRosters />} />
            <Route path="/polls" element={<PollList />} />
            <Route path="/polls/new" element={<PollCreate />} />
            <Route path="/polls/:id" element={<PollVote />} />
            <Route path="/matches" element={<MatchRecord />} />
            <Route path="/standings" element={<TeamStandings />} />
            <Route path="/season-ranking" element={<SeasonRanking />} />
            <Route path="/scorer-ranking" element={<ScorerRanking />} />
            <Route path="/scorers" element={<TopScorers />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App