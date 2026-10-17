// src/cenario.js
import { carregarModeloOBJ } from './carregaObjetos.js';

const m4 = twgl.m4;

// Pasta com os .obj e a textura (caminho relativo ao index.html)
const PASTA_OBJ = './assets/KayKit_Restaurant_Bits_1.0_FREE/Assets/obj/';

const ESCALA_MOVEIS = 0.65;

// --- Layout da cozinha (em L) --------------------------------------------------
// Cada móvel do KayKit tem ~2 de largura; escalado vira uma "célula" de 1.3.
// O L fica encostado nas paredes de trás (z menor) e da esquerda (x menor):
//
//   fundo (de frente p/ +Z):  [CANTO][fogão][bancada][geladeira]
//   lado  (de frente p/ +X):  [CANTO]
//                             [pia]
//                             [forno]        [mesa + cadeiras no meio]
//
// Regras usadas:
//  - Fogão e pia ficam colados no canto (zona de trabalho), com bancada ao lado do fogão.
//  - Geladeira e forno ficam nas PONTAS dos braços: são altos e suas portas abrem sem bater em nada.
//  - O L inteiro está centrado no disco (todas as quinas a ~3.3 do centro, raio do chão = 4).
//  - A mesa fica no vão interno do L, com folga para circular.
const CELULA = 2 * ESCALA_MOVEIS;               // 1.3
const ALTURA_BANCADA = 1.0 * ESCALA_MOVEIS;     // topo das bancadas (0.65)
const CANTO = { x: -1.95, z: -1.3 };            // centro da célula do canto

// i = quantas células a partir do canto (0 = o próprio canto)
const noFundo = (i) => [CANTO.x + i * CELULA, CANTO.z]; // braço do fundo, indo para a direita
const noLado  = (i) => [CANTO.x, CANTO.z + i * CELULA]; // braço lateral, vindo para a frente

// --- Chão xadrez ---------------------------------------------------------------
// O xadrez é calculado no shader pela posição no mundo. Cada quadrado mede meia célula e a
// grade começa na quina do canto, então os móveis sempre ficam alinhados com as casas.
const TAMANHO_QUADRADO = CELULA / 2;                                  // 0.65
const ORIGEM_XADREZ = [CANTO.x - CELULA / 2, CANTO.z - CELULA / 2];   // quina do canto (x, z)
const COR_XADREZ_A = [0.95, 0.95, 0.95, 1.0]; // branco
const COR_XADREZ_B = [0.12, 0.12, 0.14, 1.0]; // preto

// --- Domo (parede em meia esfera) -----------------------------------------------
// Só a face INTERNA do domo é desenhada (a face externa é descartada pelo culling),
// então ele funciona como um fundo atrás dos móveis e nunca tapa a visão de quem olha de fora.
// As cores e a altura da divisória vêm do wall.obj do KayKit (faixa verde embaixo, bege em cima),
// já na mesma escala dos móveis (divisória em y = 1.9 * 0.65 de altura).
const RAIO_DOMO = 4.0;                                   // mesmo raio do chão: a base do domo encosta na borda
const ALTURA_FAIXA = 1.9 * ESCALA_MOVEIS;                // até onde vai a faixa verde (1.235)
const COR_DOMO_BAIXO = [30 / 255, 157 / 255, 133 / 255, 1.0];   // verde-água do KayKit
const COR_DOMO_CIMA  = [228 / 255, 199 / 255, 170 / 255, 1.0];  // bege do KayKit

const MESA = { x: 0.65, z: 0.85 };
const DIST_CADEIRA = 1.1; // distância do centro da mesa ao centro da cadeira

let diskBuffer = null;
let meiaEsferaBuffer = null; // hemisfério inferior, logo abaixo do chão
let domoBaixo = null;        // faixa de baixo do domo (verde)
let domoCima = null;         // faixa de cima do domo (bege)
let texturaRestaurante = null;
let ultimoTempo = null;

