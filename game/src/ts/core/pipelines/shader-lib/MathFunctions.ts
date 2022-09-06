export const mathConstants = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const PI2: f32 = 6.283185307179586;
const PI_HALF: f32 = 1.5707963267948966;
const RECIPROCAL_PI: f32 = 0.3183098861837907;
const RECIPROCAL_PI2: f32 = 0.15915494309189535;
const EPSILON: f32 = 0.000001;
`;

export const mathFunctions = /* wgsl */ `
fn saturate( a: f32 ) -> f32 {
    return clamp( a, 0.0, 1.0 );
}

fn whiteComplement( a: f32 ) -> f32 {
    return ( 1.0 - saturate( a ) );
}

fn pow2( x: f32 ) -> f32 {
    return x*x;
}

fn pow3( x: f32 ) -> f32 {
    return x*x*x;
}

fn pow4( x: f32 ) -> f32 {
    var x2 = x*x;
    return x2*x2;
}

fn max3( v: vec3<f32> ) -> f32 {
    return max( max( v.x, v.y ), v.z );
}

fn average( color: vec3<f32> )-> f32 {
    return dot( color, vec3( 0.3333 ) );
}

fn rand( uv: vec2<f32> ) -> f32 {
    var a: f32 = 12.9898;
    var b: f32 = 78.233;
    var c: f32 = 43758.5453;
    var dt = dot( uv.xy, vec2<f32>( a, b ) );
    var sn = dt % PI;
    return fract( sin( sn ) * c );
}

fn precisionSafeLength( v: vec3<f32> )-> f32 {
    return length( v );
}`;
