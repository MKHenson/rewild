
struct VaryingsStruct {
	@location( 0 ) vWorldPosition : vec3<f32>,
	@location( 1 ) vSunDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};

struct ObjectStruct {
	modelMatrix : mat4x4<f32>,
	projectionMatrix : mat4x4<f32>,
	modelViewMatrix : mat4x4<f32>,
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
    windiness: f32
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
    let p = floor(x);
    var f = fract(x);
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
fn vs( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {
	var worldPosition: vec4f = object.modelMatrix * vec4( position, 1.0 );
	varyings.vWorldPosition = worldPosition.xyz;
	varyings.Vertex = object.projectionMatrix * object.modelViewMatrix * vec4( position, 1.0 );
	varyings.Vertex.z = varyings.Vertex.w; // set z to camera.far
	varyings.vSunDirection = normalize( object.sunPosition );
	return varyings;
}