let geladeira = null;
let forno = null;
let fogao = null;
let bancadaComPia = null;
let bancadaSimples = null;
let bancadaCanto = null;
let tabuaDeCortar = null;
let mesaRedonda = null;
let cadeira = null;

// --- Estado e Limites das Portas (Variáveis Independentes) ---
const ANGULO_ABERTA_GELADEIRA = (65 * Math.PI) / 180;
const ANGULO_ABERTA_FORNO = (20 * Math.PI) / 180;

const VELOCIDADE_PORTA = 3.0;
const DOBRADICA_GELADEIRA = [1.0, 0.0, 0.5];
const DOBRADICA_FORNO = [0.0, -0.4, 0.5];

const portas = {
    cima:  { angulo: 0, alvo: 0 },
    baixo: { angulo: 0, alvo: 0 },
    forno: { angulo: 0, alvo: 0 },
};

export function alternarPorta(qual) {
    if (qual === 'todas') {
        const algumaAberta = Object.values(portas).some(p => p.alvo > 0);
        portas.cima.alvo = algumaAberta ? 0 : ANGULO_ABERTA_GELADEIRA;
        portas.baixo.alvo = algumaAberta ? 0 : ANGULO_ABERTA_GELADEIRA;
        portas.forno.alvo = algumaAberta ? 0 : ANGULO_ABERTA_FORNO;
    } else if (qual === 'forno') {
        portas.forno.alvo = portas.forno.alvo > 0 ? 0 : ANGULO_ABERTA_FORNO;
    } else if (portas[qual]) {
        portas[qual].alvo = portas[qual].alvo > 0 ? 0 : ANGULO_ABERTA_GELADEIRA;
    }
}

function atualizarPortas(dt) {
    for (const porta of Object.values(portas)) {
        const diferenca = porta.alvo - porta.angulo;
        const passo = VELOCIDADE_PORTA * dt;
        porta.angulo = Math.abs(diferenca) <= passo ? porta.alvo : porta.angulo + Math.sign(diferenca) * passo;
    }
}

function matrizPortaGeladeira(worldGeladeira, angulo) {
    let m = m4.translate(worldGeladeira, DOBRADICA_GELADEIRA);
    m = m4.rotateY(m, angulo);
    return m4.translate(m, [-DOBRADICA_GELADEIRA[0], -DOBRADICA_GELADEIRA[1], -DOBRADICA_GELADEIRA[2]]);
}

function matrizPortaForno(worldForno, angulo) {
    // 1. Começa na matriz do forno no mundo
    let m = m4.translate(worldForno, DOBRADICA_FORNO);
    // 2. Aplica a rotação da porta (em torno do eixo X local)
    m = m4.rotateX(m, angulo);
    // 3. Retorna a partir do ponto da dobradiça
    return m4.translate(m, [-DOBRADICA_FORNO[0], -DOBRADICA_FORNO[1], -DOBRADICA_FORNO[2]]);
}

function matrizMovel(x, z, rotY = 0) {
    let m = m4.translation([x, 0, z]);
    if (rotY !== 0) {
        m = m4.rotateY(m, rotY);
    }
    return m4.scale(m, [ESCALA_MOVEIS, ESCALA_MOVEIS, ESCALA_MOVEIS]);
}

// --- Carregamento ------------------------------------------------------------
function carregarTextura(gl, url) {
    return new Promise((resolve, reject) => {
        const tex = twgl.createTexture(
            gl,
            { src: url, wrap: gl.CLAMP_TO_EDGE },
            (erro) => (erro ? reject(erro) : resolve(tex))
        );
    });
}

// Faixa do domo entre duas latitudes. As normais são invertidas para apontarem para dentro,
function criarDomo(gl, latInicio, latFim) {
    const dados = twgl.primitives.createSphereVertices(RAIO_DOMO, 48, 24, latInicio, latFim);
    for (let i = 0; i < dados.normal.length; i++) {
        dados.normal[i] = -dados.normal[i];
    }
    return twgl.createBufferInfoFromArrays(gl, dados);
}

