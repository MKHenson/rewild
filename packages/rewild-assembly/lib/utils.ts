export function fillArray<T>(array1: T[], array2: T[]): T[] {
  for (let i: i32 = 0, l: i32 = array1.length; i < l; i++) {
    array1[i] = array2[i];
  }

  return array1;
}

export function toTypedArray<T, TyArr extends ArrayBufferView>(
  arr: Array<T>,
  byteSize: i32
): TyArr {
  let len = arr.length;
  let result = instantiate<TyArr>(len);
  memory.copy(result.dataStart, arr.dataStart, len * byteSize);
  return result;
}

export function f32Array(arr: Array<f32>): Float32Array {
  const len = arr.length;
  const result = new Float32Array(len);
  memory.copy(
    result.dataStart,
    arr.dataStart,
    len * Float32Array.BYTES_PER_ELEMENT
  );
  return result;
}

export function i16Array(arr: Array<i16>): Int16Array {
  const len = arr.length;
  const result = new Int16Array(len);
  memory.copy(
    result.dataStart,
    arr.dataStart,
    len * Int16Array.BYTES_PER_ELEMENT
  );
  return result;
}

export function arrayMin<T>(array: T[], infinitiy: T): T {
  if (array.length == 0) return infinitiy;

  let min = array[0];

  for (let i = 1, l = array.length; i < l; ++i) {
    if (array[i] < min) min = array[i];
  }

  return min;
}

export function arrayMax<T>(array: T[], negInfinitiy: T): T {
  if (array.length == 0) return negInfinitiy;

  let max = array[0];

  for (let i = 1, l = array.length; i < l; ++i) {
    if (array[i] > max) max = array[i];
  }

  return max;
}
