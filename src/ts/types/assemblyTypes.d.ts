/** An 8-bit signed integer. */
declare type i8 = number;
/** A 16-bit signed integer. */
declare type i16 = number;
/** A 32-bit signed integer. */
declare type i32 = number;
/** A 64-bit signed integer. */
declare type i64 = number;
/** A 32-bit signed integer when targeting 32-bit WebAssembly or a 64-bit signed integer when targeting 64-bit WebAssembly. */
declare type isize = number;
/** An 8-bit unsigned integer. */
declare type u8 = number;
/** A 16-bit unsigned integer. */
declare type u16 = number;
/** A 32-bit unsigned integer. */
declare type u32 = number;
/** A 64-bit unsigned integer. */
declare type u64 = number;
/** A 32-bit unsigned integer when targeting 32-bit WebAssembly or a 64-bit unsigned integer when targeting 64-bit WebAssembly. */
declare type usize = number;
/** A 1-bit unsigned integer. */
declare type bool = boolean | number;
/** A 32-bit float. */
declare type f32 = number;
/** A 64-bit float. */
declare type f64 = number;
/** A 128-bit vector. */
declare type v128 = object;
/** Function reference. */
declare type funcref = object | null;
/** External reference. */
declare type externref = object | null;
/** Any reference. */
declare type anyref = object | null;
/** Equatable reference. */
declare type eqref = object | null;
/** 31-bit integer reference. */
declare type i31ref = object | null;
/** Data reference. */
declare type dataref = object | null;

declare function f32(val: any): f32;
declare function u16(val: any): u16;
declare function u32(val: any): u32;
declare function i32(val: any): i32;
declare function changetype<T>(val: T): i32;
declare const Mathf: typeof Math;

declare type TypedArray<T extends number> = Float32Array | Int32Array | Int16Array | Uint32Array | Uint16Array;

declare namespace f32 {
  export const EPSILON: f32;
}
