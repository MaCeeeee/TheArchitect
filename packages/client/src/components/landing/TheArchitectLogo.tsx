interface Props {
  size?: number;
  className?: string;
}

export default function TheArchitectLogo({ size = 32, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="neonGlowOuter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
        </filter>
      </defs>

      {/* Outer glow layer */}
      <g filter="url(#neonGlowOuter)" opacity="0.5">
        {/* T */}
        <line x1="16" y1="10" x2="48" y2="10" stroke="#00ff41" strokeWidth="3.5" strokeLinecap="square" />
        <line x1="32" y1="10" x2="32" y2="30" stroke="#00ff41" strokeWidth="3.5" strokeLinecap="square" />
        {/* Serifs on T */}
        <line x1="14" y1="8" x2="14" y2="12" stroke="#00ff41" strokeWidth="2" />
        <line x1="50" y1="8" x2="50" y2="12" stroke="#00ff41" strokeWidth="2" />

        {/* Divider line */}
        <line x1="22" y1="33" x2="42" y2="33" stroke="#00ff41" strokeWidth="1.5" />

        {/* A */}
        <line x1="32" y1="36" x2="18" y2="56" stroke="#00ff41" strokeWidth="3.5" strokeLinecap="square" />
        <line x1="32" y1="36" x2="46" y2="56" stroke="#00ff41" strokeWidth="3.5" strokeLinecap="square" />
        <line x1="23" y1="48" x2="41" y2="48" stroke="#00ff41" strokeWidth="2.5" strokeLinecap="square" />
        {/* Serifs on A */}
        <line x1="15" y1="54" x2="21" y2="54" stroke="#00ff41" strokeWidth="2" />
        <line x1="43" y1="54" x2="49" y2="54" stroke="#00ff41" strokeWidth="2" />
      </g>

      {/* Main sharp layer */}
      <g filter="url(#neonGlow)">
        {/* T horizontal bar */}
        <line x1="16" y1="10" x2="48" y2="10" stroke="#00ff41" strokeWidth="2.5" strokeLinecap="square" />
        {/* T vertical stem */}
        <line x1="32" y1="10" x2="32" y2="30" stroke="#00ff41" strokeWidth="2.5" strokeLinecap="square" />
        {/* T serifs */}
        <line x1="14" y1="8" x2="14" y2="12" stroke="#00ff41" strokeWidth="1.5" />
        <line x1="50" y1="8" x2="50" y2="12" stroke="#00ff41" strokeWidth="1.5" />
        <line x1="30" y1="28" x2="34" y2="28" stroke="#00ff41" strokeWidth="1.5" />

        {/* Divider */}
        <line x1="22" y1="33" x2="42" y2="33" stroke="#00ff41" strokeWidth="1" opacity="0.6" />

        {/* A left leg */}
        <line x1="32" y1="36" x2="18" y2="56" stroke="#00ff41" strokeWidth="2.5" strokeLinecap="square" />
        {/* A right leg */}
        <line x1="32" y1="36" x2="46" y2="56" stroke="#00ff41" strokeWidth="2.5" strokeLinecap="square" />
        {/* A crossbar */}
        <line x1="23" y1="48" x2="41" y2="48" stroke="#00ff41" strokeWidth="2" strokeLinecap="square" />
        {/* A serifs */}
        <line x1="15" y1="54" x2="21" y2="54" stroke="#00ff41" strokeWidth="1.5" />
        <line x1="43" y1="54" x2="49" y2="54" stroke="#00ff41" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
