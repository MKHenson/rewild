import { Object } from "../core/Object";
import { Material } from "../materials/Material";
import { Color } from "../math/Color";
import { Texture } from "../textures/Texture";
import { Fog } from "./Fog";

export class Scene extends Object {
  isScene: boolean = true;
  autoUpdate: boolean;
  overrideMaterial: Material | null;
  fog: Fog | null;
  environment: Texture | null;
  background: Color | null;

  constructor() {
    super();

    this.type = "Scene";

    this.background = null;
    this.environment = null;
    this.fog = null;

    this.overrideMaterial = null;
    this.autoUpdate = true; // checked by the renderer
  }

  copy(source: Scene, recursive: boolean): Scene {
    super.copy(source, recursive);

    const background = source.background;
    const environment = source.environment;
    const overrideMaterial = source.overrideMaterial;
    const fog = source.fog;

    if (background != null) this.background = background.clone();
    if (environment != null) this.environment = environment.clone();
    if (fog != null) this.fog = fog.clone();
    if (overrideMaterial != null) this.overrideMaterial = overrideMaterial.clone();

    this.autoUpdate = source.autoUpdate;
    this.matrixAutoUpdate = source.matrixAutoUpdate;

    return this;
  }

  // TODO:
  // toJSON( meta ) {

  // 	const data = super.toJSON( meta );

  // 	if ( this.background !== null ) data.object.background = this.background.toJSON( meta );
  // 	if ( this.environment !== null ) data.object.environment = this.environment.toJSON( meta );
  // 	if ( this.fog !== null ) data.object.fog = this.fog.toJSON();

  // 	return data;

  // }
}
