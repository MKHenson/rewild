import { Matrix4 } from "./math/Matrix4";

// export * from "./exports/io";
// export * from "./exports/ui";
// export * from "./exports/AsSceneManager";
// export * from "./exports/TextureFactory";
// export * from "./exports/GeometryFactory";
// export * from "./exports/PipelineFactory";
// export * from "./exports/MeshFactory";
// export * from "./objects/routing";
// export * from "./exports/ObjectFactory";

export const Float32ArrayID = idof<Float32Array>();

function testMatrixMultiplication(numMatrices: i32 = 100): f32 {
  const source = new Matrix4();
  const matrices: Matrix4[] = new Array();

  for (let i = 0; i < numMatrices; i++) {
    matrices.push(new Matrix4());
  }

  for (let i = 0; i < matrices.length; i++) {
    matrices[i].multiplyMatrices(matrices[i], source);
  }

  return 0;
}

export { testMatrixMultiplication };
