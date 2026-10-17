// main.js
import { initCenario, desenharCenario, alternarPorta } from './src/cenario.js';
import { calcularMatrizesCamera } from './src/camera.js';
import { criarIluminacao } from './src/iluminacao.js';

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl");

if (!gl) {
    alert("WebGL não é suportado pelo seu navegador!");
    throw new Error("WebGL não suportado");
}

gl.enable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);

// Vertex Shader: posição, normal (levada para o mundo), textura e posição no mundo (para o xadrez)
const vsSource = `
    attribute vec4 position;
    attribute vec3 normal;
    attribute vec2 texcoord;

    uniform mat4 u_matrix;
    uniform mat4 u_world;

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;

    void main() {
        gl_Position = u_matrix * position;
        // GLSL ES 1.00 não aceita mat3(mat4); usamos w = 0 para ignorar a translação
        v_normal = (u_world * vec4(normal, 0.0)).xyz;
        v_texcoord = texcoord;
        v_posMundo = (u_world * position).xyz;
    }
`;

// Fragment Shader: cor sólida, textura OU xadrez, com luz direcional + ambiente
const fsSource = `
    precision mediump float;

    uniform vec4 u_color;          // cor sólida (no xadrez: casa clara)
    uniform vec4 u_color2;         // casa escura do xadrez
    uniform vec3 u_luzDirecao;
    uniform sampler2D u_texture;
    uniform float u_usaTextura;    // 0 = usa u_color, 1 = usa a textura
    uniform float u_xadrez;        // 0 = normal, 1 = padrão xadrez
    uniform float u_tamanhoXadrez; // lado de cada quadrado
    uniform vec2 u_origemXadrez;   // (x, z) onde a grade começa

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;

    void main() {
        vec4 base = mix(u_color, texture2D(u_texture, v_texcoord), u_usaTextura);

        if (u_xadrez > 0.5) {
            vec2 casa = floor((v_posMundo.xz - u_origemXadrez) / u_tamanhoXadrez);
            float par = mod(casa.x + casa.y, 2.0);
            base = mix(u_color, u_color2, par);
        }

        vec3 n = normalize(v_normal);
        float luz = max(dot(n, normalize(u_luzDirecao)), 0.0);

        gl_FragColor = vec4(base.rgb * (0.4 + 0.6 * luz), base.a);
    }
`;

const shaderProgram = twgl.createProgramFromSources(gl, [vsSource, fsSource]);
const programInfo = twgl.createProgramInfoFromProgram(gl, shaderProgram);
const iluminacao = criarIluminacao();

let cameraRotation = 0;
let tipoCamera = 1;

window.addEventListener('keydown', (event) => {
    switch (event.key) {
        case '1': tipoCamera = 1; break;
        case '2': tipoCamera = 2; break;
    }

    // Portas: O = todas, T = cima, B = baixo, F = forno
    switch (event.key.toLowerCase()) {
        case 'o': alternarPorta('todas'); break;
        case 't': alternarPorta('cima'); break;
        case 'b': alternarPorta('baixo'); break;
        case 'f': alternarPorta('forno'); break;
    }
});

function render(time) {
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.2, 0.3, 0.4, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(shaderProgram);
    twgl.setUniforms(programInfo, { u_luzDirecao: iluminacao.direcaoLuz });

    if (tipoCamera === 1) {
        cameraRotation += 0.003;
    }

    const viewProjectionMatrix = calcularMatrizesCamera(tipoCamera, cameraRotation, gl.canvas);

    desenharCenario(gl, programInfo, viewProjectionMatrix, time);

    requestAnimationFrame(render);
}

// Aguarda geometrias, .obj e textura antes de renderizar
await initCenario(gl);
requestAnimationFrame(render);