export async function initCenario(gl) {
    // Chão do diorama (o disco do TWGL já nasce deitado no plano XZ)
    diskBuffer = twgl.primitives.createDiscBufferInfo(gl, 4.0, 48);

    // Meia esfera (hemisfério inferior): latitude de 90° (equador) até 180° (polo sul).
    // Mesmo raio (4.0) e mesmas 48 divisões do disco, para a borda encaixar sem degrau.
    meiaEsferaBuffer = twgl.primitives.createSphereBufferInfo(gl, 4.0, 48, 16, Math.PI / 2, Math.PI);

    // Domo: hemisfério superior dividido em duas faixas de latitude (0° = topo, 90° = equador).
    // A altura y de um ponto da esfera é RAIO * cos(latitude), então a divisória em y = ALTURA_FAIXA
    // fica na latitude acos(ALTURA_FAIXA / RAIO).
    const latDivisoria = Math.acos(ALTURA_FAIXA / RAIO_DOMO);
    domoCima  = criarDomo(gl, 0, latDivisoria);
    domoBaixo = criarDomo(gl, latDivisoria, Math.PI / 2);

    try {
        const [
            textura,
            fridgeCorpo, fridgeCima, fridgeBaixo,
            ovenCorpo, ovenPorta,
            bufFogao, bufPia, bufSimples, bufCanto, bufTabua, bufMesa, bufCadeira
        ] = await Promise.all([
            carregarTextura(gl, PASTA_OBJ + 'restaurantbits_texture.png'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'fridge_A_decorated.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'fridge_A_decorated_door_top.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'fridge_A_decorated_door_bottom.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'oven.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'oven_door.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'stove_multi_decorated.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'kitchencounter_sink.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'kitchencounter_straight_A.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'kitchencounter_innercorner.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'cuttingboard.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'table_round_A_decorated.obj'),
            carregarModeloOBJ(gl, PASTA_OBJ + 'chair_A.obj'),
        ]);

        texturaRestaurante = textura;
        geladeira = { corpo: fridgeCorpo, portaCima: fridgeCima, portaBaixo: fridgeBaixo };
        forno = { corpo: ovenCorpo, porta: ovenPorta };
        fogao = bufFogao;
        bancadaComPia = bufPia;
        bancadaSimples = bufSimples;
        bancadaCanto = bufCanto;
        tabuaDeCortar = bufTabua;
        mesaRedonda = bufMesa;
        cadeira = bufCadeira;
        console.log("Cenário carregado!");
    } catch (erro) {
        console.error("Erro ao carregar os modelos:", erro);
    }
}

// --- Desenho -----------------------------------------------------------------
function desenharObjeto(gl, programInfo, viewProjectionMatrix, worldMatrix, bufferInfo, cor, usaTextura = false, extras = {}) {
    const matFinal = m4.multiply(viewProjectionMatrix, worldMatrix);

    const uniforms = {
        u_matrix: matFinal,
        u_world: worldMatrix,
        u_color: cor,
        u_usaTextura: usaTextura ? 1 : 0,
        u_xadrez: 0,
        ...extras,
    };
    if (texturaRestaurante) uniforms.u_texture = texturaRestaurante;

    twgl.setUniforms(programInfo, uniforms);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);
}

