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
import './App.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-900">
        {/* 상단 네비게이션 */}
        <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold text-emerald-400">
              ⚽ FM FC
            </Link>
            <div className="flex gap-4 flex-wrap">
              <Link to="/" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                👤 선수
              </Link>
              <Link to="/attendance" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                ✅ 출석
              </Link>
              <Link to="/attendance/history" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                📋 현황
              </Link>
              <Link to="/attendance/stats" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                📊 통계
              </Link>
              <Link to="/polls" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                🗳️ 투표
              </Link>
              <Link to="/roster" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                📋 팀명단
              </Link>
              <Link to="/seasons" className="text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-700">
                📚 시즌명단
              </Link>
            </div>
          </div>
        </nav>

        {/* 페이지 내용 */}
        <main className="max-w-6xl mx-auto p-6">
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
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App