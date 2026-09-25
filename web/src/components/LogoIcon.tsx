interface LogoIconProps {
  size?: number;
  className?: string;
}

const LogoIcon = ({ size = 32, className }: LogoIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    className={className}
    style={{ transition: "fill 0.4s, stroke 0.4s" }}
  >
    <rect x="4" y="4" width="40" height="40" rx="10" fill="var(--amber)" />
    <path d="M12 16L12 12L16 12" stroke="var(--logo-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M32 12L36 12L36 16" stroke="var(--logo-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M36 32L36 36L32 36" stroke="var(--logo-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 36L12 36L12 32" stroke="var(--logo-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <polygon points="20,17 20,31 32,24" fill="var(--logo-fg)" />
  </svg>
);

export default LogoIcon;
