// src/ventilador.js
//
// O QUE É ISSO?
// Um ventilador pendurado num braço, preso a um poste.
//
// PEÇAS (hierarquia):
//   Poste ............... FIXO
//   Braço ............... FIXO
//   Haste do ventilador . FIXO
//   Motor ............... FIXO
//     └─ Rotor .......... GIRA (eixo Y)
//         └─ 4 Pás ...... giram junto com o rotor

// =====================================================
// PRIMEIRO: declaração de constantes
// =====================================================
 
// "m4" é a caixa de ferramentas de matrizes da TWGL, simplifica o web gl
// (translate = mover, rotateY = girar, scale = esticar)
const m4 = twgl.m4;
const prim = twgl.primitives;
 
// Aqui vamos guardar as formas (geometrias) depois de criadas
let formas = null;
 
// ---------- MEDIDAS (mude à vontade!) ----------
const ALTURA_POSTE = 4.0;     // altura do poste
const COMPRIMENTO_BRACO = 2.0; // quanto o braço sai do poste
const ALTURA_HASTE = 0.5;     // pedacinho que desce do braço até o motor
const COMPRIMENTO_PA = 1.2;   // tamanho de cada pá
const NUMERO_DE_PAS = 4;
 
// ---------- CORES [vermelho, verde, azul, opacidade] (0 a 1) ----------
const COR_POSTE = [0.4, 0.4, 0.45, 1];
const COR_MOTOR = [0.2, 0.2, 0.2, 1];
const COR_PA = [0.6, 0.4, 0.2, 1];


 
// =====================================================
// SEGUNDO: criar as formas (roda uma vez, no começo)
// =====================================================
export function initVentilador(gl) {
    formas = {
        // cilindro: createCylinderBufferInfo(gl, raio, altura, lados, fatias)
        //bufferInfo = pacore de buffers da GPU, com posições, normais, coordenadas de textura...
        poste: prim.createCylinderBufferInfo(gl, 0.12, ALTURA_POSTE, 16, 1),
        haste: prim.createCylinderBufferInfo(gl, 0.05, ALTURA_HASTE, 12, 1),
        motor: prim.createCylinderBufferInfo(gl, 0.3, 0.25, 20, 1),
 
        // cubo de tamanho 1. Depois a gente estica ele (scale) pra virar braço ou pá
        cubo: prim.createCubeBufferInfo(gl, 1),
    };
}


 
// =====================================================
// TERCEIRO: função que desenha UMA peça na tela
// =====================================================
// matrizMundo = onde a peça está, qual o tamanho e a rotação dela
// leva os vértices do espaço da peça para o espaço do mundo (assim como quelas transformações de matriz da aula)
function desenharParte(gl, programInfo, viewProjection, forma, matrizMundo, cor) {
    // V_tela = (P * V) * M * V_local
    // V = câmera
    // P = projeção
    twgl.setBuffersAndAttributes(gl, programInfo, forma);
    twgl.setUniforms(programInfo, {
        u_matrix: m4.multiply(viewProjection, matrizMundo), // posição final na tela
        u_world: matrizMundo,                               // usada na luz, por isso tá separada
        u_color: cor,
        u_color2: cor,
        u_usaTextura: 0, // 0 = usar cor sólida
        u_xadrez: 0,     // 0 = sem xadrez
    });
    twgl.drawBufferInfo(gl, forma);
}


/*
OBS:
Como ler uma cadeia de transformações (exemplo de uma pá):
M_motor * R_y (A) * R_y (B) * T (0.3 + L/2, -0.15, 0) * S (L, 0.03, 0.25)
-> Leia da direita para a esquerda para entender o que acontece com o vértice.
-> L = comprimento de cada pá, que é 1,2
-> S = cubo de lado 1, vira uma tábua de 1,2 x 0,03 x 0,25
-> T = a tábua é afastada do centro, pra não ficar "dentro" do que seria o motorzinho.
-> R_y (B) = gira em torno do eixo escolhendo uma das posições 0, 90, 180...
-> R_y (A) = gira todo o conjunto de hélices
-> M_motor = leva tudo pra onde o motor tá
-> B = ângulo da pa
-> A = ângulo

Essa fórmula é construída aos poucos na frente
 */ 


