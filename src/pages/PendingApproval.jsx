import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function PendingApproval() {
  const { profile } = useAuth()

  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="text-6xl mb-6">⏳</div>
      <h1 className="text-2xl font-bold text-white mb-3">권한 상승 검토 중입니다</h1>
      <p className="text-slate-400 mb-8 leading-relaxed">
        {profile?.name ? `${profile.name} 님, ` : ''}회원 신청이 정상적으로 접수되었습니다.<br />
        관리자가 검토 후 정회원으로 승격해 드립니다.<br />
        조금만 기다려 주세요! 🙌
      </p>

      <div className="bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-xl px-5 py-4 text-sm mb-8">
        🙋 <b>정회원 요청됨</b> — 관리자 승인 대기 중
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-left text-sm text-slate-300 space-y-2">
        <p className="font-bold text-white mb-2">📌 안내</p>
        <p>• 승인되면 팀 명단, 출석, 순위표 등 모든 메뉴를 이용할 수 있어요.</p>
        <p>• 등록한 정보를 수정하고 싶으면 아래 버튼을 눌러주세요.</p>
      </div>

      <Link
        to="/register"
        className="inline-block mt-6 bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
      >
        📝 내 등록 정보 확인/수정
      </Link>
    </div>
  )
}

export default PendingApproval