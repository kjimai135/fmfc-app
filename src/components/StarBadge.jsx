/**
 * ⭐ 별 개수 배지 — 별 모양 안에 숫자 표시 (0도 표시)
 *
 * 사용 예)
 *   <StarBadge count={7} />
 *   <StarBadge count={0} />
 *   <StarBadge count={12} size={34} />
 */
function StarBadge({ count = 0, size = 20, title }) {
  const n = Number(count) || 0

  const digits = String(n).length
  const fontSize = digits >= 3 ? size * 0.34 : digits === 2 ? size * 0.40 : size * 0.46

  return (
    <span
      className="relative inline-flex items-center justify-center align-middle flex-shrink-0"
      style={{ width: size, height: size }}
      title={title || `보유 별 ${n}개`}
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
          fill="#fbbf24"
          stroke="#b45309"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="relative font-black leading-none"
        style={{
          fontSize,
          color: '#78350f',
          marginTop: size * 0.06,
        }}
      >
        {n}
      </span>
    </span>
  )
}

export default StarBadge