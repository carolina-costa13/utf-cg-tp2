// main.js
import { initCenario, desenharCenario, alternarPorta, verificarCliqueNoForno } from './src/cenario.js';
import { calcularMatrizesCamera, ajustarZoom} from './src/camera.js';
import { criarIluminacao } from './src/iluminacao.js';
import { initGatos, desenharGatos, verificarCliqueNoGato} from './src/personagem.js';
import { tocarSom, pararSom} from './src/audio.js';

let ultimaMatrizViewProj = null;
let fornoLigado = false;
let ventoLigado = false;
let neblinaLigada = false; // Variável para controlar o estado da neblina

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl");

if (!gl) {
    alert("WebGL não é suportado pelo seu navegador!");
    throw new Error("WebGL não suportado");
}

gl.enable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const vsSource = `
    attribute vec4 position;
    attribute vec3 normal;
    attribute vec2 texcoord;

    uniform mat4 u_matrix;
    uniform mat4 u_world;
    uniform float u_time;
    uniform float u_ventoAtivo;

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;
    varying float v_distanciaCamera;

    void main() {
        vec4 pos = position;

        // --- EFEITO DE VENTO ---
        float intensidadeVento = 0.05 * u_ventoAtivo;
        float frequencia = 4.0;
        float vento = sin(u_time * frequencia + pos.x * 2.0 + pos.z * 2.0) * max(0.0, pos.y);
        
        pos.x += vento * intensidadeVento;
        pos.z += (vento * 0.5) * intensidadeVento;
        // -----------------------

        vec4 posFinal = u_matrix * pos;
        gl_Position = posFinal;
        
        v_normal = (u_world * vec4(normal, 0.0)).xyz;
        v_texcoord = texcoord;
        v_posMundo = (u_world * pos).xyz;
        
        // A coordenada 'w' ou a coordenada 'z' no espaço de projeção dá uma excelente medida de profundidade/distância
        v_distanciaCamera = posFinal.w; 
    }
`;

