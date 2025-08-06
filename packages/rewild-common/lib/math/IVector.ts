export interface IVector {
  setScalar(scalar: f32): IVector;
  addScaledVector(vector: IVector, scale: f32): IVector;
}
