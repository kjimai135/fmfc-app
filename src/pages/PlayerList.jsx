import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ✅ 등급(권한) 라벨/색 — MemberRoles와 동일하게 통일
const ROLE_LABELS = {
  admin: '관리자',
  executive: '임원',
  captain: '주장·부주장',
  member: '정회원',
  associate: '준회원',
}

const ROLE_COLORS = {
  admin: 'bg-red-500/20 text-red-400',
  executive: 'bg-orange-500/20 text-orange-400',
  captain: 'bg-blue-500/20 text-blue-400',
  member: 'bg-emerald-500/20 text-emerald-400',
  associate: 'bg-slate-500/20 text-slate-400',
}

function PlayerList() {
  const [players, setPlayers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)

  // 👤 상세 팝업 대상
  const [detailPlayer, setDetailPlayer] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [playerRes, profileRes] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('profiles').select('id, role, player_id'),
    ])

    if (playerRes.error) console.error('선수 불러오기 오류:', playerRes.error)
    else setPlayers(playerRes.data || [])

    if (profileRes.error) console.error('회원 불러오기 오류:', profileRes.error)
    else setProfiles(profileRes.data || [])

    setLoading(false)
  }

  function getRoleForPlayer(playerId) {
    const prof = profiles.find((p) => p.player_id === playerId)
    return prof ? prof.role : null
  }

  async function withdrawPlayer(id, name) {
    if (!window.confirm(`'${name}' 선수를 탈퇴 처리하시겠습니까?\n(데이터는 보존되며, 연결된 계정은 준회원으로 전환됩니다)`)) return

    const { error } = await supabase
      .from('players')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('탈퇴 처리 오류:', error)
      alert('처리에 실패했습니다.')
      return
    }

    const { error: roleError } = await supabase
      .from('profiles')
      .update({ role: 'associate' })
      .eq('player_id', id)

    if (roleError) {
      console.error('권한 강등 오류:', roleError)
      alert('선수는 탈퇴 처리됐지만, 연결된 계정 권한 변경에 실패했습니다. 회원 권한 관리에서 확인해 주세요.')
    }

    setDetailPlayer(null)
    fetchAll()
  }

  async function restorePlayer(id) {
    const { error } = await supabase
      .from('players')
      .update({ is_active: true })
      .eq('id', id)

    if (error) {
      console.error('복구 오류:', error)
      alert('처리에 실패했습니다.')
    } else {
      setDetailPlayer(null)
      fetchAll()
    }
  }

  async function deletePlayerForever(id, name) {
    const ok = window.confirm(
      `⚠️ '${name}' 선수를 완전히 삭제합니다.\n\n` +
      `연결된 출석·득점 기록의 선수 연결이 끊어집니다(기록 자체는 이름으로 남습니다).\n` +
      `이 작업은 되돌릴 수 없습니다. 정말 진행할까요?`
    )
    if (!ok) return

    const ok2 = window.confirm('마지막 확인입니다. 정말 완전히 삭제할까요?')
    if (!ok2) return

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('삭제 오류:', error)
      alert('삭제에 실패했습니다.')
    } else {
      setDetailPlayer(null)
      fetchAll()
    }
  }

  const filtered = players.filter(p => {
    const matchSearch =
      p.name?.includes(search) ||
      p.address?.includes(search) ||
      p.main_position?.includes(search)
    const role = getRoleForPlayer(p.id)
    const matchRole = filterRole ? role === filterRole : true
    const matchActive = showInactive ? true : (p.is_active !== false)
    return matchSearch && matchRole && matchActive
  })

  const positionColor = (pos) => {
    switch(pos) {
      case 'GK': return 'bg-yellow-500/20 text-yellow-400'
      case 'DF': return 'bg-blue-500/20 text-blue-400'
      case 'MF': return 'bg-green-500/20 text-green-400'
      case 'FW': return 'bg-red-500/20 text-red-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  // 출생연도 → "86년생" (뒤 2자리)
  const birthLabel = (birthYear) => {
    if (!birthYear) return '-'
    const yy = String(birthYear).slice(-2).padStart(2, '0')
    return `${yy}년생`
  }

  // 🏟️ 시설공단 계정 배열 안전하게 가져오기
  function getAccounts(player, key) {
    const arr = player?.[key]
    return Array.isArray(arr) ? arr : []
  }

  const detailRole = detailPlayer ? getRoleForPlayer(detailPlayer.id) : null
  const detailInactive = detailPlayer?.is_active === false
  const incheonAccounts = getAccounts(detailPlayer, 'incheon_accounts')
  const bupyeongAccounts = getAccounts(detailPlayer, 'bupyeong_accounts')

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">👤 회원관리</h1>
          <p className="text-slate-400 mt-1">총 {filtered.length}명</p>
        </div>
        <Link
          to="/players/new"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          + 선수 등록
        </Link>
      </div>

      {/* 안내 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-4 text-slate-400 text-sm flex items-center gap-2 flex-wrap">
        <span>ℹ️</span>
        <span>이름을 누르면 상세 정보를 볼 수 있습니다.</span>
        <span className="text-slate-600">·</span>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black bg-emerald-500 text-white">인</span>
        <span className="text-slate-500 text-xs">인시공</span>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black bg-sky-500 text-white">부</span>
        <span className="text-slate-500 text-xs">부시공</span>
      </div>

      {/* 검색 & 필터 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <input
          type="text"
          placeholder="🔍 이름, 주소, 포지션으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">전체 등급</option>
          <option value="admin">관리자</option>
          <option value="executive">임원</option>
          <option value="captain">주장·부주장</option>
          <option value="member">정회원</option>
          <option value="associate">준회원</option>
        </select>
      </div>

      {/* 탈퇴 회원 포함 보기 */}
      <div className="mb-6">
        <label className="inline-flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          탈퇴한 선수도 보기
        </label>
      </div>

      {/* 📋 선수 목록 (가로 얇은 한 줄씩) */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-xl">등록된 선수가 없습니다</p>
          <p className="mt-2">위의 "선수 등록" 버튼을 눌러 선수를 추가하세요!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(player => {
            const inactive = player.is_active === false
            const role = getRoleForPlayer(player.id)
            const hasIncheon = !!player.incheon_member
            const hasBupyeong = !!player.bupyeong_member

            return (
              <button
                key={player.id}
                onClick={() => setDetailPlayer(player)}
                className={`w-full text-left bg-slate-800 hover:bg-slate-700/70 border border-slate-700 hover:border-emerald-500/50 rounded-xl px-3 py-2.5 transition-colors ${
                  inactive ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* 이름 */}
                  <div className="flex items-center gap-1 flex-shrink-0" style={{ minWidth: '62px' }}>
                    <span className="text-white font-bold text-sm truncate">{player.name}</span>
                    {inactive && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-slate-600/40 text-slate-300 flex-shrink-0">
                        탈퇴
                      </span>
                    )}
                  </div>

                  {/* 등급 */}
                  <div className="flex-shrink-0" style={{ minWidth: '58px' }}>
                    {role ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[role] || 'bg-slate-500/20 text-slate-400'}`}>
                        {ROLE_LABELS[role] || role}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-600/30 text-slate-500" title="구글 계정과 연결되지 않음">
                        미연결
                      </span>
                    )}
                  </div>

                  {/* 출생 (항상 표시) */}
                  <span className="text-slate-400 text-[11px] flex-shrink-0 tabular-nums" style={{ minWidth: '48px' }}>
                    {birthLabel(player.birth_year)}
                  </span>

                  {/* 연락처 (항상 표시) */}
                  <span className="text-slate-400 text-[11px] flex-shrink-0 tabular-nums truncate" style={{ minWidth: '96px' }}>
                    {player.phone || '-'}
                  </span>

                  {/* 포지션 (좁으면 숨김) */}
                  <div className="flex-shrink-0 hidden sm:block" style={{ minWidth: '40px' }}>
                    {player.main_position ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${positionColor(player.main_position)}`}>
                        {player.main_position}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">-</span>
                    )}
                  </div>

                  {/* 주소 (넓을 때만) */}
                  <span className="text-slate-500 text-[11px] truncate flex-1 min-w-0 hidden lg:inline">
                    {player.address || '-'}
                  </span>

                  {/* 🏟️ 시설공단 표시 (인 / 부) */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                    {hasIncheon && (
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[10px] font-black bg-emerald-500 text-white"
                        style={{ width: '20px', height: '20px' }}
                        title="인천 시설공단 가입"
                      >
                        인
                      </span>
                    )}
                    {hasBupyeong && (
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[10px] font-black bg-sky-500 text-white"
                        style={{ width: '20px', height: '20px' }}
                        title="부평 시설공단 가입"
                      >
                        부
                      </span>
                    )}
                    <span className="text-slate-600 text-sm ml-0.5">›</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 👤 상세 팝업 */}
      {detailPlayer && (
        <div
          onClick={() => setDetailPlayer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* 팝업 헤더 */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white text-xl font-bold truncate">{detailPlayer.name}</h2>
                  {detailInactive && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600/40 text-slate-300">탈퇴</span>
                  )}
                  {detailRole ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[detailRole] || 'bg-slate-500/20 text-slate-400'}`}>
                      {ROLE_LABELS[detailRole] || detailRole}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600/30 text-slate-500">미연결</span>
                  )}
                </div>
                {detailPlayer.current_team && (
                  <p className="text-slate-400 text-sm mt-1">⚽ {detailPlayer.current_team}</p>
                )}
              </div>
              <button
                onClick={() => setDetailPlayer(null)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2 flex-shrink-0"
                title="닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* 기본 정보 */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700">
                  <p className="text-white font-bold text-sm">👤 기본 정보</p>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">출생년도</p>
                    <p className="text-slate-200">{detailPlayer.birth_year ? `${detailPlayer.birth_year}년 (${birthLabel(detailPlayer.birth_year)})` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">주포지션</p>
                    <p className="text-slate-200">{detailPlayer.main_position || '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">연락처</p>
                    <p className="text-slate-200">{detailPlayer.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">가입일</p>
                    <p className="text-slate-200">{detailPlayer.join_date || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-slate-500 text-xs mb-0.5">주소</p>
                    <p className="text-slate-200">{detailPlayer.address || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 🏟️ 인천 시설공단 */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  borderColor: detailPlayer.incheon_member ? 'rgba(16,185,129,0.4)' : '#334155',
                  background: detailPlayer.incheon_member ? 'rgba(16,185,129,0.06)' : 'rgba(15,23,42,0.4)',
                }}
              >
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between"
                  style={{
                    borderColor: detailPlayer.incheon_member ? 'rgba(16,185,129,0.25)' : '#334155',
                    background: detailPlayer.incheon_member ? 'rgba(16,185,129,0.12)' : 'rgba(51,65,85,0.4)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                      인
                    </span>
                    <p className="text-white font-bold text-sm">인천 시설공단</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    detailPlayer.incheon_member ? 'bg-emerald-500/25 text-emerald-300' : 'bg-slate-600/40 text-slate-400'
                  }`}>
                    {detailPlayer.incheon_member ? '가입' : '미가입'}
                  </span>
                </div>

                {detailPlayer.incheon_member && (
                  <div className="p-3 space-y-2">
                    {incheonAccounts.length === 0 ? (
                      <p className="text-slate-500 text-sm px-1 py-2">등록된 계정 정보가 없습니다</p>
                    ) : (
                      incheonAccounts.map((acc, idx) => (
                        <div key={idx} className="bg-slate-900/60 border border-slate-700/70 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-white font-semibold text-sm truncate">{acc.name || '(이름 없음)'}</span>
                            {acc.citizen && (
                              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/25 text-emerald-300 flex-shrink-0">
                                🏙️ 인천시민
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="min-w-0">
                              <p className="text-slate-500 text-[11px] mb-0.5">아이디</p>
                              <p className="text-slate-200 font-mono truncate">{acc.id || '-'}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-slate-500 text-[11px] mb-0.5">동호회</p>
                              <p className="text-slate-200 truncate">{acc.club || '-'}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 🏟️ 부평 시설공단 */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  borderColor: detailPlayer.bupyeong_member ? 'rgba(14,165,233,0.4)' : '#334155',
                  background: detailPlayer.bupyeong_member ? 'rgba(14,165,233,0.06)' : 'rgba(15,23,42,0.4)',
                }}
              >
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between"
                  style={{
                    borderColor: detailPlayer.bupyeong_member ? 'rgba(14,165,233,0.25)' : '#334155',
                    background: detailPlayer.bupyeong_member ? 'rgba(14,165,233,0.12)' : 'rgba(51,65,85,0.4)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black bg-sky-500 text-white">
                      부
                    </span>
                    <p className="text-white font-bold text-sm">부평 시설공단</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    detailPlayer.bupyeong_member ? 'bg-sky-500/25 text-sky-300' : 'bg-slate-600/40 text-slate-400'
                  }`}>
                    {detailPlayer.bupyeong_member ? '가입' : '미가입'}
                  </span>
                </div>

                {detailPlayer.bupyeong_member && (
                  <div className="p-3 space-y-2">
                    {bupyeongAccounts.length === 0 ? (
                      <p className="text-slate-500 text-sm px-1 py-2">등록된 계정 정보가 없습니다</p>
                    ) : (
                      bupyeongAccounts.map((acc, idx) => (
                        <div key={idx} className="bg-slate-900/60 border border-slate-700/70 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-white font-semibold text-sm truncate">{acc.name || '(이름 없음)'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="min-w-0">
                              <p className="text-slate-500 text-[11px] mb-0.5">아이디</p>
                              <p className="text-slate-200 font-mono truncate">{acc.id || '-'}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-slate-500 text-[11px] mb-0.5">동호회</p>
                              <p className="text-slate-200 truncate">{acc.club || '-'}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 관리 버튼 */}
              <div className="pt-2 border-t border-slate-700/60">
                <p className="text-slate-500 text-xs mb-2.5">🔧 관리</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/players/${detailPlayer.id}/edit`}
                    className="flex-1 min-w-[100px] text-center bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    ✏️ 정보 수정
                  </Link>

                  {detailInactive ? (
                    <>
                      <button
                        onClick={() => restorePlayer(detailPlayer.id)}
                        className="flex-1 min-w-[100px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        ↩️ 복구
                      </button>
                      <button
                        onClick={() => deletePlayerForever(detailPlayer.id, detailPlayer.name)}
                        className="flex-1 min-w-[100px] bg-red-500/15 hover:bg-red-500/25 text-red-400 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        🗑️ 완전삭제
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => withdrawPlayer(detailPlayer.id, detailPlayer.name)}
                      className="flex-1 min-w-[100px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      🚪 탈퇴 처리
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '80px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default PlayerList