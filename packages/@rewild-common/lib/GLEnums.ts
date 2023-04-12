export enum PrimitiveType {
  POINTS = 0x0000,
  LINES = 0x0001,
  LINE_LOOP = 0x0002,
  LINE_STRIP = 0x0003,
  TRIANGLES = 0x0004,
  TRIANGLE_STRIP = 0x0005,
  TRIANGLE_FAN = 0x0006,
}

export enum BufferObjects {
  ARRAY_BUFFER = 0x8892,
  ELEMENT_ARRAY_BUFFER = 0x8893,
  BUFFER_SIZE = 0x8764,
  BUFFER_USAGE = 0x8765,
}

export enum UsageType {
  STATIC_DRAW = 0x88e4,
  STREAM_DRAW = 0x88e0,
  DYNAMIC_DRAW = 0x88e8,
}

export enum DataType {
  BYTE = 0x1400,
  UNSIGNED_BYTE = 0x1401,
  SHORT = 0x1402,
  UNSIGNED_SHORT = 0x1403,
  INT = 0x1404,
  UNSIGNED_INT = 0x1405,
  FLOAT = 0x1406,
  HALF_FLOAT = 0x140b,
}

export enum GLFeatures {
  BLEND = 0x0be2,
  DEPTH_TEST = 0x0b71,
  DITHER = 0x0bd0,
  POLYGON_OFFSET_FILL = 0x8037,
  SAMPLE_ALPHA_TO_COVERAGE = 0x809e,
  SAMPLE_COVERAGE = 0x80a0,
  SCISSOR_TEST = 0x0c11,
  STENCIL_TEST = 0x0b90,
}

export enum DepthModes {
  NeverDepth = 0x0200,
  AlwaysDepth = 0x0207,
  LessDepth = 0x0201,
  LessEqualDepth = 0x0203,
  EqualDepth = 0x0202,
  GreaterEqualDepth = 0x0206,
  GreaterDepth = 0x0204,
  NotEqualDepth = 0x0205,
}

export enum BlendModes {
  ZERO = 0,
  ONE = 1,
  SRC_COLOR = 0x0300,
  ONE_MINUS_SRC_COLOR = 0x0301,
  SRC_ALPHA = 0x0302,
  ONE_MINUS_SRC_ALPHA = 0x0303,
  DST_ALPHA = 0x0304,
  ONE_MINUS_DST_ALPHA = 0x0305,
  DST_COLOR = 0x0306,
  ONE_MINUS_DST_COLOR = 0x0307,
  SRC_ALPHA_SATURATE = 0x0308,
  CONSTANT_COLOR = 0x8001,
  ONE_MINUS_CONSTANT_COLOR = 0x8002,
  CONSTANT_ALPHA = 0x8003,
  ONE_MINUS_CONSTANT_ALPHA = 0x8004,
}

export enum GLBlendingEquations {
  FUNC_ADD = 0x8006,
  FUNC_SUBTRACT = 0x800a,
  FUNC_REVERSE_SUBTRACT = 0x800b,
  MIN = 0x8007,
  MAX = 0x8008,
}

export enum Culling {
  CULL_FACE = 0x0b44,
  FRONT = 0x0404,
  BACK = 0x0405,
  FRONT_AND_BACK = 0x0408,
}

export enum FaceDirection {
  CW = 0x0900,
  CCW = 0x0901,
}

/**
 * @author mrdoob / http://mrdoob.com/
 * @author Mugen87 / https://github.com/Mugen87
 * @author Lu Wang / http://github.com/luwangthreekit
 * @author WestLangley / http://github.com/westlangley
 * @author Rich-Harris / http://github.com/rich-harris
 * @author Benjamin-Dobell / http://github.com/benjamin-dobell
 * @author artur-trzesiok / http://github.com/artur-trzesiok
 * @author AtiX / http://github.com/atix
 * @author amakaseev / http://github.com/amakaseev
 * @author bhouston / http://exocortex.com
 * @author TristanVALCKE / https://github.com/Itee
 * @author corruptedzulu / http://github.com/corruptedzulu
 * @author Joe Pea / http://github.com/trusktr
 */

export enum MOUSE {
  LEFT,
  MIDDLE,
  RIGHT,
}

// GL STATE CONSTANTS
export enum CullFace {
  CullFaceNone = 0,
  CullFaceBack = 1,
  CullFaceFront = 2,
  CullFaceFrontBack = 3,
}
export enum FrontFaceDirection {
  FrontFaceDirectionCW = 0,
  FrontFaceDirectionCCW = 1,
}
// Shadowing Type
export enum ShadowMapType {
  BasicShadowMap = 0,
  PCFShadowMap = 1,
  PCFSoftShadowMap = 2,
}
// MATERIAL CONSTANTS

