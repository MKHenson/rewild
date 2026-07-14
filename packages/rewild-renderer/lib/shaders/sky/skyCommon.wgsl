
struct VaryingsStruct {
	// Camera-RELATIVE far-plane position (the camera sits at the origin of
	// this space). Ray direction = normalize(vRelPosition). Kept camera-relative
	// so the interpolated values stay small — interpolating absolute world
	// positions loses f32 precision far from world origin, which made the
	// temporal reprojection resample history at slightly wrong sub-texel UVs
	// and smear the clouds whenever the camera was still.
	@location( 0 ) vRelPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};

struct ObjectStruct {
	// Inverse of (projection × rotation-only view): reconstructs camera-RELATIVE
	// positions from clip space. Deliberately excludes the camera translation —
	// see VaryingsStruct.vRelPosition.
	invViewProjectionMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
    resolutionScale: f32,
	sunPosition : vec3<f32>,
    padding2: f32, // Padding to align the next field
	up : vec3<f32>,
    padding3: f32, // Padding to align the next field
	iTime: f32,
    resolutionX: f32,
    resolutionY: f32,
    cloudiness: f32,
    foginess: f32,
    windiness: f32,
    cameraAltitude: f32,
    cirrusCoverage: f32,
    cirrusOpacity: f32,
    _skyPad0: f32,           // padding: aligns windDirection to 8-byte boundary (byte 152)
    windDirection: vec2<f32>, // byte 152
    precipitation: f32,       // byte 160
    temperature: f32,         // byte 164
    lightningBoost: f32,      // byte 168
};

struct OutputStruct {
	@location(0) color: vec4<f32>
};

// Noise generation functions (by iq)
fn hash1( n: f32 ) -> f32 {
    return fract( sin( n ) * 43758.5453);
}

fn hash2( p: vec2f )  -> f32 {
    return fract( sin( dot( p, vec2f( 127.1,311.7 ))) * 43758.5453123);
}

fn hash3( p: vec3f ) -> vec3f {
	let p2 = vec3f( dot(p,vec3f(127.1,311.7, 74.7)),
			  dot(p,vec3f(269.5,183.3,246.1)),
			  dot(p,vec3f(113.5,271.9,124.6)));

	return -1.0 + 2.0 * fract( sin( p2 ) *43758.5453123 );
}

fn noise3( x: vec3f ) -> f32 {
    // noise3 is exactly 256-periodic in each axis (uv below shifts by a
    // multiple of 256 when x does, and the texture sampler wraps). Wrap the
    // input to [0, 256) first: uv multiplies p.z by 37, so a large world-space
    // input (far from origin, long wind scroll) would otherwise be amplified
    // past f32 sub-texel precision and the noise turns streaky/mushy.
    let xw = x - 256.0 * floor(x / 256.0);
    let p = floor(xw);
    var f = fract(xw);
    f = f * f * ( 3.0 - 2.0 * f );
	let uv = ( p.xy + vec2f( 37.0, 17.0 ) * p.z) + f.xy;
    let rg = textureSampleLevel( noiseTexture, noiseSampler, (uv + 0.5 ) / 256.0, 0.0).yx;
	return mix( rg.x, rg.y, f.z );
}

fn proceduralNoise3D( p: vec3f ) -> f32 {
    let i = floor( p );
    let f = fract( p );
    let u = f*f*(3.0-2.0*f);

    return mix( mix( mix( dot( hash3( i + vec3f(0.0,0.0,0.0) ), f - vec3f(0.0,0.0,0.0) ), 
                          dot( hash3( i + vec3f(1.0,0.0,0.0) ), f - vec3f(1.0,0.0,0.0) ), u.x),
                     mix( dot( hash3( i + vec3f(0.0,1.0,0.0) ), f - vec3f(0.0,1.0,0.0) ), 
                          dot( hash3( i + vec3f(1.0,1.0,0.0) ), f - vec3f(1.0,1.0,0.0) ), u.x), u.y),
                mix( mix( dot( hash3( i + vec3f(0.0,0.0,1.0) ), f - vec3f(0.0,0.0,1.0) ), 
                          dot( hash3( i + vec3f(1.0,0.0,1.0) ), f - vec3f(1.0,0.0,1.0) ), u.x),
                     mix( dot( hash3( i + vec3f(0.0,1.0,1.0) ), f - vec3f(0.0,1.0,1.0) ), 
                          dot( hash3( i + vec3f(1.0,1.0,1.0) ), f - vec3f(1.0,1.0,1.0) ), u.x), u.y), u.z );
}



/**
 * The fbm function generates fractal Brownian motion (fbm) noise.
 * This function is used to create complex, natural-looking textures by combining multiple layers of noise.
 *
 * @param p2 - The input 3D vector used to generate the noise.
 * @return The generated fbm noise value.
 */
fn fbm( position: vec3f )  -> f32 {
    var p = position;
    let m = mat3x3<f32>( 0.00,  0.80,  0.60,
              -0.80,  0.36, -0.48,
              -0.60, -0.48,  0.64 );    
    var f: f32;
    f  = 0.5000 * noise3( p ); 
    p = m * p * 2.02;
    
    f += 0.2500 * noise3( p ); 
    p = m * p * 2.03;
    
    f += 0.1250 * noise3( p );
    return f;
}

@vertex
fn vs( @builtin(vertex_index) vertexIndex : u32 ) -> VaryingsStruct {
	let pos = array(
		vec2f(-1.0, -1.0),
		vec2f( 1.0, -1.0),
		vec2f(-1.0,  1.0),
		vec2f(-1.0,  1.0),
		vec2f( 1.0, -1.0),
		vec2f( 1.0,  1.0),
	);

	let xy = pos[vertexIndex];

	// Reconstruct a far-plane position from the clip-space corner in
	// camera-relative space (the matrix carries no camera translation).
	let clipPos = vec4f(xy.x, xy.y, 1.0, 1.0);
	let relPosH = object.invViewProjectionMatrix * clipPos;
	let relPos = relPosH.xyz / relPosH.w;

	varyings.vRelPosition = relPos;
	varyings.Vertex = vec4f(xy, 0.0, 1.0);
	varyings.vSunDirection = normalize( object.sunPosition );
	return varyings;
}