export function desenharCenario(gl, programInfo, viewProjectionMatrix, time) {
    if (!diskBuffer || !meiaEsferaBuffer) return;

    const branco = [1, 1, 1, 1];

    // --- A. MEIA ESFERA LOGO ABAIXO DO CHÃO ---
    const worldMeiaEsfera = m4.translation([0, -0.01, 0]);
    desenharObjeto(gl, programInfo, viewProjectionMatrix, worldMeiaEsfera, meiaEsferaBuffer, [0.35, 0.25, 0.2, 1.0], false);

    // --- B. CHÃO XADREZ DO DIORAMA (Disco superior) ---
    const worldChao = m4.translation([0, -0.01, 0]);
    desenharObjeto(gl, programInfo, viewProjectionMatrix, worldChao, diskBuffer, COR_XADREZ_A, false, {
        u_xadrez: 1,
        u_color2: COR_XADREZ_B,
        u_tamanhoXadrez: TAMANHO_QUADRADO,
        u_origemXadrez: ORIGEM_XADREZ,
    });

    // --- B2. DOMO (parede em meia esfera, verde embaixo e bege em cima) ---
    // CULL_FACE com FRONT descarta as faces voltadas para a câmera (o lado de fora do domo)
    // e mantém só as de trás (o lado de dentro, no fundo da cena).
    if (domoBaixo && domoCima) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        const worldDomo = m4.translation([0, -0.01, 0]);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldDomo, domoBaixo, COR_DOMO_BAIXO, false);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldDomo, domoCima, COR_DOMO_CIMA, false);
        gl.disable(gl.CULL_FACE); // volta ao normal para os móveis
    }

    // --- C. BRAÇO DO FUNDO (de frente para +Z): canto, fogão, bancada e geladeira ---
    // O canto gira 90° para que as "paredes" dele fiquem atrás e à esquerda.
    if (bancadaCanto) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(...noFundo(0), Math.PI / 2), bancadaCanto, branco, true);
    }
    if (fogao) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(...noFundo(1)), fogao, branco, true);
    }
    if (bancadaSimples) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(...noFundo(2)), bancadaSimples, branco, true);
    }
    if (tabuaDeCortar) {
        // Apoiada no topo da bancada simples
        const [bx, bz] = noFundo(2);
        let worldTabua = m4.translation([bx, ALTURA_BANCADA, bz]);
        worldTabua = m4.scale(worldTabua, [ESCALA_MOVEIS, ESCALA_MOVEIS, ESCALA_MOVEIS]);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldTabua, tabuaDeCortar, branco, true);
    }

    const dt = ultimoTempo === null ? 0 : Math.min((time - ultimoTempo) / 1000, 0.1);
    ultimoTempo = time;
    atualizarPortas(dt);

    // Geladeira na ponta direita do fundo: a dobradiça fica do lado de fora, a porta abre livre
    if (geladeira) {
        const worldGeladeira = matrizMovel(...noFundo(3));
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldGeladeira, geladeira.corpo, branco, true);

        const worldPortaCima = matrizPortaGeladeira(worldGeladeira, portas.cima.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaCima, geladeira.portaCima, branco, true);

        const worldPortaBaixo = matrizPortaGeladeira(worldGeladeira, portas.baixo.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaBaixo, geladeira.portaBaixo, branco, true);
    }

    // --- D. BRAÇO LATERAL (de frente para +X): pia e forno ---
    if (bancadaComPia) { // bancada COM torneira, colada no canto
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(...noLado(1), Math.PI / 2), bancadaComPia, branco, true);
    }
    if (forno) { // forno na ponta do braço lateral
        const worldForno = matrizMovel(...noLado(2), Math.PI / 2);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldForno, forno.corpo, branco, true);

        const worldPortaForno = matrizPortaForno(worldForno, portas.forno.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaForno, forno.porta, branco, true);
    }

    // --- E. MESA E CADEIRAS (no vão interno do L) ---
    if (mesaRedonda) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(MESA.x, MESA.z), mesaRedonda, branco, true);
    }
    if (cadeira) {
        // [deslocamento X, deslocamento Z, giro]: cada cadeira olha para o centro da mesa
        const cadeiras = [
            [-DIST_CADEIRA, 0,  Math.PI / 2],  // esquerda
            [0,  DIST_CADEIRA,  Math.PI],      // frente
            [ DIST_CADEIRA, 0, -Math.PI / 2],  // direita
        ];
        for (const [dx, dz, giro] of cadeiras) {
            desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(MESA.x + dx, MESA.z + dz, giro), cadeira, branco, true);
        }
    }
}