// side
export enum Side {
  FrontSide,
  BackSide,
  DoubleSide,
}

// shadow side
export enum ShadowSide {
  FrontSide,
  BackSide,
  DoubleSide,
  AutoSide,
}

// shading
export enum Shading {
  FlatShading = 1,
  SmoothShading = 2,
}

export enum Precision {
  Highp,
  Mediump,
  Lowp,
  Default,
}

// blending modes
export enum Blending {
  NoBlending = 0,
  NormalBlending = 1,
  AdditiveBlending = 2,
  SubtractiveBlending = 3,
  MultiplyBlending = 4,
  CustomBlending = 5,
}

// custom blending equations
// (numbers start from 100 not to clash with other
// mappings to OpenGL constants defined in Texture.js)
export enum BlendingEquation {
  AddEquation = 100,
  SubtractEquation = 101,
  ReverseSubtractEquation = 102,
  MinEquation = 103,
  MaxEquation = 104,
}
// custom blending destination factors
export enum BlendingDstFactor {
  ZeroFactor = 200,
  OneFactor = 201,
  SrcColorFactor = 202,
  OneMinusSrcColorFactor = 203,
  SrcAlphaFactor = 204,
  OneMinusSrcAlphaFactor = 205,
  DstAlphaFactor = 206,
  OneMinusDstAlphaFactor = 207,
  DstColorFactor = 208,
  OneMinusDstColorFactor = 209,
}

// custom blending source factors (contains the same values as BlendingDstFactor,
// plus one additional value that is only valid as a source value)
export enum BlendingSrcFactor {
  ZeroFactor = 200,
  OneFactor = 201,
  SrcColorFactor = 202,
  OneMinusSrcColorFactor = 203,
  SrcAlphaFactor = 204,
  OneMinusSrcAlphaFactor = 205,
  DstAlphaFactor = 206,
  OneMinusDstAlphaFactor = 207,
  DstColorFactor = 208,
  OneMinusDstColorFactor = 209,
  SrcAlphaSaturateFactor = 210,
}

// TEXTURE CONSTANTS
// Operations
export enum Combine {
  MultiplyOperation = 0,
  MixOperation = 1,
  AddOperation = 2,
}
// Tone Mapping modes
export enum ToneMapping {
  NoToneMapping = 0,
  LinearToneMapping = 1,
  ReinhardToneMapping = 2,
  Uncharted2ToneMapping = 3,
  CineonToneMapping = 4,
  ACESFilmicToneMapping = 5,
}
// Mapping modes
export enum Mapping {
  UVMapping = 300,
  CubeReflectionMapping = 301,
  CubeRefractionMapping = 302,
  EquirectangularReflectionMapping = 303,
  EquirectangularRefractionMapping = 304,
  SphericalReflectionMapping = 305,
  CubeUVReflectionMapping = 306,
  CubeUVRefractionMapping = 307,
}
// Wrapping modes
export enum Wrapping {
  RepeatWrapping = 1000,
  ClampToEdgeWrapping = 1001,
  MirroredRepeatWrapping = 1002,
}
// Filters
export enum TextureFilter {
  NearestFilter = 1003,
  NearestMipMapNearestFilter = 1004,
  NearestMipMapLinearFilter = 1005,
  LinearFilter = 1006,
  LinearMipMapNearestFilter = 1007,
  LinearMipMapLinearFilter = 1008,
}
// Data types
export enum TextureDataType {
  UnsignedByteType = 1009,
  ByteType = 1010,
  ShortType = 1011,
  UnsignedShortType = 1012,
  IntType = 1013,
  UnsignedIntType = 1014,
  FloatType = 1015,
  HalfFloatType = 1016,
}
// Pixel types
export enum PixelType {
  UnsignedShort4444Type = 1017,
  UnsignedShort5551Type = 1018,
  UnsignedShort565Type = 1019,
  UnsignedInt248Type = 1020,
}
// Pixel formats
export enum PixelFormat {
  AlphaFormat = 1021,
  RGBFormat = 1022,
  RGBAFormat = 1023,
  LuminanceFormat = 1024,
  LuminanceAlphaFormat = 1025,
  RGBEFormat = RGBAFormat,
  DepthFormat = 1026,
  DepthStencilFormat = 1027,
  RedFormat = 1028,
}
// Compressed texture formats
// DDS / ST3C Compressed texture formats
export enum CompressedPixelFormat {
  RGB_S3TC_DXT1_Format = 33776,
  RGBA_S3TC_DXT1_Format = 33777,
  RGBA_S3TC_DXT3_Format = 33778,
  RGBA_S3TC_DXT5_Format = 33779,

  // PVRTC compressed './texture formats
  RGB_PVRTC_4BPPV1_Format = 35840,
  RGB_PVRTC_2BPPV1_Format = 35841,
  RGBA_PVRTC_4BPPV1_Format = 35842,
  RGBA_PVRTC_2BPPV1_Format = 35843,

