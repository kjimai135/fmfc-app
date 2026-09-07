import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ⏱️ 경기 소요 시간 (AttendanceStats.jsx와 동일 기준)
const MATCH_DURATION_HOURS = 2;
const PRESENT_STATUSES = ['출석', '늦참', '조퇴'];

// 🗓️ 시즌 값 정규화: "2025-1" / "2025-01" → 모두 "2025-01"로 통일
// ⚠️ goals는 '2025-1', player_stars는 '2025-01' 형식이라 반드시 맞춰줘야 매칭됨
function normalizeSeason(label) {
  if (!label) return null;
  const m = String(label).trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return String(label).trim();
  return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
}

// ⬇️ 최신 시즌이 먼저 오도록 내림차순 정렬
function compareSeasonsDesc(a, b) {
  const pa = String(a).match(/^(\d{4})-(\d{1,2})$/);
  const pb = String(b).match(/^(\d{4})-(\d{1,2})$/);
  if (!pa || !pb) return String(b).localeCompare(String(a));
  const ay = parseInt(pa[1], 10), an = parseInt(pa[2], 10);
  const by = parseInt(pb[1], 10), bn = parseInt(pb[2], 10);
  if (ay !== by) return by - ay;
  return bn - an;
}

function isSpecialGoal(g) {
  if (!g.player_id) return true;
  const name = g.player_name;
  if (name === 'PK(핸디캡)' || name === 'PK' || name === '자책골') return true;
  return false;
}

function parseStartHour(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/\d{1,2}/);
  if (!m) return null;
  const h = parseInt(m[0], 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

function makeIsFinished(resvData) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safeList = Array.isArray(resvData) ? resvData : [];

  const startHourByDate = {};
  for (const r of safeList) {
    if (startHourByDate[r.date] === undefined || r.is_confirmed) {
      const h = parseStartHour(r.time);
      if (h !== null) startHourByDate[r.date] = h;
    }
  }

  return (d) => {
    if (d < todayKey) return true;
    if (d > todayKey) return false;
    const sh = startHourByDate[d];
    if (sh === undefined || sh === null) return true;
    return now.getHours() >= sh + MATCH_DURATION_HOURS;
  };
}

async function fetchAllRows(table, columns) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let all = [];
  try {
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error(`[PersonalRecord] ${table} 조회 실패:`, error.message || error);
        break;
      }
      all = all.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  } catch (e) {
    console.error(`[PersonalRecord] ${table} 조회 중 예외:`, e);
  }
  return all;
}

const SORT_OPTIONS = [
  { key: 'goals', label: '⚽ 득점순' },
  { key: 'star', label: '⭐ 별순' },
  { key: 'attendance', label: '📊 출석율순' },
];

// ⭐ 별 사유별 아이콘·색상
function reasonInfo(reason) {
  if (!reason) return { icon: '⭐', color: '#fbbf24', label: '별' };
  if (reason.includes('챔스') && reason.includes('MVP')) return { icon: '⭐', color: '#a78bfa', label: '챔스 MVP' };
  if (reason.includes('챔스')) return { icon: '👑', color: '#f59e0b', label: '챔스 우승' };
  if (reason.includes('리그')) return { icon: '🏆', color: '#fbbf24', label: '리그 우승' };
  if (reason.includes('득점왕')) return { icon: '👟', color: '#10b981', label: '득점왕' };
  if (reason.includes('베스트')) return { icon: '📊', color: '#60a5fa', label: '베스트 플레이어' };
  if (reason.includes('주장')) return { icon: '🎖️', color: '#f472b6', label: '주장' };
  return { icon: '⭐', color: '#fbbf24', label: reason };
}

// 📐 팝업 크기 (여기 숫자만 바꾸면 크기 조절 가능)
const POPUP_WIDTH = 440;
const POPUP_MAX_HEIGHT = 560;

