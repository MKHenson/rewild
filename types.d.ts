declare type bool = boolean;
declare type i8 = number;
declare type i16 = number;
declare type i32 = number;
declare type isize = number;
declare type u8 = number;
declare type u16 = number;
declare type u32 = number;
declare type usize = number;
declare type f32 = number;
declare type f64 = number;

declare namespace f32 {
  /** Difference between 1 and the smallest representable value greater than 1. */
  export const EPSILON: f32;
}

declare const Mathf: typeof Math;

declare function unchecked(val: any): any;
declare function u32(val: number): number;
