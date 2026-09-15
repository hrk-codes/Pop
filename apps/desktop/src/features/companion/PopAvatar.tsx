import { motion } from 'motion/react';

import type { ExpressionState } from './machine';
import type { IdleGesture } from './personality';

export type WorkExpressionStyle = 'focused' | 'friendly' | 'thoughtful';

export function PopAvatar({
  expression,
  gaze = { x: 0, y: 0 },
  gesture = null,
  size,
  workStyle = 'thoughtful',
}: {
  expression: ExpressionState;
  gaze?: { x: number; y: number };
  gesture?: IdleGesture | null;
  size: number;
  workStyle?: WorkExpressionStyle;
}) {
  const sleeping = expression === 'sleeping';
  const privacy = expression === 'privacy';
  const uncertain = expression === 'uncertain' || expression === 'blocked';
  const happy = ['success', 'encouraging', 'playful', 'mischievous', 'excited', 'silly'].includes(
    expression,
  );
  const playful = expression === 'playful';
  const mischievous = expression === 'mischievous';
  const excited = expression === 'excited';
  const dramatic = expression === 'dramatic';
  const impatient = expression === 'impatient';
  const silly = expression === 'silly';
  const curious = expression === 'curious';
  const thinking = expression === 'thinking';
  const speaking = expression === 'speaking';
  const gestureGazeX = gesture === 'peek' ? 2.2 : gesture === 'tilt' ? -1.4 : 0;
  const gestureGazeY = gesture === 'bounce' ? -1.4 : 0;
  const eyeX = gaze.x * 2.8 + gestureGazeX;
  const eyeY = gaze.y * 2.2 + gestureGazeY;
  const eyeScaleY =
    gesture === 'squint' ? 0.38 : dramatic ? 0.58 : impatient ? 0.72 : thinking ? 0.7 : 1;
  const speakingMouth =
    workStyle === 'friendly'
      ? ['M48 77 Q60 88 72 77', 'M52 77 Q60 92 68 77', 'M48 77 Q60 88 72 77']
      : workStyle === 'focused'
        ? ['M52 80 Q60 84 68 80', 'M54 79 Q60 88 66 79', 'M52 80 Q60 84 68 80']
        : ['M49 78 Q60 86 71 78', 'M53 78 Q60 91 67 78', 'M49 78 Q60 86 71 78'];

  return (
    <svg
      aria-label={`POP is ${expression}`}
      className={`pop-avatar pop-avatar--${expression}`}
      height={size}
      role="img"
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
          animate={{
            rotate:
              expression === 'attentive' || curious
                ? 8
                : playful || mischievous || silly
                  ? -7
                  : excited
                    ? [0, 12, -3, 8]
                    : dramatic
                      ? 13
                      : 0,
          }}
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
                ry: excited ? 10 : 8,
                scaleY: playful || mischievous || silly ? [1, 0.16, 1] : eyeScaleY,
              }}
              cx="45"
              cy="62"
              fill="#292b2a"
              rx="7"
              ry="8"
            />
            <motion.ellipse
              animate={{
                cx: 75 + eyeX,
                cy: 62 + eyeY,
                ry: excited ? 10 : 8,
                scaleY: eyeScaleY,
              }}
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
        {(mischievous || curious || dramatic || impatient) && (
          <g fill="none" stroke="#292b2a" strokeLinecap="round" strokeWidth="3">
            <path
              d={
                mischievous
                  ? 'M36 48 L51 52'
                  : dramatic
                    ? 'M36 52 Q44 47 52 50'
                    : impatient
                      ? 'M36 51 H52'
                      : 'M37 51 Q44 47 51 49'
              }
            />
            <path
              d={
                mischievous
                  ? 'M69 52 L84 47'
                  : dramatic
                    ? 'M68 50 Q76 47 84 52'
                    : impatient
                      ? 'M68 51 H84'
                      : 'M69 49 Q76 47 83 51'
              }
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
              ? speakingMouth
              : privacy
                ? 'M54 81 H66'
                : excited
                  ? 'M53 78 Q60 72 67 78 Q60 91 53 78 Z'
                  : silly
                    ? 'M48 78 Q58 89 71 77 Q68 89 61 84'
                    : mischievous
                      ? 'M48 80 Q60 90 73 75'
                      : dramatic
                        ? 'M49 84 Q60 73 71 84'
                        : impatient
                          ? 'M51 81 Q61 78 70 81'
                          : happy
                            ? 'M47 76 Q60 91 73 76'
                            : curious
                              ? 'M54 80 Q60 84 66 80'
                              : thinking
                                ? workStyle === 'friendly'
                                  ? 'M52 79 Q60 86 68 79'
                                  : workStyle === 'focused'
                                    ? 'M52 81 H68'
                                    : 'M55 81 Q60 76 65 81'
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
    </svg>
  );
}
