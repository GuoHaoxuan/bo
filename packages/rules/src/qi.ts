// 气：整数「毫气」(1.0 气 = 1000)。JS number 在 2^53 内对整数精确 → 无浮点误差。
// 只做整数运算（加减、比较），波决全是整数；后续 0.1/0.5 也仍是整数毫气。
export type Qi = number; // 单位：毫气

export const ZERO: Qi = 0;

/** 整数气 → 毫气 */
export const whole = (n: number): Qi => n * 1000;

/** 0.1 气的整数倍 → 毫气。tenths(1)=100(0.1气)、tenths(5)=500(0.5气)。避免 whole(0.1) 的浮点误差。 */
export const tenths = (n: number): Qi => n * 100;
