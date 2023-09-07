import { ContactMaterial, Material } from "rewild-physics";

export const bouncyMaterial = new Material("bouncy", 0.99, 8);
export const groundMaterial = new Material("ground", 0.5, 0.1);
export const diffuseMaterial = new Material("diffuse", 0.5, 0.1);

export const contactMaterials: ContactMaterial[] = [
  // new ContactMaterial(groundMaterial, bouncyMaterial, 0.4, 0.3, 1e8, 3, 1e8, 3),
  //   new ContactMaterial(diffuseMaterial, bouncyMaterial, 0.0, 0.9),
];
