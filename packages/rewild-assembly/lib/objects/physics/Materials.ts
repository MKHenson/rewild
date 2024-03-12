import { ContactMaterial, Material } from 'rewild-physics';

export const bouncyMaterial = new Material('bouncy', 0.8, 0.2);
export const groundMaterial = new Material('ground', 0.8, 0.0);
export const diffuseMaterial = new Material('diffuse', 0.5, 0.1);

export const contactMaterials: ContactMaterial[] = [
  new ContactMaterial(groundMaterial, bouncyMaterial, 0.8, 0.2),
  //   new ContactMaterial(diffuseMaterial, bouncyMaterial, 0.0, 0.9),
];
