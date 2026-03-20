export type ShotMode = "fixed" | "random";

export type ShotParams = {
  zoneCenter: number; // 0..1
  zoneWidth: number;  // 0..1
  speed: number;      // cycles per second
  mode: ShotMode;
  // Optional moving zone
  zoneMoves?: boolean;
  zonePhase?: number; // 0..2
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Ping-pong in [0..1]
function pingPong01(x: number): number {
  const mod = x % 2;
  return mod <= 1 ? mod : 2 - mod;
}

/**
 * Moving zone center at elapsed time. Uses the same ping-pong function and the same speed as runner.
 * Phase must be in [0..2). The center always stays within the bar: [zoneWidth/2 .. 1-zoneWidth/2].
 */
export function zoneCenterAt(elapsedMs: number, zoneWidth: number, speed: number, phase: number): number {
  const min = zoneWidth / 2;
  const max = 1 - zoneWidth / 2;
  const span = Math.max(0, max - min);

  const t = elapsedMs / 1000;
  const x = t * speed + phase;
  const p = pingPong01(x);
  return min + p * span;
}

/**
 * ДВА режима выпадают сами:
 *  - fixed: зона всегда около центра
 *  - random: зона сдвигается в случайное место (но полностью помещается на шкале)
 *
 * И при росте difficulty:
 *  - зона плавно сужается, но НЕ меньше минимума (чтобы “зелёная” всегда была)
 *  - скорость растёт, но тоже с ограничением
 */
export function difficultyToParams(difficulty: number): ShotParams {
  // По правилам: зелёная зона всегда появляется в случайном месте.
  const mode: ShotMode = "random";

  const d = clamp(difficulty, 0, 60);

  // ширина зоны (всегда видна)
  const zoneWidth = clamp(0.28 - d * 0.012, 0.08, 0.32);

  // скорость
  const speed = clamp(0.55 + d * 0.045, 0.50, 1.80);

  // Начальная позиция зоны всегда случайная.
  const centerStart = rand(zoneWidth / 2, 1 - zoneWidth / 2);

  // Правило:
  //  - первые 3 попадания (difficulty 0..2): зона НЕ двигается, только сужается и появляется в случайном месте
  //  - после 3-го попадания (difficulty >= 3) и дальше до промаха: зона всегда двигается
  const zoneMoves = d >= 3;

  // Если зона двигается, то она должна стартовать ИЗ СЛУЧАЙНОГО места и оттуда начать движение.
  // Для этого подбираем phase так, чтобы pingPong01(phase) совпадал с нужной стартовой позицией.
  const min = zoneWidth / 2;
  const max = 1 - zoneWidth / 2;
  const span = Math.max(0, max - min);
  const p0 = span > 0 ? clamp((centerStart - min) / span, 0, 1) : 0.5;

  // Два направления старта: phase=p0 (вправо) или phase=2-p0 (влево)
  const phase = Math.random() < 0.5 ? p0 : 2 - p0;

  const center0 = centerStart;

  return {
    mode,
    zoneCenter: center0,
    zoneWidth,
    speed,
    zoneMoves,
    zonePhase: phase,
  };
}

/**
 * position at elapsed time using ping-pong motion
 */
export function positionAt(elapsedMs: number, speed: number): number {
  const t = elapsedMs / 1000;
  const x = t * speed;
  return pingPong01(x);
}

export function isHit(pos: number, zoneCenter: number, zoneWidth: number): boolean {
  const left = zoneCenter - zoneWidth / 2;
  const right = zoneCenter + zoneWidth / 2;
  return pos >= left && pos <= right;
}