// ⭐ 별 상세 내역 미니 팝업 (모바일에서도 눌러서 볼 수 있도록)
function StarDetailPopup({ data, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!data) return null;

  const W = 220;
  const margin = 8;
  let left = data.x - W / 2;
  if (left + W > window.innerWidth - margin) left = window.innerWidth - W - margin;
  if (left < margin) left = margin;

  const spaceBelow = window.innerHeight - data.y;
  const placeAbove = spaceBelow < 200;
  const top = placeAbove ? data.y - 28 : data.y + 8;

  return (
    <div
      ref={ref}
      className="fixed z-[60] bg-slate-800 border border-yellow-500/50 rounded-lg shadow-2xl shadow-black/70 overflow-hidden"
      style={{
        left,
        top,
        width: W,
        transform: placeAbove ? 'translateY(-100%)' : 'none',
      }}
    >
      <div className="px-3 py-1.5 bg-yellow-500/15 border-b border-slate-700 flex items-center justify-between">
        <span className="text-yellow-300 text-xs font-bold">⭐ {data.season} 별 내역</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs px-1"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <div className="p-2 space-y-1 max-h-52 overflow-y-auto">
        {data.list.map((x, i) => {
          const info = reasonInfo(x.reason);
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-900/60"
            >
              <span className="text-sm flex-shrink-0">{info.icon}</span>
              <span className="text-xs font-semibold truncate" style={{ color: info.color }}>
                {x.reason || info.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ⭐ 선수 상세 팝업 (클릭한 행 기준 아래/위 배치)
function DetailPopup({ player, seasons, anchor, onClose }) {
  const ref = useRef(null);
  const [starDetail, setStarDetail] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !starDetail) onClose();
    }
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [onClose, starDetail]);

  if (!player || !anchor) return null;

  const gap = 6;
  const margin = 8;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const placeAbove = spaceBelow < POPUP_MAX_HEIGHT && anchor.top > spaceBelow;

  let left = anchor.left;
  if (left + POPUP_WIDTH > window.innerWidth - margin) {
    left = window.innerWidth - POPUP_WIDTH - margin;
  }
  if (left < margin) left = margin;

  const style = placeAbove
    ? { left, top: anchor.top - gap, transform: 'translateY(-100%)' }
    : { left, top: anchor.bottom + gap };

  function handleStarClick(e, season, list) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setStarDetail({
      season,
      list,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  }

  return (
    <>
      <div
        ref={ref}
        className="fixed z-50 bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        style={{ ...style, width: POPUP_WIDTH, maxWidth: '95vw' }}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-amber-500/25 to-orange-500/10 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div className="text-white font-bold text-base">👤 {player.name}</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-base leading-none px-1.5 py-0.5 rounded hover:bg-slate-700 transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 통산 요약 (칩) */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-slate-800/40 border-b border-slate-700">
          <div className="text-center rounded-lg bg-amber-500/10 border border-amber-500/30 py-1.5">
            <div className="text-[11px] text-amber-200/70">통산 득점</div>
            <div className="text-amber-300 font-black text-lg">⚽ {player.totalGoals}</div>
          </div>
          <div className="text-center rounded-lg bg-yellow-500/10 border border-yellow-500/30 py-1.5">
            <div className="text-[11px] text-yellow-200/70">누적 별</div>
            <div className="text-yellow-300 font-black text-lg">⭐ {player.starCount}</div>
          </div>
          <div className="text-center rounded-lg bg-sky-500/10 border border-sky-500/30 py-1.5">
            <div className="text-[11px] text-sky-200/70">통산 출석</div>
            <div className="text-sky-300 font-black text-lg">{player.attendanceRate}%</div>
          </div>
        </div>

        {/* 시즌별 상세 (최신 시즌이 위) */}
        <div className="overflow-y-auto" style={{ maxHeight: POPUP_MAX_HEIGHT - 150 }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800 z-10">
              <tr>
                <th className="text-left text-slate-400 font-medium px-3 py-2">시즌</th>
                <th className="text-center text-amber-300 font-medium px-3 py-2 w-14">⚽</th>
                <th className="text-center text-yellow-300 font-medium px-3 py-2">⭐</th>
                <th className="text-center text-sky-300 font-medium px-3 py-2 w-16">출석</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const goals = player.bySeason[s] || 0;
                const starList = player.starsBySeason?.[s] || [];
                const att = player.attendanceBySeason?.[s];
                return (
                  <tr key={s} className="border-b border-slate-800/70 hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{s}</td>
                    <td className={`px-3 py-2 text-center font-bold ${goals > 0 ? 'text-amber-300' : 'text-slate-600'}`}>
                      {goals}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {starList.length > 0 ? (
                        <button
                          onClick={(e) => handleStarClick(e, s, starList)}
                          className="text-yellow-300 font-bold whitespace-nowrap px-2 py-1 rounded-md hover:bg-yellow-500/20 active:bg-yellow-500/30 transition-colors cursor-pointer"
                          title="눌러서 상세 보기"
                        >
                          {starList.map((x, i) => (
                            <span key={i}>{reasonInfo(x.reason).icon}</span>
                          ))}
                          <span className="ml-1">{starList.length}</span>
                        </button>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {att && att.total > 0 ? (
                        <span className={`font-bold ${att.rate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {att.rate}%
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⭐ 별 상세 미니 팝업 */}
      <StarDetailPopup data={starDetail} onClose={() => setStarDetail(null)} />
    </>
  );
}

export default function PersonalRecord() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [hideZero, setHideZero] = useState(false);
  const [sortKey, setSortKey] = useState('goals');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  // 📜 스크롤·리사이즈 시 팝업 닫기 (위치가 어긋나는 것 방지)
  useEffect(() => {
    if (!selectedPlayer) return;

    function closePopup() {
      setSelectedPlayer(null);
      setAnchor(null);
    }

    window.addEventListener('scroll', closePopup, { passive: true });
    window.addEventListener('resize', closePopup);
    return () => {
      window.removeEventListener('scroll', closePopup);
      window.removeEventListener('resize', closePopup);
    };
  }, [selectedPlayer]);

  async function fetchData() {
    setLoading(true);
    setLoadError('');

    try {
      const playerRes = await supabase.from('players').select('id, name, is_active');
      const goalData = await fetchAllRows('goals', 'player_id, player_name, season, match_id');
      const matchRes = await supabase.from('matches').select('id, game_date, season, is_champions');
      const starData = await fetchAllRows('player_stars', 'player_id, season, reason, note, used_at');
      const attendanceData = await fetchAllRows('attendance', 'player_id, game_date, status');
      const resvRes = await supabase.from('reservations').select('date, time, is_confirmed');

      if (playerRes.error) console.error('[PersonalRecord] players 조회 실패:', playerRes.error.message);
      if (matchRes.error) console.error('[PersonalRecord] matches 조회 실패:', matchRes.error.message);
      if (resvRes.error) console.error('[PersonalRecord] reservations 조회 실패:', resvRes.error.message);

      const playerData = Array.isArray(playerRes.data) ? playerRes.data : [];
      const matchData = Array.isArray(matchRes.data) ? matchRes.data : [];
      const reservationData = Array.isArray(resvRes.data) ? resvRes.data : [];
      const stars = Array.isArray(starData) ? starData : [];
      const attendances = Array.isArray(attendanceData) ? attendanceData : [];

      const activePlayers = playerData.filter((p) => p.is_active !== false);
      const champsMatchIds = new Set(matchData.filter((m) => m.is_champions).map((m) => m.id));

      // ── 📊 출석: 날짜 → 시즌 매핑 + 시즌별 총 경기 수 (리그·종료 경기만) ──
      const isFinished = makeIsFinished(reservationData);
      const dateToSeason = {};
      const seasonGameCount = {};
      const leagueDateSet = new Set();

      matchData.forEach((m) => {
        if (m.is_champions) return;
        if (!isFinished(m.game_date)) return;
        if (leagueDateSet.has(m.game_date)) return;
        leagueDateSet.add(m.game_date);
        const s = normalizeSeason(m.season);
        if (s) {
          dateToSeason[m.game_date] = s;
          seasonGameCount[s] = (seasonGameCount[s] || 0) + 1;
        }
      });
      const totalLeagueGames = leagueDateSet.size;

      const attTotalByPlayer = {};
      const attBySeasonByPlayer = {};
      attendances.forEach((a) => {
        if (!leagueDateSet.has(a.game_date)) return;
        if (!PRESENT_STATUSES.includes(a.status)) return;
        attTotalByPlayer[a.player_id] = (attTotalByPlayer[a.player_id] || 0) + 1;
        const s = dateToSeason[a.game_date];
        if (s) {
          if (!attBySeasonByPlayer[a.player_id]) attBySeasonByPlayer[a.player_id] = {};
          attBySeasonByPlayer[a.player_id][s] = (attBySeasonByPlayer[a.player_id][s] || 0) + 1;
        }
      });

      // ── ⭐ 별: 통산 개수 + 시즌별 목록(사유 포함) ──
      const starTotalByPlayer = {};
      const starBySeasonByPlayer = {};
      const starSeasonSet = new Set();
      stars.forEach((s) => {
        starTotalByPlayer[s.player_id] = (starTotalByPlayer[s.player_id] || 0) + 1;
        const season = normalizeSeason(s.season);
        if (season) {
          starSeasonSet.add(season);
          if (!starBySeasonByPlayer[s.player_id]) starBySeasonByPlayer[s.player_id] = {};
          if (!starBySeasonByPlayer[s.player_id][season]) starBySeasonByPlayer[s.player_id][season] = [];
          starBySeasonByPlayer[s.player_id][season].push({ reason: s.reason, note: s.note });
        }
      });

      // ── 골격 생성 ──
      const agg = {};
      activePlayers.forEach((p) => {
        const present = attTotalByPlayer[p.id] || 0;
        agg[p.id] = {
          id: p.id,
          name: p.name,
          bySeason: {},
          starsBySeason: starBySeasonByPlayer[p.id] || {},
          attendanceBySeason: {},
          totalGoals: 0,
          starCount: starTotalByPlayer[p.id] || 0,
          attendanceRate: totalLeagueGames > 0 ? Math.round((present / totalLeagueGames) * 100) : 0,
        };
      });

      // 시즌 목록: 경기 + 별 + 골에 등장한 모든 시즌 통합
      const seasonSet = new Set([...Object.keys(seasonGameCount), ...starSeasonSet]);

      for (const g of goalData) {
        if (isSpecialGoal(g)) continue;
        if (g.match_id && champsMatchIds.has(g.match_id)) continue;
        const season = normalizeSeason(g.season);
        if (!season) continue;

        seasonSet.add(season);
        const pid = g.player_id;
        if (!agg[pid]) {
          const present = attTotalByPlayer[pid] || 0;
          agg[pid] = {
            id: pid,
            name: g.player_name || '알 수 없음',
            bySeason: {},
            starsBySeason: starBySeasonByPlayer[pid] || {},
            attendanceBySeason: {},
            totalGoals: 0,
            starCount: starTotalByPlayer[pid] || 0,
            attendanceRate: totalLeagueGames > 0 ? Math.round((present / totalLeagueGames) * 100) : 0,
          };
        }
        agg[pid].bySeason[season] = (agg[pid].bySeason[season] || 0) + 1;
        agg[pid].totalGoals += 1;
      }

      // 시즌별 출석율 채우기
      Object.values(agg).forEach((row) => {
        const mine = attBySeasonByPlayer[row.id] || {};
        Object.keys(seasonGameCount).forEach((s) => {
          const total = seasonGameCount[s] || 0;
          const present = mine[s] || 0;
          row.attendanceBySeason[s] = {
            present,
            total,
            rate: total > 0 ? Math.round((present / total) * 100) : 0,
          };
        });
      });

      // ⬇️ 최신 시즌이 맨 위로 오도록 내림차순 정렬
      setSeasons(Array.from(seasonSet).sort(compareSeasonsDesc));
      setRawRows(Object.values(agg));
    } catch (e) {
      console.error('[PersonalRecord] fetchData 전체 실패:', e);
      setLoadError('데이터를 불러오는 중 오류가 발생했습니다. 콘솔(F12)을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }

  const rankedRows = useMemo(() => {
    const metricOf = (r) => {
      if (sortKey === 'star') return r.starCount;
      if (sortKey === 'attendance') return r.attendanceRate;
      return r.totalGoals;
    };

    const sorted = [...rawRows].sort((a, b) => {
      const diff = metricOf(b) - metricOf(a);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'ko');
    });

    let lastVal = null;
    let lastRank = 0;
    sorted.forEach((r, idx) => {
      const val = metricOf(r);
      if (val <= 0) {
        r.rank = null;
        return;
      }
      if (val !== lastVal) {
        lastRank = idx + 1;
        lastVal = val;
      }
      r.rank = lastRank;
    });

    return sorted;
  }, [rawRows, sortKey]);

  const filtered = useMemo(() => {
    let list = rankedRows;
    if (hideZero) {
      list = list.filter((r) =>
        sortKey === 'star' ? r.starCount > 0 : sortKey === 'attendance' ? r.attendanceRate > 0 : r.totalGoals > 0
      );
    }
    const keyword = search.trim();
    if (keyword) list = list.filter((r) => r.name.includes(keyword));
    return list;
  }, [rankedRows, search, hideZero, sortKey]);

  function handleRowClick(e, row) {
    if (selectedPlayer?.id === row.id) {
      setSelectedPlayer(null);
      setAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left });
    setSelectedPlayer(row);
  }

  return (
    <div className="w-full">
      {/* 헤더 카드 */}
      <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-2">
        <h1 className="text-base font-bold text-white flex items-center gap-1.5">📋 개인 기록</h1>
        <p className="text-slate-400 text-xs mt-0.5">
          창단 이후 전체 통산 기록입니다. 이름을 누르면 시즌별 상세 기록을 볼 수 있습니다.
        </p>
      </div>

      {/* 정렬 버튼 */}
      <div className="flex gap-1.5 mb-2">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sortKey === opt.key
                ? 'bg-amber-500 text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 검색창 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-1.5 mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 선수 이름 검색"
          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-600 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-600 text-slate-300 text-xs cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="w-3.5 h-3.5 accent-amber-500"
          />
          기록 있는 선수만
        </label>
      </div>

      {loadError && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-xs">
          ⚠️ {loadError}
        </div>
      )}

      {/* 목록 */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: '100%', maxWidth: '440px' }}>
          <colgroup>
            <col style={{ width: '48px' }} />
            <col />
            <col style={{ width: '56px' }} />
            <col style={{ width: '56px' }} />
            <col style={{ width: '64px' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-800/80">
              <th className="text-slate-300 font-semibold px-2 py-1.5 text-center text-xs">순위</th>
              <th className="text-slate-300 font-semibold px-2 py-1.5 text-left text-xs">이름</th>
              <th className="text-amber-300 font-bold px-2 py-1.5 text-center text-xs">득점</th>
              <th className="text-yellow-300 font-bold px-2 py-1.5 text-center text-xs">별</th>
              <th className="text-sky-300 font-bold px-2 py-1.5 text-center text-xs">출석율</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-8 text-sm">
                  ⏳ 불러오는 중...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-8 text-sm">
                  {search ? `'${search}' 검색 결과가 없습니다.` : '표시할 회원이 없습니다.'}
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => (
                <tr
                  key={r.id}
                  onClick={(e) => handleRowClick(e, r)}
                  className={`cursor-pointer transition-colors hover:bg-slate-700/50 ${
                    selectedPlayer?.id === r.id ? 'ring-1 ring-amber-500 bg-slate-700/40' : ''
                  } ${idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}
                >
                  <td className="px-2 py-1 text-center font-semibold text-slate-300 text-sm">
                    {r.rank ? r.rank : '-'}
                  </td>
                  <td className="px-2 py-1 font-medium text-white truncate text-sm">{r.name}</td>
                  <td className="px-2 py-1 text-center font-bold text-amber-300 bg-slate-800/40">
                    <span className="text-sm">⚽ {r.totalGoals}</span>
                  </td>
                  <td className="px-2 py-1 text-center font-bold text-yellow-300">
                    <span className="text-sm">⭐ {r.starCount}</span>
                  </td>
                  <td className="px-2 py-1 text-center font-bold text-sky-300">
                    <span className="text-sm">{r.attendanceRate}%</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 상세 팝업 */}
      <DetailPopup
        player={selectedPlayer}
        seasons={seasons}
        anchor={anchor}
        onClose={() => {
          setSelectedPlayer(null);
          setAnchor(null);
        }}
      />

      {/* 하단 여백 */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  );
}