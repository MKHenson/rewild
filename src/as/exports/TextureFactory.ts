export const textures: Texture[] = [];

export class Texture {
  name: string;
  index: i32;
  constructor(name: string, index: i32) {
    this.name = name;
    this.index = index;
  }
}

export function createTexture(name: string, index: i32): Texture {
  console.log(`Added texture ${name}...`);
  textures.push(new Texture(name, index));
  return textures[textures.length - 1];
}
