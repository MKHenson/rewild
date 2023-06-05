// Function to create a 2D array of f32 values initialized with zeros
export function create2DArray(rows: i32, columns: i32): f32[][] {
  const array: f32[][] = new Array<f32[]>(rows);
  for (let i: i32 = 0; i < rows; i++) {
    array[i] = new Array<f32>(columns).fill(0.0);
  }
  return array;
}
