// Depth the horizon ring writes for every pixel it draws. Its ground runs past
// the far plane, where depth cannot say how far away it is, so the atmosphere
// composite reads any pixel at or above FAR_GROUND_DEPTH_MIN as ground at sea
// level and measures the distance to that plane instead.
//
// With the camera's near plane at 0.1 and far at 4000, the minimum is reached
// only past about 3.9 km, beyond anything the terrain chunks draw. Both sit
// below 1, so the pixel still counts as scene rather than sky.
const FAR_GROUND_DEPTH: f32 = 0.9999999;
const FAR_GROUND_DEPTH_MIN: f32 = 0.9999995;
