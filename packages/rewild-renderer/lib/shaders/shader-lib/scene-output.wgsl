// Fragment output of a shader drawn in the scene pass. Location 1 carries the
// occludable ambient (sky IBL after material occlusion) already summed into
// location 0, which the SSAO resolve scales back by the screen-space
// occlusion. Shading code sets `sceneIndirect`; anything that leaves it at zero
// is not occluded.
//
// Include once per host, and end the fragment entry point with
// `return sceneFragment(color);`.

var<private> sceneIndirect: vec3f;

struct SceneFragment {
  @location(0) color: vec4f,
  @location(1) indirect: vec4f,
}

fn sceneFragment(color: vec4f) -> SceneFragment {
  return SceneFragment(color, vec4f(sceneIndirect, 0.0));
}
