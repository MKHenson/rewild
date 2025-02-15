// uniforms
struct objectStruct {
	modelMatrix : mat4x4<f32>,
	projectionMatrix : mat4x4<f32>,
	modelViewMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
	sunPosition : vec3<f32>,
	up : vec3<f32>,
	rayleigh : f32, 
	turbidity : f32, 
	mieCoefficient : f32, 
	mieDirectionalG : f32
};

@binding( 0 ) @group( 0 )
var<uniform> object : objectStruct;


// varyings
struct VaryingsStruct {
	@location( 0 ) vSunE : f32,
	@location( 1 ) vBetaR : vec3<f32>,
	@location( 2 ) vWorldPosition : vec3<f32>,
	@location( 3 ) positionLocal : vec3<f32>,
	@location( 4 ) vSunDirection : vec3<f32>,
	@location( 5 ) vBetaM : vec3<f32>,
	@location( 6 ) vSunfade : f32,
	@builtin( position ) Vertex : vec4<f32>
};
var<private> varyings: VaryingsStruct;


// constants for atmospheric scattering
const e : f32 = 2.71828182845904523536028747135266249775724709369995957;
const pi: f32 = 3.141592653589793238462643383279502884197169;

// wavelength of used primaries, according to preetham
const lambda: vec3f = vec3f( 680E-9, 550E-9, 450E-9 );
// this pre-calculation replaces older TotalRayleigh(vec3 lambda) function:
// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
const totalRayleigh: vec3f = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

// mie stuff
// K coefficient for the primaries
const v: f32 = 4.0;
const K: vec3f = vec3( 0.686, 0.678, 0.666 );
// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
const MieConst: vec3f = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

// earth shadow hack
// cutoffAngle = pi / 1.95;
const cutoffAngle: f32 = 1.6110731556870734;
const steepness: f32 = 1.5;
const EE: f32 = 1000.0;

fn sunIntensity( zenithAngleCos: f32 ) -> f32 {
	let zenithAngleCosClamped = clamp( zenithAngleCos, -1.0, 1.0 );
	return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCosClamped ) ) / steepness ) ) );
}

fn totalMie( T: f32 ) -> vec3f {
	let c: f32 = ( 0.2 * T ) * 10E-18;
	return 0.434 * c * MieConst;
}

@vertex
fn vs( @location( 0 ) position : vec3<f32> ) -> VaryingsStruct {

	var worldPosition: vec4f = object.modelMatrix * vec4( position, 1.0 );
	varyings.vWorldPosition = worldPosition.xyz;

	varyings.Vertex = object.projectionMatrix * object.modelViewMatrix * vec4( position, 1.0 );
	varyings.Vertex.z = varyings.Vertex.w; // set z to camera.far

	varyings.vSunDirection = normalize( object.sunPosition );
	varyings.vSunE = sunIntensity( dot( varyings.vSunDirection, object.up ) );
	varyings.vSunfade = 1.0 - clamp( 1.0 - exp( ( object.sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

	let rayleighCoefficient: f32 = object.rayleigh - ( 1.0 * ( 1.0 - varyings.vSunfade ) );

	// extinction (absorption + out scattering)
	// rayleigh coefficients
	varyings.vBetaR = totalRayleigh * rayleighCoefficient;

	// mie coefficients
	varyings.vBetaM = totalMie( object.turbidity ) * object.mieCoefficient;

	return varyings;
}


// constants for atmospheric scattering
const n: f32 = 1.0003; // refractive index of air
const N: f32 = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

// optical length at zenith for molecules
const rayleighZenithLength: f32 = 8.4E3;
const mieZenithLength: f32 = 1.25E3;
// 66 arc seconds -> degrees, and the cosine of that
const sunAngularDiameterCos: f32 = 0.999956676946448443553574619906976478926848692873900859324;

// 3.0 / ( 16.0 * pi )
const THREE_OVER_SIXTEENPI: f32 = 0.05968310365946075;
// 1.0 / ( 4.0 * pi )
const ONE_OVER_FOURPI: f32 = 0.07957747154594767;

fn rayleighPhase( cosTheta: f32 ) -> f32 {
	return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

fn hgPhase( cosTheta: f32, g: f32 ) -> f32 {
	let g2: f32 = pow( g, 2.0 );
	let inverse: f32 = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
	return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

struct OutputStruct {
	@location(0) color: vec4<f32>
};
var<private> output : OutputStruct;

fn jodieReinhardTonemap(c: vec3f) -> vec3f{
    let l: f32 = dot(c, vec3(0.2126, 0.7152, 0.0722));
    var tc: vec3f = c / (c + 1.0);

    return mix(c / (l + 1.0), tc, tc);
}

@fragment
fn fs( @location( 0 ) vSunE : f32,
	@location( 1 ) vBetaR : vec3<f32>,
	@location( 2 ) vWorldPosition : vec3<f32>,
	@location( 3 ) positionLocal : vec3<f32>,
	@location( 4 ) vSunDirection : vec3<f32>,
	@location( 5 ) vBetaM : vec3<f32>,
	@location( 6 ) vSunfade : f32 ) -> OutputStruct {

	let direction: vec3f = normalize( vWorldPosition - object.cameraPosition );

	// optical length
	// cutoff angle at 90 to avoid singularity in next formula.
	let zenithAngle: f32 = acos( max( 0.0, dot( object.up, direction ) ) );
	let inverse: f32 = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
	let sR: f32 = rayleighZenithLength * inverse;
	let sM: f32 = mieZenithLength * inverse;

	// combined extinction factor
	let Fex: vec3f = exp( -( vBetaR * sR + vBetaM * sM ) );

	// in scattering
	let cosTheta: f32 = dot( direction, vSunDirection );

	let rPhase: f32 = rayleighPhase( cosTheta * 0.5 + 0.5 );
	let betaRTheta: vec3f = vBetaR * rPhase;

	let mPhase: f32 = hgPhase( cosTheta, object.mieDirectionalG );
	let betaMTheta: vec3f = vBetaM * mPhase;

	var Lin: vec3f = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
	Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( object.up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

	// nightsky
	let theta: f32 = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
	let phi: f32 = atan2( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
	let uv: vec2f = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
	var L0: vec3f = vec3( 0.1 ) * Fex;

	// composition + solar disc
	let sundisk: f32 = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
	L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

	let texColor: vec3f = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
	let retColor: vec3f = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

	let toneMappedRGB = jodieReinhardTonemap( retColor.rgb );

	output.color = vec4f( toneMappedRGB.rgb, 1.0 );
	return output;
} 