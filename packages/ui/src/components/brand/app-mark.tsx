import { useId, type SVGProps } from 'react';
import { cn } from '../../lib/utils';

export type AppMarkProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

/** 渐变底 + 居中放大胶囊体；外圈圆角、内芯渐变、顶部半圆高光。 */
export const AppMark = ({ className, size = 36, ...props }: AppMarkProps) => {
  const id = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      {...props}
    >
      <defs>
        <linearGradient
          id={`${id}-bg`}
          x1="4"
          y1="2"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#312E81" />
          <stop offset="0.5" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <radialGradient
          id={`${id}-sheen`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(0 12 -12 0 11 9)"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${id}-core`}
          x1="11"
          y1="8"
          x2="21"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#BAE6FD" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#F9A8D4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="10" fill={`url(#${id}-bg)`} />
      <rect x="1" y="1" width="30" height="30" rx="10" fill={`url(#${id}-sheen)`} />
      <g>
        <rect x="7.5" y="5" width="17" height="22" rx="8.5" fill="#F8FAFC" />
        <rect x="10" y="7.5" width="12" height="17" rx="6" fill={`url(#${id}-core)`} />
        <path
          d="M 11.5 10.5 A 4.75 4.75 0 0 1 20.5 10.5"
          stroke="#FFFFFF"
          strokeOpacity="0.55"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M 9.5 24 A 3.25 3.25 0 0 0 16 24 A 3.25 3.25 0 0 0 22.5 24"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.35" fill="#FFFFFF" fillOpacity="0.92" />
      </g>
    </svg>
  );
};