// =====================================================
// QUARTO: desenhar o ventilador inteiro (roda TODO quadro)
// =====================================================
// posicao = [x, y, z] do pé do poste no chão
export function desenharVentilador(gl, programInfo, viewProjection, time,
                                   posicao = [0, 0, 0], escala = 1) {
    if (!formas) return; // se ainda não criou as formas, não faz nada, evita desenhar antes de iniciar o ventilador.
 
    // Ângulo da hélice: aumenta com o tempo, então ela gira.
    // Quer mais rápido? Aumente 0.005. Mais devagar? Diminua.
    const angulo = time * 0.005;
 
    // ---------- RAIZ: de onde tudo parte ----------
    // Tudo que vier depois "herda" essa matriz (se mover a raiz, move tudo)
    let raiz = m4.translation(posicao);
    raiz = m4.scale(raiz, [escala, escala, escala]); // M_raiz = T(posicao) * S(escala, escala, escala)
 
    // ---------- 1) POSTE (fixo) ----------
    // O cilindro nasce com o CENTRO na origem. Para o pé ficar no chão,
    // subimos metade da altura.
    const poste = m4.translate(raiz, [0, ALTURA_POSTE / 2, 0]);
    desenharParte(gl, programInfo, viewProjection, formas.poste, poste, COR_POSTE);
 
    // ---------- 2) BRAÇO (fixo) ----------
    // Um cubo esticado: comprido em X, fininho em Y e Z.
    // Fica no topo do poste e vai para o lado (+X).
    let braco = m4.translate(raiz, [COMPRIMENTO_BRACO / 2, ALTURA_POSTE, 0]);
    braco = m4.scale(braco, [COMPRIMENTO_BRACO, 0.15, 0.15]);
    desenharParte(gl, programInfo, viewProjection, formas.cubo, braco, COR_POSTE);
 
    // ---------- 3) HASTE (fixa) ----------
    // Desce da ponta do braço. Ponta do braço = x igual a COMPRIMENTO_BRACO.
    const haste = m4.translate(raiz, [COMPRIMENTO_BRACO, ALTURA_POSTE - ALTURA_HASTE / 2, 0]);
    desenharParte(gl, programInfo, viewProjection, formas.haste, haste, COR_POSTE);
 
    // ---------- 4) MOTOR (fixo) ----------
    // Logo abaixo da haste.
    const yMotor = ALTURA_POSTE - ALTURA_HASTE - 0.125;
    const motor = m4.translate(raiz, [COMPRIMENTO_BRACO, yMotor, 0]);
    desenharParte(gl, programInfo, viewProjection, formas.motor, motor, COR_MOTOR);
 
    desenharHelice(gl, programInfo, viewProjection, motor, angulo);
}
 
// =====================================================
// HÉLICE (rotor + pás): usada pelos dois modos
// =====================================================
// "motor" = matriz do motor. A hélice nasce dela e gira em Y.
function desenharHelice(gl, programInfo, viewProjection, motor, angulo) {
    // ---------- ROTOR (GIRA!) ----------
    // Parte da matriz do MOTOR e gira em torno do eixo Y.
    // Quem for filho do rotor gira junto (a hierarquia!).
    const rotor = m4.rotateY(motor, angulo);
 
    // ---------- PÁS (filhas do rotor) ----------
    for (let i = 0; i < NUMERO_DE_PAS; i++) {
        // Divide o círculo em partes iguais: 4 pás = 90° entre elas
        const anguloDaPa = i * (2 * Math.PI / NUMERO_DE_PAS);
 
        // Gira a pá em torno do eixo
        let pa = m4.rotateY(rotor, anguloDaPa);
 
        // Afasta a pá do centro (para não ficar "dentro" do motor)
        // e coloca um pouco abaixo do motor.
        pa = m4.translate(pa, [0.3 + COMPRIMENTO_PA / 2, -0.15, 0]);
 
        // Estica o cubo: comprida (X), fininha (Y), meio larga (Z)
        pa = m4.scale(pa, [COMPRIMENTO_PA, 0.03, 0.25]);
 
        desenharParte(gl, programInfo, viewProjection, formas.cubo, pa, COR_PA);
    }
}
 
// =====================================================
// VENTILADOR DE TETO (pendurado no topo da cúpula)
// =====================================================
// posicao = [x, y, z] do PONTO DO TETO onde o ventilador é preso.
//   x e z: normalmente 0 (centro da cúpula)
//   y: altura do topo da cúpula (altura do chão + raio da cúpula)
// escala = tamanho do ventilador (diminua se ele ficar grande demais)
export function desenharVentiladorTeto(gl, programInfo, viewProjection, time,
                                       posicao = [0, 5, 0], escala = 1) {
    if (!formas) return;
 
    const angulo = time * 0.005;
 
    // Raiz = o ponto no teto. Daqui para BAIXO fica tudo (y negativo).
    let raiz = m4.translation(posicao);
    raiz = m4.scale(raiz, [escala, escala, escala]);
 
    // 1) CANOPLA: disco achatado colado no teto (fixo)
    const canopla = m4.translate(raiz, [0, -0.125, 0]);
    desenharParte(gl, programInfo, viewProjection, formas.motor, canopla, COR_POSTE);
 
    // 2) HASTE: desce do teto (fixa). Mais comprida que a do poste.
    const comprimentoHaste = 0.8;
    const haste = m4.translate(raiz, [0, -comprimentoHaste / 2, 0]);
    // esticamos só em Y para a haste ficar mais comprida
    const hasteEsticada = m4.scale(haste, [1, comprimentoHaste / ALTURA_HASTE, 1]);
    desenharParte(gl, programInfo, viewProjection, formas.haste, hasteEsticada, COR_POSTE);
 
    // 3) MOTOR: no fim da haste (fixo)
    const motor = m4.translate(raiz, [0, -comprimentoHaste - 0.125, 0]);
    desenharParte(gl, programInfo, viewProjection, formas.motor, motor, COR_MOTOR);
 
    // 4) Hélice: gira, igual ao outro modo
    desenharHelice(gl, programInfo, viewProjection, motor, angulo);
}