  // ETC compressed texture formats
  RGB_ETC1_Format = 36196,

  // ASTC compressed texture formats
  RGBA_ASTC_4x4_Format = 37808,
  RGBA_ASTC_5x4_Format = 37809,
  RGBA_ASTC_5x5_Format = 37810,
  RGBA_ASTC_6x5_Format = 37811,
  RGBA_ASTC_6x6_Format = 37812,
  RGBA_ASTC_8x5_Format = 37813,
  RGBA_ASTC_8x6_Format = 37814,
  RGBA_ASTC_8x8_Format = 37815,
  RGBA_ASTC_10x5_Format = 37816,
  RGBA_ASTC_10x6_Format = 37817,
  RGBA_ASTC_10x8_Format = 37818,
  RGBA_ASTC_10x10_Format = 37819,
  RGBA_ASTC_12x10_Format = 37820,
  RGBA_ASTC_12x12_Format = 37821,
}
// Loop styles for AnimationAction
export enum AnimationActionLoopStyles {
  LoopOnce = 2200,
  LoopRepeat = 2201,
  LoopPingPong = 2202,
}
// Interpolation
export enum InterpolationModes {
  InterpolateDiscrete = 2300,
  InterpolateLinear = 2301,
  InterpolateSmooth = 2302,
}
// Interpolant ending modes
export enum InterpolationEndingModes {
  ZeroCurvatureEnding = 2400,
  ZeroSlopeEnding = 2401,
  WrapAroundEnding = 2402,
}
// Triangle Draw modes
export enum TrianglesDrawModes {
  TrianglesDrawMode = 0,
  TriangleStripDrawMode = 1,
  TriangleFanDrawMode = 2,
}
// Texture Encodings
export enum TextureEncoding {
  LinearEncoding = 3000,
  sRGBEncoding = 3001,
  GammaEncoding = 3007,
  RGBEEncoding = 3002,
  LogLuvEncoding = 3003,
  RGBM7Encoding = 3004,
  RGBM16Encoding = 3005,
  RGBDEncoding = 3006,
}
// Depth packing strategies
export enum DepthPackingStrategies {
  BasicDepthPacking = 3200,
  RGBADepthPacking = 3201,
}
// Normal Map types
export enum NormalMapTypes {
  TangentSpaceNormalMap = 0,
  ObjectSpaceNormalMap = 1,
}
export enum StencilOp {
  ZeroStencilOp = 0,
  KeepStencilOp = 7680,
  ReplaceStencilOp = 7681,
  IncrementStencilOp = 7682,
  DecrementStencilOp = 7683,
  IncrementWrapStencilOp = 34055,
  DecrementWrapStencilOp = 34056,
  InvertStencilOp = 5386,
}
export enum StencilFunc {
  NeverStencilFunc = 512,
  LessStencilFunc = 513,
  EqualStencilFunc = 514,
  LessEqualStencilFunc = 515,
  GreaterStencilFunc = 516,
  NotEqualStencilFunc = 517,
  GreaterEqualStencilFunc = 518,
  AlwaysStencilFunc = 519,
}
export enum Usage {
  StaticDrawUsage = 35044,
  DynamicDrawUsage = 35048,
  StreamDrawUsage = 35040,
  StaticReadUsage = 35045,
  DynamicReadUsage = 35049,
  StreamReadUsage = 35041,
  StaticCopyUsage = 35046,
  DynamicCopyUsage = 35050,
  StreamCopyUsage = 35042,
}

// GLSL1 = "100",
// GLSL3 = "300 es",

export enum ShaderConstants {
  FRAGMENT_SHADER = 0x8b30,
  VERTEX_SHADER = 0x8b31,
  COMPILE_STATUS = 0x8b81,
  DELETE_STATUS = 0x8b80,
  LINK_STATUS = 0x8b82,
  VALIDATE_STATUS = 0x8b83,
  ATTACHED_SHADERS = 0x8b85,
  ACTIVE_ATTRIBUTES = 0x8b89,
  ACTIVE_UNIFORMS = 0x8b86,
  MAX_VERTEX_ATTRIBS = 0x8869,
  MAX_VERTEX_UNIFORM_VECTORS = 0x8dfb,
  MAX_VARYING_VECTORS = 0x8dfc,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8b4d,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8b4c,
  MAX_TEXTURE_IMAGE_UNITS = 0x8872,
  MAX_FRAGMENT_UNIFORM_VECTORS = 0x8dfd,
  SHADER_TYPE = 0x8b4f,
  SHADING_LANGUAGE_VERSION = 0x8b8c,
  CURRENT_PROGRAM = 0x8b8d,
}
