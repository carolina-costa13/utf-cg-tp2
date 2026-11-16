
// src/camera.js
const m4 = twgl.m4;

export let posicaoOlho = [0, 0, 0];   // onde o olho está no mundo (usado na luz especular)

// Zoom da câmera 1: 1 = distância original, menor = perto, maior = longe
let zoom = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export function ajustarZoom(delta) {
    zoom += delta * 0.001;
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

// Câmera 2 (orbital): ângulos controlados pelo mouse
let giroHorizontal = 0;                   // O quanto a câmera deu volta no mundo.
let alturaDaCamera = Math.PI / 4;         // ângulo entre o chão e câmera.
const RAIO_ORBITAL = 8;                   // distância da câmera ao centro.
const ALTURA_ANGULAR_MIN = 0.05;                   // não entra no chão, o máx que a câmera pode arrastar.
const ALTURA_ANGULAR_MAX = Math.PI / 2 - 0.05;     // não chega a 90° (o 0.05 ajuda a não quebrar o lookAt)
const SENSIBILIDADE = 0.005;              // radianos por pixel - velocidade da câmera.

export function girarOrbital(dx, dy) {
    // dx e dy = quantos pixels o mouse andou. Atualizam o giro e a altura da câmera.
    giroHorizontal -= dx * SENSIBILIDADE;
    alturaDaCamera += dy * SENSIBILIDADE;
    // Limita o movimento do mouse pra cima e pra baixo.
    alturaDaCamera = Math.min(ALTURA_ANGULAR_MAX, Math.max(ALTURA_ANGULAR_MIN, alturaDaCamera));
}

// --- Estado da Câmara Livre (Tipo 3) ---
let posicaoCamera = [0.0, 2.0, 6.0];
let yaw = Math.PI; 
let pitch = -0.2; 
const sensibilidadeMouse = 0.002;
const velocidadeMovimento = 3.0;
const teclasPressionadas = {};

let tipoCameraAtual = 1;
let mouseOlharAtivo = false;
let canvasReferencia = null; // Guardamos a referência do canvas passada pela função de matrizes

window.addEventListener('keydown', (e) => {
    teclasPressionadas[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    teclasPressionadas[e.key.toLowerCase()] = false;
});

// Apenas UM listener de mousedown limpo e unificado
window.addEventListener('mousedown', (e) => {
    if (tipoCameraAtual === 3 && e.button === 0) {
        mouseOlharAtivo = !mouseOlharAtivo;
        
        if (mouseOlharAtivo && canvasReferencia) {
            canvasReferencia.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }
});

window.addEventListener('mousemove', (e) => {
    // Se estivermos na câmara 3 e o olhar ativo, ou se o pointer lock estiver ganho pelo navegador
    if (tipoCameraAtual === 3 && (mouseOlharAtivo || document.pointerLockElement)) {
        yaw -= e.movementX * sensibilidadeMouse;
        pitch -= e.movementY * sensibilidadeMouse;

        const limitePitch = Math.PI / 2 - 0.01;
        pitch = Math.max(-limitePitch, Math.min(limitePitch, pitch));
    }
});

function atualizarCameraLivre(deltaTime) {
    // Vetores de direção com base no Yaw e Pitch
    const frente = [
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw)
    ];
    const direita = [
        Math.cos(yaw),
        0,
        -Math.sin(yaw)
    ];

    const mov = velocidadeMovimento * deltaTime;
    if (teclasPressionadas['w']) {
        posicaoCamera[0] += frente[0] * mov;
        posicaoCamera[1] += frente[1] * mov;
        posicaoCamera[2] += frente[2] * mov;
    }
    if (teclasPressionadas['s']) {
        posicaoCamera[0] -= frente[0] * mov;
        posicaoCamera[1] -= frente[1] * mov;
        posicaoCamera[2] -= frente[2] * mov;
    }
    if (teclasPressionadas['d']) {
        posicaoCamera[0] -= direita[0] * mov;
        posicaoCamera[2] -= direita[2] * mov;
    }
    if (teclasPressionadas['a']) {
        posicaoCamera[0] += direita[0] * mov;
        posicaoCamera[2] += direita[2] * mov;
    }
}


// Essa função recebe qual câmera usar, o ângulo de rotação e o canvas, e devolve 
// uma única matriz que leva um ponto do mundo direto para a tela
export function calcularMatrizesCamera(tipoCamera, cameraRotation, canvas, deltaTime = 0){
    tipoCameraAtual = tipoCamera;
    canvasReferencia = canvas; // Guarda a referência do canvas
     // Sem isso, a cena ficaria esticada quando a janela não é quadrada.
     // a = largura/altura.
    const aspect = canvas.clientWidth / canvas.clientHeight;
 
    // Projeção perspectiva (FOV de 60 graus, near = 0.1, far = 200)
    // Detalhamento:
    // -> Campo de visão vertical: 60°, convertido para radianos
    // -> Proporção
    // Tudo que estiver mais perto que 0,1 ou mais longe que 200 é cortado. 
    // -> Plano near: 0,1
    // -> Plano far: 200.
    const projectionMatrix = m4.perspective((60 * Math.PI) / 180, aspect, 0.1, 200);
 
    let cameraMatrix;
 

    // Câmera 1: órbita em torno do centro [0, 0, 0]
    // O zoom multiplica a posição inteira, então a distância muda
    // mas o ângulo de visão continua o mesmo.
    if (tipoCamera === 1) {

        // Esses parâmetros mudam um pouco a posição da câmera, determinada pelo arctan(y/sqrt(x^2 + y^2))
        // No plano horizontal (x, z) é uma circunferência de raio 6 em volta do centro, e a altura fica constante.
        // -> Por que é vezes 6:
        //    |-> arctan(6/6) = 45° (ângulo de visão)
        const eye = [Math.cos(cameraRotation) * 6 * zoom, 6 * zoom, Math.sin(cameraRotation) * 6 * zoom]

        // a própria posição da câmera livre é o olho
        posicaoOlho = [...posicaoCamera];

        // A câmera olha sempre para a origem (o centro do diorama). 
        // O up diz qual direção é “para cima” na tela.

        const target = [0, 0, 0];
        const up = [0, 1, 0];
        cameraMatrix = m4.lookAt(eye, target, up);
    } else if (tipoCamera === 2) {
        // Câmera 2: vista superior olhando para baixo. É uma órbita 
        // controlada pelo mouse, alvo fixo no centro. A câmera tem 
        // sua posição numa esfera de raio RAIO_ORBITAL (fórmula dascoordenadas 
        // esféricas) e o mouse escolhe em qual ponto dessa esfera ela está.
        const eye = [
            Math.cos(alturaDaCamera) * Math.cos(giroHorizontal) * RAIO_ORBITAL,
            Math.sin(alturaDaCamera) * RAIO_ORBITAL,
            Math.cos(alturaDaCamera) * Math.sin(giroHorizontal) * RAIO_ORBITAL
        ];

        posicaoOlho = [...posicaoCamera];

        const target = [0, 0, 0]; // sempre olhando para o centro do diorama
        const up = [0, 1, 0];     // o eixo Y é "para cima" na tela
        cameraMatrix = m4.lookAt(eye, target, up);

    }  /*else if (tipoCamera === 2) {
        // Câmera 2: vista superior olhando para baixo - parada, não dá pra mexer com o mouse.
        const eye = [0, 8, 0.01];
        posicaoOlho = [...posicaoCamera];
        const target = [0, 0, 0];
        const up = [0, 1, 0];
        cameraMatrix = m4.lookAt(eye, target, up);

    }*/ else if (tipoCamera === 3) {
        // Câmera 3: Navegação livre (WASD)
        atualizarCameraLivre(deltaTime);

        posicaoOlho = [...posicaoCamera];
        
        const frente = [
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch),
            Math.cos(pitch) * Math.cos(yaw)
        ];
        const target = [
            posicaoCamera[0] + frente[0],
            posicaoCamera[1] + frente[1],
            posicaoCamera[2] + frente[2]
        ];
        const up = [0, 1, 0];
        cameraMatrix = m4.lookAt(posicaoCamera, target, up);
    }
 
    // m4.lookAt devolve a matriz de MUNDO da câmera.
    // Ela diz onde a câmera está no mundo. Mas para desenhar precisamos 
    // do contrário: levar o mundo para o ponto de vista da câmera
    // A matriz de view é a inversa dela, por isso usamos ela.
    // Sem ela a cena aparece distorcida ou se movendo no sentido errado.
    const viewMatrix = m4.inverse(cameraMatrix);
 
    // ViewProjection = Projeção * View
    return m4.multiply(projectionMatrix, viewMatrix);
}
 