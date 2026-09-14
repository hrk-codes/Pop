import { motion } from 'motion/react';

import type { ExpressionState } from './machine';

export function PopAvatar({
  expression,
  gaze = { x: 0, y: 0 },
  size,
}: {
  expression: ExpressionState;
  gaze?: { x: number; y: number };
  size: number;
}) {
  const sleeping = expression === 'sleeping';
  const privacy = expression === 'privacy';
  const uncertain = expression === 'uncertain' || expression === 'blocked';
  const happy = ['success', 'encouraging', 'playful'].includes(expression);
  const playful = expression === 'playful';
  const curious = expression === 'curious';
  const thinking = expression === 'thinking';
  const speaking = expression === 'speaking';
  const eyeX = gaze.x * 2.8;
  const eyeY = gaze.y * 2.2;

  return (
    <motion.svg
      animate={{ scale: expression === 'thinking' ? [1, 1.035, 1] : 1, rotate: uncertain ? -3 : 0 }}
      aria-label={`POP is ${expression}`}
      className={`pop-avatar pop-avatar--${expression}`}
      height={size}
      role="img"
      transition={{
        duration: expression === 'thinking' ? 1.2 : 0.2,
        repeat: expression === 'thinking' ? Infinity : 0,
      }}
      viewBox="0 0 120 120"
      width={size}
    >
      <defs>
        <filter id="pop-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="4" floodColor="#101311" floodOpacity=".24" stdDeviation="4" />
        </filter>
      </defs>
      <g filter="url(#pop-shadow)">
        <motion.path
          animate={{ rotate: expression === 'attentive' || curious ? 8 : playful ? -5 : 0 }}
          d="M50 25C34 18 35 3 43 2c10-1 17 12 16 23Z"
          fill="#ff5a4f"
          style={{ transformOrigin: '54px 24px' }}
        />
        <path d="M62 21C66 8 80 7 84 13c3 7-7 15-22 16Z" fill="#72d7b0" />
        <circle cx="60" cy="65" fill="#ff5a4f" r="50" />
        <ellipse cx="60" cy="68" fill="#fffdf8" rx="39" ry="34" />
        {sleeping || privacy ? (
          <g fill="none" stroke="#292b2a" strokeLinecap="round" strokeWidth="4">
            <path d={privacy ? 'M38 63h14' : 'M38 62q7 7 14 0'} />
            <path d={privacy ? 'M68 63h14' : 'M68 62q7 7 14 0'} />
          </g>
        ) : (
          <g className="pop-eyes">
            <motion.ellipse
              animate={{
                cx: 45 + eyeX,
                cy: 62 + eyeY,
                scaleY: playful ? [1, 0.16, 1] : thinking ? 0.7 : 1,
              }}
              cx="45"
              cy="62"
              fill="#292b2a"
              rx="7"
              ry="8"
            />
            <motion.ellipse
              animate={{ cx: 75 + eyeX, cy: 62 + eyeY, scaleY: thinking ? 0.7 : 1 }}
              cx="75"
              cy="62"
              fill="#292b2a"
              rx="7"
              ry="8"
            />
            <motion.circle
              animate={{ cx: 47 + eyeX, cy: 59 + eyeY }}
              cx="47"
              cy="59"
              fill="white"
              r="2"
            />
            <motion.circle
              animate={{ cx: 77 + eyeX, cy: 59 + eyeY }}
              cx="77"
              cy="59"
              fill="white"
              r="2"
            />
          </g>
        )}
        {happy && (
          <g fill="#ff9b91" opacity=".5">
            <circle cx="35" cy="75" r="4" />
            <circle cx="85" cy="75" r="4" />
          </g>
        )}
        <motion.path
          animate={{
            d: speaking
              ? ['M49 78 Q60 86 71 78', 'M53 78 Q60 91 67 78', 'M49 78 Q60 86 71 78']
              : privacy
                ? 'M54 81 H66'
                : happy
                  ? 'M47 76 Q60 91 73 76'
                  : curious
                    ? 'M54 80 Q60 84 66 80'
                    : thinking
                      ? 'M55 81 Q60 76 65 81'
                      : uncertain
                        ? 'M51 82 Q60 76 69 82'
                        : 'M51 78 Q60 87 69 78',
          }}
          fill="none"
          stroke="#292b2a"
          strokeLinecap="round"
          strokeWidth="4"
          transition={{ duration: speaking ? 0.45 : 0.2, repeat: speaking ? Infinity : 0 }}
        />
        <circle
          className="pop-status"
          cx="103"
          cy="92"
          fill={
            sleeping
              ? '#a4aaa6'
              : privacy
                ? '#5e8cff'
                : expression === 'blocked'
                  ? '#ffbf47'
                  : '#36b88a'
          }
          r="8"
          stroke="#fffdf8"
          strokeWidth="3"
        />
      </g>
    </motion.svg>
  );
}