const fsSource = `
    precision mediump float;

    uniform vec4 u_color;
    uniform vec4 u_color2;
    uniform vec3 u_luzDirecao;
    uniform sampler2D u_texture;
    uniform float u_usaTextura;
    uniform float u_xadrez;
    uniform float u_tamanhoXadrez;
    uniform vec2 u_origemXadrez;
    uniform float u_neblinaAtiva;

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;
    varying float v_distanciaCamera;

    void main() {
        vec4 base = mix(u_color, texture2D(u_texture, v_texcoord), u_usaTextura);

        if (u_xadrez > 0.5) {
            vec2 casa = floor((v_posMundo.xz - u_origemXadrez) / u_tamanhoXadrez);
            float par = mod(casa.x + casa.y, 2.0);
            base = mix(u_color, u_color2, par);
        }

        vec3 n = normalize(v_normal);
        float luz = max(dot(n, normalize(u_luzDirecao)), 0.0);
        vec3 corFinal = base.rgb * (0.4 + 0.6 * luz);

       // --- EFEITO DE NEBLINA SUAVE ---
        if (u_neblinaAtiva > 0.5) {
            vec3 corNeblina = vec3(0.2, 0.3, 0.4); 
            
            // Multiplicador menor (0.05) para a névoa crescer devagar 
            // e limite máximo (0.5) para manter o cenário visível e suave
            float fatorNeblina = clamp(v_distanciaCamera * 0.05, 0.0, 0.5); 
            
            corFinal = mix(corFinal, corNeblina, fatorNeblina);
        }

        gl_FragColor = vec4(corFinal, base.a);
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

    // Portas do cenário: O = todas, T = cima, B = baixo, F = forno
    switch (event.key.toLowerCase()) {
        case 'o': alternarPorta('todas'); break;
        case 't': alternarPorta('cima'); break;
        case 'b': alternarPorta('baixo'); break;
        case 'f': alternarPorta('forno'); break;
        case 'v': ventoLigado = !ventoLigado; break;
        case 'n': neblinaLigada = !neblinaLigada; console.log(`Efeito de neblina: ${neblinaLigada ? 'ATIVADO 🌫️' : 'DESATIVADO 🛑'}`); break;
    }
});

window.addEventListener('wheel', (event) => {
    if (tipoCamera === 1) {

        event.preventDefault(); // evita a página rolar

        // event.deltaY diz quanto e para que lado rolou: 
        // positivo ao rolar para baixo, negativo ao rolar para cima
        ajustarZoom(event.deltaY);
    }
    // Aqui, o passive = false avisa que vai cancelar mesmo, e aí ele funciona
}, { passive: false });


canvas.addEventListener('click', (event) => {
    if (!ultimaMatrizViewProj) return;

    // Chama a função importada do cenario.js
    if (verificarCliqueNoForno(event, canvas, ultimaMatrizViewProj)) {
        fornoLigado = !fornoLigado;
        if (fornoLigado) {
            tocarSom('fritura');
            console.log("Clicaste no forno! Som de fritura ligado.");
        } else {
            pararSom('fritura');
            console.log("Forno desligado.");
        }
    }
});

canvas.addEventListener('click', (event) => {
    if (!ultimaMatrizViewProj) return;

    // Verifica se clicou no gato (ajusta as coordenadas do gato na função)
    if (verificarCliqueNoGato(event, canvas, ultimaMatrizViewProj)) {
        // Toca o som de ronronar feliz
        tocarSom('ronronar');
        
        // Dispara o feedback visual (ex: mostra o balãozinho)
        mostrarBalaoFeliz();
        
        console.log("Fizeste carinho no gato! 🐾");
    }
});




function render(time) {
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.2, 0.3, 0.4, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(shaderProgram);
    twgl.setUniforms(programInfo, { 
        u_luzDirecao: iluminacao.direcaoLuz,
        u_time: time * 0.001,
        u_ventoAtivo: ventoLigado ? 1.0 : 0.0,
        u_neblinaAtiva: neblinaLigada ? 1.0 : 0.0 // Envia o estado da neblina
    });

    if (tipoCamera === 1) {
        // A cada quadro o ângulo cresce 0.003 radianos
        // Ou seja, a camera vai rodando de pouquinho em pouquinho a cada quadro
        // A conta é: w = 0.003 * 60 = 0.18 rad/s
        // T = 2π / 0.18 ~ 35s
        // Se queremos que o tempo de reação seja mais rápido, aumente, caso contrário, diminua.
        cameraRotation += 0.003;

        
    }

    const viewProjectionMatrix = calcularMatrizesCamera(tipoCamera, cameraRotation, gl.canvas);
    ultimaMatrizViewProj = viewProjectionMatrix;
    desenharCenario(gl, programInfo, viewProjectionMatrix, time);
    desenharGatos(gl, programInfo, viewProjectionMatrix, iluminacao);
   

    requestAnimationFrame(render);
}


const caminhosGatos = [
    './assets/cat6/source/cat6T.obj',
    './assets/cat9/source/cat9T.obj',
    './assets/cat8/cat8T.obj'
];

const caminhosTexturas = [
    [
       './assets/cat6/textures/aiStandardSurface1_Base_Color.png',
       './assets/cat6/textures/aiStandardSurface2_Base_Color_2.png'
    ],
    
    [
    
    './assets/cat9/textures/SHD_frip_Mixed_AO.tga.png',
    './assets/cat9/textures/SHD_frip_Normal_DirectX.tga.png', 
    './assets/cat9/textures/SHD_frip_Base_Color.tga.png',
    './assets/cat9/textures/eye_3.tga.png',
    ],
    
    [
    './assets/cat8/textures/material0_baseColor.jpeg',
    
    ]
];


// Aguarda geometrias, .obj e textura antes de renderizar
await initCenario(gl);
await initGatos(gl, caminhosGatos, caminhosTexturas);
requestAnimationFrame(render);

function mostrarBalaoFeliz() {
    const balao = document.getElementById('balao-gato');
    balao.classList.add('visivel');

    // Esconde o balão automaticamente após 2 segundos
    setTimeout(() => {
        balao.classList.remove('visivel');
    }, 2000);
}

// --- SISTEMA DE PARTÍCULAS ---
const numParticulas = 30;
const particulas = [];

// Inicializa as partículas (ex: na posição do forno)
for (let i = 0; i < numParticulas; i++) {
    particulas.push({
        x: 0.0,  // Posição X (ajusta para a posição do forno/panela)
        y: 0.5,  // Posição Y (altura inicial)
        z: 1.2,  // Posição Z
        vx: (Math.random() - 0.5) * 0.01, // Desvio leve para os lados
        vy: 0.02 + Math.random() * 0.02,  // Sobe a subir
        vz: (Math.random() - 0.5) * 0.01,
        vida: Math.random(),              // Vida de 0 a 1
        vidaMaxima: 1.0 + Math.random() * 1.5
    });
}

function atualizarEDesenharParticulas(gl, programInfo, viewProjectionMatrix, timeDelta) {
    // Se o forno estiver ligado, atualizamos e desenhamos as partículas
    if (!fornoLigado) return; 

    // Atualiza cada partícula
    particulas.forEach(p => {
        p.vida += timeDelta;
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        // Se a partícula "morrer", renasce na base
        if (p.vida >= p.vidaMaxima || p.y > 3.0) {
            p.vida = 0;
            p.x = 0.0;  // Posição base do forno
            p.y = 0.5;
            p.z = 1.2;
            p.vy = 0.02 + Math.random() * 0.02;
        }
    });

    // Aqui desenharias as partículas (usando uma geometria simples, como um quadrado ou pontos)
}

// Tenta iniciar o som do ventilador logo no carregamento
tocarSom('ventilador');

// Se o navegador bloquear o autoplay inicial, este listener arranca o ventilador 
// assim que o utilizador clicar ou pressionar qualquer tecla pela primeira vez
canvas.addEventListener('pointerdown', () => {
    // Se o ventilador estiver pausado por restrição do browser, volta a disparar
    tocarSom('ventilador');
}, { once: true });

