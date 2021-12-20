#version 300 es
in vec3 a_position;	// Standard position data.

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

void main(void){
    gl_Position = projectionMatrix * modelViewMatrix * vec4(a_position, 1.0);
}