// main.js
import { initCenario, desenharCenario, alternarPorta, verificarCliqueNoForno, alternarTorneira, alternarFumaca, desenharCopo } from './src/cenario.js';
import { calcularMatrizesCamera, ajustarZoom} from './src/camera.js';
import { criarIluminacao } from './src/iluminacao.js';
import { initGatos, desenharGatos, verificarCliqueNoGato} from './src/personagem.js';
import { tocarSom, pararSom} from './src/audio.js';

let ultimaMatrizViewProj = null;
let fornoLigado = false;
let ventoLigado = true;
let neblinaLigada = false; // Variável para controlar o estado da neblina
let ultimoTempo = 0;
let torneiraLigada = false;
let tempoFornoLigado = null;
const TEMPO_LIMITE_NEBLINA = 10000;
let intensidadeNeblina = 0.0;

const avisoCamera = document.getElementById('aviso-camera-livre');
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
    attribute float a_vida;

    uniform mat4 u_matrix;
    uniform mat4 u_world;
    uniform float u_time;
    uniform float u_ventoAtivo;
    uniform float u_ehAgua;           // 1.0 só no plano de água da pia
    uniform float u_tamanhoParticula;
    uniform mediump float u_ehParticula;
    uniform float u_ventoFumaca; 

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;
    varying float v_distanciaCamera;
    varying float v_vida;

    void main() {
        vec4 pos = position;
        vec3 n = normal;
        v_vida = a_vida;

        if (u_ehParticula < 0.5) {
            if (u_ehAgua > 0.5) {
                // --- ONDULAÇÃO DA ÁGUA (só com vento ligado) ---
                float amp = 0.012 * u_ventoAtivo;
                float f1 = pos.x * 18.0 + u_time * 4.0;
                float f2 = pos.z * 14.0 - u_time * 3.0;
                float f3 = (pos.x + pos.z) * 25.0 + u_time * 5.0;

                pos.y += (sin(f1) + 0.7 * sin(f2) + 0.4 * sin(f3)) * amp;

                // Normal acompanha a onda, para a luz "brilhar" nas ondas
                float dx = (cos(f1) * 18.0 + 0.4 * cos(f3) * 25.0) * amp;
                float dz = (0.7 * cos(f2) * -14.0 * -1.0 + 0.4 * cos(f3) * 25.0) * amp;
                n = normalize(vec3(-dx, 1.0, -dz));
            }

            v_normal = (u_world * vec4(n, 0.0)).xyz;
            v_texcoord = texcoord;
            v_posMundo = (u_world * pos).xyz;
        } else {
            float rajada = 0.6 + 0.4 * sin(u_time * 2.0 + pos.y * 3.0);
            float forca = 0.6 * u_ventoAtivo * u_ventoFumaca * a_vida;
            pos.x += rajada * forca;
            pos.z += rajada * forca * 0.4;

            gl_PointSize = u_tamanhoParticula * (1.0 - a_vida * 0.5);
        }

        vec4 posFinal = u_matrix * pos;
        gl_Position = posFinal;
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
    uniform float u_intensidadeNeblina;
    uniform mediump float u_ehParticula;
    uniform vec3 u_corParticula;
    uniform float u_alfaParticula;

    varying vec3 v_normal;
    varying vec2 v_texcoord;
    varying vec3 v_posMundo;
    varying float v_distanciaCamera;
    varying float v_vida;

    void main() {
        if (u_ehParticula > 0.5) {
            // --- PARTÍCULAS (Fumaça / Água) ---
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            float alfa = (1.0 - v_vida) * u_alfaParticula * smoothstep(0.5, 0.1, length(coord));
            gl_FragColor = vec4(u_corParticula, alfa);
        } else {
            // --- CENÁRIO / GATOS ---
            vec4 base = mix(u_color, texture2D(u_texture, v_texcoord), u_usaTextura);

            if (u_xadrez > 0.5) {
                vec2 casa = floor((v_posMundo.xz - u_origemXadrez) / u_tamanhoXadrez);
                float par = mod(casa.x + casa.y, 2.0);
                base = mix(u_color, u_color2, par);
            }

            vec3 n = normalize(v_normal);
            float luz = max(dot(n, normalize(u_luzDirecao)), 0.0);
            vec3 corFinal = base.rgb * (0.35 + 0.65 * luz);

            // --- MELHORIA DE CORES ---
            // Aumenta ligeiramente a saturação e o contraste para as cores saltarem à vista
            corFinal = pow(corFinal, vec3(0.9)); // Contraste mais suave e rico
            corFinal *= 1.08; // Leve aumento de brilho geral

            if (u_intensidadeNeblina > 0.0) {
            vec3 corNeblina = vec3(0.75, 0.75, 0.75); // Cinza claro
    
            // O fator multiplica-se pela intensidade atual (suave)
            float fatorNeblina = clamp(v_distanciaCamera * 0.05, 0.0, 0.7) * u_intensidadeNeblina;
    
            corFinal = mix(corFinal, corNeblina, fatorNeblina);
}

            gl_FragColor = vec4(corFinal, base.a);
        }
    }
`;

const shaderProgram = twgl.createProgramFromSources(gl, [vsSource, fsSource]);
const programInfo = twgl.createProgramInfoFromProgram(gl, shaderProgram);
const iluminacao = criarIluminacao();

let cameraRotation = 0;
let tipoCamera = 1;


window.addEventListener('keydown', (event) => {
    switch (event.key) {
        case '1': tipoCamera = 1; 
            document.exitPointerLock(); 
            if (avisoCamera) avisoCamera.classList.remove('visivel');
            break;
        case '2': tipoCamera = 2;
            document.exitPointerLock(); 
            if (avisoCamera) avisoCamera.classList.remove('visivel');
            break;
        case '3': tipoCamera = 3; 
            if (avisoCamera) avisoCamera.classList.add('visivel');
            break;
    }

    // Portas do cenário: O = todas, T = cima, B = baixo, F = forno
    switch (event.key.toLowerCase()) {
        case 'o': alternarPorta('todas'); break;
        case 't': alternarPorta('cima'); break;
        case 'b': alternarPorta('baixo'); break;
        case 'f': alternarPorta('forno'); break;
        case 'v': ventoLigado = !ventoLigado; break;
        case 'n': neblinaLigada = !neblinaLigada; break;
        case 'g': alternarTorneira(); break; break;
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
    if (tipoCamera === 3) {
        // Se estivermos na câmara livre, clicar no canvas ativa o bloqueio do rato para olhar em redor
        canvas.requestPointerLock();
        return;
    }

    if (!ultimaMatrizViewProj) return;

    if (verificarCliqueNoForno(event, canvas, ultimaMatrizViewProj)) {
        fornoLigado = !fornoLigado;
        alternarFumaca();
        if (fornoLigado) {
            tocarSom('fritura');
            // Inicia um temporizador: se passar o tempo limite, ativa a neblina automaticamente
            tempoFornoLigado = setTimeout(() => {
                if (fornoLigado) {
                    neblinaLigada = true;
        
                    // Ativa o alarme visual
                    const alarmeEl = document.getElementById('alarme-fogao');
                    if (alarmeEl) alarmeEl.classList.add('visivel');
                        tocarSom('incendioAlarme'); 
                        console.log("⚠️ Alarme ativado! O forno está ligado há demasiado tempo.");
                 }
            }, TEMPO_LIMITE_NEBLINA);
        } else {
            pararSom('fritura');
            clearTimeout(tempoFornoLigado);
            tempoFornoLigado = null;
            neblinaLigada = false;

            const alarmeEl = document.getElementById('alarme-fogao');
            if (alarmeEl) alarmeEl.classList.remove('visivel');
            pararSom('incendioAlarme');
        }
    }

    if (verificarCliqueNoGato(event, canvas, ultimaMatrizViewProj)) {
        tocarSom('ronronar');
        mostrarBalaoFeliz();
        console.log("Fizeste carinho no gato! 🐾");
    }
});

function render(time) {
    let tempoSegundos = time * 0.001;
    let deltaTime = ultimoTempo === 0 ? 0 : tempoSegundos - ultimoTempo;
    ultimoTempo = tempoSegundos;

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    gl.clearColor(0.08, 0.11, 0.15, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(shaderProgram);
    twgl.setUniforms(programInfo, { 
        u_luzDirecao: iluminacao.direcaoLuz,
        u_time: time * 0.001,
        u_ventoAtivo: ventoLigado ? 1.0 : 0.0,
        u_neblinaAtiva: neblinaLigada ? 1.0 : 0.0,// Envia o estado da neblina
        u_intensidadeNeblina: intensidadeNeblina,
        u_ehParticula: 0.0,
        u_ehAgua: 0.0
    });

    if (tipoCamera === 1) {
        // A cada quadro o ângulo cresce 0.003 radianos
        // Ou seja, a camera vai rodando de pouquinho em pouquinho a cada quadro
        // A conta é: w = 0.003 * 60 = 0.18 rad/s
        // T = 2π / 0.18 ~ 35s
        // Se queremos que o tempo de reação seja mais rápido, aumente, caso contrário, diminua.
        cameraRotation += 0.003;

        
    }

    const velocidadeTransicaoNeblina = 0.3; 

    if (neblinaLigada) {
    intensidadeNeblina = Math.min(1.0, intensidadeNeblina + velocidadeTransicaoNeblina * deltaTime);
    } else {
    intensidadeNeblina = Math.max(0.0, intensidadeNeblina - velocidadeTransicaoNeblina * deltaTime);
    }

    const viewProjectionMatrix = calcularMatrizesCamera(tipoCamera, cameraRotation, gl.canvas, deltaTime);
    ultimaMatrizViewProj = viewProjectionMatrix;
    desenharCenario(gl, programInfo, viewProjectionMatrix, time);
    desenharGatos(gl, programInfo, viewProjectionMatrix, iluminacao);
    desenharCopo(gl, programInfo, viewProjectionMatrix);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    requestAnimationFrame(render);
}


const caminhosGatos = [
    './assets/cat9/source/cat9T.obj',
    './assets/cat6/source/cat6T.obj',
    './assets/cat8/cat8T.obj'
];

const caminhosTexturas = [
    [
    
    './assets/cat9/textures/SHD_frip_Mixed_AO.tga.png',
    './assets/cat9/textures/SHD_frip_Normal_DirectX.tga.png', 
    './assets/cat9/textures/SHD_frip_Base_Color.tga.png',
    './assets/cat9/textures/eye_3.tga.png',
    ],
    
    [
       './assets/cat6/textures/aiStandardSurface1_Base_Color.png',
       './assets/cat6/textures/aiStandardSurface2_Base_Color_2.png'
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

