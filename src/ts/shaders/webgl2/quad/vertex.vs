#version 300 es
in vec3 a_position;	// Standard position data.
in vec2 a_uv; // Will hold the 4th custom position of the custom position buffer.

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

out highp vec2 texCoord;

void main(void){
    texCoord = a_uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(a_position, 1.0);
}