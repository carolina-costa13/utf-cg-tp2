// src/cenario.js
import { carregarModeloOBJ } from './carregaObjetos.js';
import { initVentilador, desenharVentiladorTeto } from './ventilador.js';
import { tocarSom, pararSom } from './audio.js';

let tempoGeladeiraAberta = 0;
const TEMPO_LIMITE_ALARME = 5.0; // 5 segundos aberta dispara o alarme
let alarmeTocando = false;

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
        const novoAlvoGeladeira = algumaAberta ? 0 : ANGULO_ABERTA_GELADEIRA;
        const novoAlvoForno = algumaAberta ? 0 : ANGULO_ABERTA_FORNO;

        portas.cima.alvo = novoAlvoGeladeira;
        portas.baixo.alvo = novoAlvoGeladeira;
        portas.forno.alvo = novoAlvoForno;

        // Toca o som dependendo se foram todas abertas ou fechadas
        if (algumaAberta) {
            tocarSom('geladeiraFechar');
            tocarSom('fornoFechar');
            pararSom('geladeiraAlarme');
        } else {
            tocarSom('geladeiraAbrir');
            tocarSom('fornoAbrir');
        }

    } else if (qual === 'forno') {
        const vaiAbrir = portas.forno.alvo === 0;
        portas.forno.alvo = vaiAbrir ? ANGULO_ABERTA_FORNO : 0;

        // Toca o som para o forno (podes usar os da geladeira ou criar específicos no audio.js)
        if (vaiAbrir) {
            tocarSom('fornoAbrir');
        } else {
            tocarSom('fornoFechar');
        }

    } else if (portas[qual]) {
        const vaiAbrir = portas[qual].alvo === 0;
        portas[qual].alvo = vaiAbrir ? ANGULO_ABERTA_GELADEIRA : 0;

        // Toca o som para a porta específica (cima ou baixo da geladeira)
        if (vaiAbrir) {
            tocarSom('geladeiraAbrir');
        } else {
            tocarSom('geladeiraFechar');
            pararSom('geladeiraAlarme');
        }
    }
}

function atualizarPortas(dt) {
    // Atualiza a animação suave de todas as portas
    for (const porta of Object.values(portas)) {
        const diferenca = porta.alvo - porta.angulo;
        const passo = VELOCIDADE_PORTA * dt;
        porta.angulo = Math.abs(diferenca) <= passo ? porta.alvo : porta.angulo + Math.sign(diferenca) * passo;
    }

    // --- Lógica do Alarme da Geladeira ---
    const geladeiraAberta = portas.cima.alvo > 0 || portas.baixo.alvo > 0;

    if (geladeiraAberta) {
        tempoGeladeiraAberta += dt;
        
        // Se passou do limite e o alarme ainda não está a tocar
        if (tempoGeladeiraAberta >= TEMPO_LIMITE_ALARME && !alarmeTocando) {
            tocarSom('geladeiraAlarme'); // Certifica-te de registar este som no audio.js
            alarmeTocando = true;
        }
    } else {
        // Se a geladeira foi fechada, reinicia o temporizador e o alarme
        tempoGeladeiraAberta = 0;
        alarmeTocando = false;
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

    initVentilador(gl);
    initFumaca(gl);
    initAgua(gl);

    // Chão do diorama (o disco do TWGL já nasce deitado no plano XZ)
    diskBuffer = twgl.primitives.createDiscBufferInfo(gl, 4.0, 48);

    copoBuffer = twgl.primitives.createCylinderBufferInfo(gl, 1, 1, 24, 1);

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
        u_ehAgua: 0,
        u_ehParticula: 0.0,
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
    desenharObjeto(gl, programInfo, viewProjectionMatrix, worldMeiaEsfera, meiaEsferaBuffer, [0.35, 0.25, 0.18, 1.0], false);

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

        // VENTILADOR DE TETO (pendurado no topo do domo)
        /*
        programaInfo: informações sobre o programa de shaders usado pra desenhar os objetos.

        viewProjectionMatrix: matriz que combina a transformação de visão da câmera com a 
        projeção 3d para a img 2D (determina como o mundo 3D vai ser apresentado na tela)

        time: tempo fornecido pelo sistema de animação, recebido pela função desenharCenario().

        [0, RAIO_DOMO - 0.1, 0]: vetor posição do ventilador no mundo 3D, define onde o objeto será 
        colocado.

        0.8: escala/tamanho do ventilador.
        */

    desenharVentiladorTeto(gl, programInfo, viewProjectionMatrix, time,
        [0, RAIO_DOMO - 0.1, 0], 0.8);   

     // PARTÍCULAS (sempre por último, por causa da transparência) ---
    atualizarNivelPia(dt);
    desenharAguaPia(gl, programInfo, viewProjectionMatrix);
    atualizarEDesenharFumaca(gl, programInfo.program, programInfo, viewProjectionMatrix, dt);
    atualizarEDesenharAgua(gl, programInfo.program, programInfo, viewProjectionMatrix, dt);
}
//---------------------------------------------------------------
// som fritura ao clicar no fogão
//---------------------------------------------------------------


export function verificarCliqueNoForno(event, canvas, viewProjectionMatrix) {
    // 1. Pega nas dimensões reais do elemento no ecrã (clientWidth)
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
    const y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

    // Usa twgl.m4 para inverter a matriz
    const invViewProj = twgl.m4.inverse(viewProjectionMatrix);
    if (!invViewProj) return false;

    const nearPoint = twgl.m4.transformPoint(invViewProj, [x, y, -1]);
    const farPoint = twgl.m4.transformPoint(invViewProj, [x, y, 1]);
    const direcao = twgl.v3.normalize(twgl.v3.subtract(farPoint, nearPoint));
    const raio = { origem: nearPoint, direcao };

    // 2. Calcula a posição exata onde o fogão é desenhado (noFundo(1))
    const [fx, fz] = noFundo(1);
    const posicaoForno = [fx, 0.0, fz]; // Altura 0 no centro da célula
    
    // 3. Tamanho da bounding box ajustado à escala dos móveis (CELULA = 1.3)
    const tamanhoForno = [CELULA * 0.9, 1.0, CELULA * 0.9]; 

    const min = twgl.v3.subtract(posicaoForno, twgl.v3.divScalar(tamanhoForno, 2));
    const max = twgl.v3.add(posicaoForno, twgl.v3.divScalar(tamanhoForno, 2));

    let tmin = (min[0] - raio.origem[0]) / raio.direcao[0];
    let tmax = (max[0] - raio.origem[0]) / raio.direcao[0];
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (min[1] - raio.origem[1]) / raio.direcao[1];
    let tymax = (max[1] - raio.origem[1]) / raio.direcao[1];
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if ((tmin > tymax) || (tymin > tmax)) return false;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (min[2] - raio.origem[2]) / raio.direcao[2];
    let tzmax = (max[2] - raio.origem[2]) / raio.direcao[2];
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if ((tmin > tzmax) || (tzmin > tmax)) return false;

    return true; // Acertou no fogão!
}

// --- PARTÍCULAS: utilidades compartilhadas (fumaça e água) --------------------

const ATTR_POSICAO = 'position';
const ATTR_VIDA = 'a_vida';
 
function criarBufferParticulas(gl, posicoes, vidas) {
    return twgl.createBufferInfoFromArrays(gl, {
        pos:  { numComponents: 3, data: posicoes, drawType: gl.DYNAMIC_DRAW, attrib: ATTR_POSICAO },
        vida: { numComponents: 1, data: vidas,    drawType: gl.DYNAMIC_DRAW, attrib: ATTR_VIDA },
    });
}
 
function enviarEDesenharParticulas(gl, programInfo, shaderProgram, viewProjectionMatrix, bufferInfo, posicoes, vidas, cor, quantidade, tamanho, alfa, ventoFumaca = 0.0){
    // Atualiza os buffers com as posições/vidas deste frame
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs[ATTR_POSICAO].buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, posicoes);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs[ATTR_VIDA].buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vidas);
 
    const programa = shaderProgram || programInfo.program;
    gl.useProgram(programa);
 
    // Desliga atributos da malha anterior (normal/texcoord): se ficarem ligados
    
    const locNormal = gl.getAttribLocation(programa, 'normal');
    const locTexcoord = gl.getAttribLocation(programa, 'texcoord');
    if (locNormal >= 0) gl.disableVertexAttribArray(locNormal);
    if (locTexcoord >= 0) gl.disableVertexAttribArray(locTexcoord);
 
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
 
     twgl.setUniforms(programInfo, {
        u_matrix: viewProjectionMatrix,
        u_ehParticula: 1.0,
        u_corParticula: cor,
        u_tamanhoParticula: tamanho,
        u_alfaParticula: alfa,
        u_ventoFumaca: ventoFumaca,
    })
 
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    gl.drawArrays(gl.POINTS, 0, quantidade);
 
    const locVida = gl.getAttribLocation(programa, ATTR_VIDA);
    if (locVida >= 0) gl.disableVertexAttribArray(locVida);
 
    gl.depthMask(true);
     twgl.setUniforms(programInfo, { u_ehParticula: 0.0, u_ventoFumaca: 0.0 });
}
 
// --- SISTEMA DE PARTÍCULAS (Fumaça do Fogão) ---------------------------------
let fumacaLigada = false;
const numParticulas = 30;
let posicoesParticulas = null;
let vidasParticulas = null;
let bufferInfoParticulas = null;
const particulasDados = [];
const FUMACA_DESLOC = [0.0, 0.0]
 
const Y_INICIO_FUMACA = ALTURA_BANCADA + 0.55;
 
export function alternarFumaca() {
    fumacaLigada = !fumacaLigada;
    console.log(`Fumaça: ${fumacaLigada ? 'LIGADA' : 'DESLIGADA'}`);
    return fumacaLigada;
}
 
export function initFumaca(gl) {
    posicoesParticulas = new Float32Array(numParticulas * 3);
    vidasParticulas = new Float32Array(numParticulas);
    particulasDados.length = 0;
 
    const [bx, bz] = noFundo(1);
    const fx = bx + FUMACA_DESLOC[0];
    const fz = bz + FUMACA_DESLOC[1];
 
    for (let i = 0; i < numParticulas; i++) {
        particulasDados.push({
            x: fx + (Math.random() - 0.5) * 0.3,
            y: Y_INICIO_FUMACA + Math.random() * 0.5,
            z: fz + (Math.random() - 0.5) * 0.3,
            vx: (Math.random() - 0.5) * 0.15,   // unidades por SEGUNDO
            vy: 0.25 + Math.random() * 0.25,
            vz: (Math.random() - 0.5) * 0.15,
            vida: Math.random(),
            vidaMaxima: 1.5 + Math.random() * 1.5
        });
        posicoesParticulas[i * 3 + 0] = fx;
        posicoesParticulas[i * 3 + 1] = Y_INICIO_FUMACA;
        posicoesParticulas[i * 3 + 2] = fz;
    }
 
    bufferInfoParticulas = criarBufferParticulas(gl, posicoesParticulas, vidasParticulas);
}
 
// O último parâmetro é ignorado: quem controla é alternarFumaca().
export function atualizarEDesenharFumaca(gl, shaderProgram, programInfo, viewProjectionMatrix, deltaTime) {
    if (!fumacaLigada || !bufferInfoParticulas) return;
 
    const [bx, bz] = noFundo(1);
    const fx = bx + FUMACA_DESLOC[0];
    const fz = bz + FUMACA_DESLOC[1];

    for (let i = 0; i < numParticulas; i++) {
        const p = particulasDados[i];
        p.vida += deltaTime;
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.z += p.vz * deltaTime;
 
        if (p.vida >= p.vidaMaxima || p.y > 2.2) {
            p.vida = 0;
            p.x = fx + (Math.random() - 0.5) * 0.3;
            p.y = Y_INICIO_FUMACA;
            p.z = fz + (Math.random() - 0.5) * 0.3;
        }
 
        posicoesParticulas[i * 3 + 0] = p.x;
        posicoesParticulas[i * 3 + 1] = p.y;
        posicoesParticulas[i * 3 + 2] = p.z;
        vidasParticulas[i] = p.vida / p.vidaMaxima;
    }
 
    enviarEDesenharParticulas(gl, programInfo, shaderProgram, viewProjectionMatrix,
    bufferInfoParticulas, posicoesParticulas, vidasParticulas, [0.9, 0.9, 0.9], numParticulas, 25.0, 0.6, 1.0);
}
 
// --- SISTEMA DE PARTÍCULAS DA ÁGUA (Pia / Torneira) --------------------------
let torneiraLigada = false;
const numGotas = 12;
let posicoesGotas = null;
let vidasGotas = null;
let bufferInfoGotas = null;
const gotasDados = [];
let jatoBuffer = null;
const RAIO_JATO = 0.018;
const TORNEIRA_DESLOC = [-0.05, 0.0];

 
const Y_INICIO_AGUA = ALTURA_BANCADA + 0.35; // altura da torneira
const Y_FIM_AGUA = ALTURA_BANCADA;           // para na superfície da bancada
 
export function alternarTorneira() {
    torneiraLigada = !torneiraLigada;
    if (torneiraLigada) {
        tocarSom('agua');
    } else {
        pararSom('agua');
    }
    console.log(`Torneira: ${torneiraLigada ? 'LIGADA' : 'DESLIGADA'}`);
    return torneiraLigada;
}
 
export function initAgua(gl) {
    aguaPiaBuffer = twgl.primitives.createPlaneBufferInfo(gl, 1, 1, 24, 24);
    jatoBuffer = twgl.primitives.createCylinderBufferInfo(gl, 1, 1, 12, 1); // raio 1, altura 1

    posicoesGotas = new Float32Array(numGotas * 3);
    vidasGotas = new Float32Array(numGotas);
    gotasDados.length = 0;

    const [px, pz] = posTorneira();

    for (let i = 0; i < numGotas; i++) {
        gotasDados.push({
            x: px, y: Y_FUNDO_PIA, z: pz,
            vx: 0, vy: 0, vz: 0,
            vida: Math.random(),
            vidaMaxima: 0.6
        });
        posicoesGotas[i * 3 + 0] = px;
        posicoesGotas[i * 3 + 1] = Y_FUNDO_PIA;
        posicoesGotas[i * 3 + 2] = pz;
    }

    bufferInfoGotas = criarBufferParticulas(gl, posicoesGotas, vidasGotas);
}


export function atualizarEDesenharAgua(gl, shaderProgram, programInfo, viewProjectionMatrix, deltaTime) {
    if (!torneiraLigada || !bufferInfoGotas) return;

    const [px, pz] = posTorneira();
    const yAgua = yFimAgua();

    for (let i = 0; i < numGotas; i++) {
        const g = gotasDados[i];
        g.vida += deltaTime;
        g.vy -= 3.0 * deltaTime;           // gravidade
        g.x += g.vx * deltaTime;
        g.y += g.vy * deltaTime;
        g.z += g.vz * deltaTime;

        if (g.vida >= g.vidaMaxima || (g.y < yAgua && g.vida > 0.05)) {
            g.vida = 0;
            g.vidaMaxima = 0.4 + Math.random() * 0.3;
            g.x = px + (Math.random() - 0.5) * 0.03;
            g.y = yAgua;
            g.z = pz + (Math.random() - 0.5) * 0.03;
            g.vx = (Math.random() - 0.5) * 0.35;
            g.vy = 0.5 + Math.random() * 0.4;
            g.vz = (Math.random() - 0.5) * 0.35;
        }

        posicoesGotas[i * 3 + 0] = g.x;
        posicoesGotas[i * 3 + 1] = g.y;
        posicoesGotas[i * 3 + 2] = g.z;
        vidasGotas[i] = g.vida / g.vidaMaxima;
    }

    enviarEDesenharParticulas(gl, programInfo, shaderProgram, viewProjectionMatrix,
        bufferInfoGotas, posicoesGotas, vidasGotas, [0.6, 0.8, 1.0], numGotas, 4.0, 0.9, 0.0);
}

// --- ÁGUA NA PIA ---------------------------------------------------------------
// Ajuste estes valores até casar com a cuba do kitchencounter_sink.obj
const PIA_LARGURA_X = 0.55;      // tamanho da cuba no eixo X do mundo
const PIA_LARGURA_Z = 0.8;       // tamanho da cuba no eixo Z do mundo
const PIA_DESLOC = [0.0, 0.0];   // deslocamento [x, z] da cuba em relação ao centro da célula
const Y_FUNDO_PIA = ALTURA_BANCADA - 0.15;  // fundo da cuba
const Y_TOPO_PIA  = ALTURA_BANCADA - 0.03;  // nível máximo (um pouco abaixo da borda)

const TEMPO_ENCHER   = 3.0;  // s para encher, com a torneira aberta
const TEMPO_CHEIA    = 4.0;  // s que fica cheia depois de fechar a torneira
const TEMPO_ESVAZIAR = 3.0;  // s para esvaziar

let nivelPia = 0;        // 0 = vazia, 1 = cheia
let tempoParada = 0;     // tempo desde que a torneira foi fechada
let aguaPiaBuffer = null;

// Posição da boca da torneira (ajuste TORNEIRA_DESLOC)
function posTorneira() {
    const [bx, bz] = noLado(1);
    return [bx + TORNEIRA_DESLOC[0], bz + TORNEIRA_DESLOC[1]];
}

function yFimAgua() {
    // As gotas param na superfície da água (ou no fundo da cuba se estiver vazia)
    return Y_FUNDO_PIA + nivelPia * (Y_TOPO_PIA - Y_FUNDO_PIA);
}

function atualizarNivelPia(dt) {
    if (torneiraLigada) {
        tempoParada = 0;
        nivelPia = Math.min(1, nivelPia + dt / TEMPO_ENCHER);
    } else if (nivelPia > 0) {
        tempoParada += dt;
        if (tempoParada > TEMPO_CHEIA) {
            nivelPia = Math.max(0, nivelPia - dt / TEMPO_ESVAZIAR);
        }
    }
}
 
function desenharAguaPia(gl, programInfo, viewProjectionMatrix) {
    const [px, pz] = posTorneira();
    const yAgua = yFimAgua();

    gl.depthMask(false);

    // Jato: cilindro fino da boca da torneira até a superfície da água
    if (torneiraLigada && jatoBuffer) {
        const altura = Y_INICIO_AGUA - yAgua;
        if (altura > 0) {
            let w = m4.translation([px, yAgua + altura / 2, pz]);
            w = m4.scale(w, [RAIO_JATO, altura, RAIO_JATO]);
            desenharObjeto(gl, programInfo, viewProjectionMatrix, w, jatoBuffer,
                [0.55, 0.78, 1.0, 0.55], false);
        }
    }

    // Superfície da água na pia (ondula com o vento)
    if (nivelPia > 0 && aguaPiaBuffer) {
        const [cx, cz] = noLado(1);
        let w = m4.translation([cx + PIA_DESLOC[0], yAgua, cz + PIA_DESLOC[1]]);
        w = m4.scale(w, [PIA_LARGURA_X, 1, PIA_LARGURA_Z]);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, w, aguaPiaBuffer,
            [0.3, 0.6, 0.9, 0.6], false, { u_ehAgua: 1 });
    }

     gl.depthMask(true);
    twgl.setUniforms(programInfo, { u_ehAgua: 0 });
}

// --- VIDRO (semitransparente) --------------------------------------------------
const ALTURA_MESA = 0.6;                       // altura do tampo da mesa (ajuste se precisar)
const COR_VIDRO = [0.75, 0.9, 1.0, 0.28];      // o 4º valor é a transparência
let redomaBuffer = null;
let copoBuffer = null;


export function desenharCopo(gl, programInfo, viewProjectionMatrix) {
    if (!copoBuffer) return;

    const [bx, bz] = noFundo(2);
    let mCopo = m4.translation([bx + 0.5, ALTURA_BANCADA + 0.09, bz + -0.5]);
    mCopo = m4.scale(mCopo, [0.07, 0.18, 0.07]); // largura, altura, profundidade

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);     // transparente não escreve no z-buffer
    gl.enable(gl.CULL_FACE);

    // Duas passadas: primeiro as faces de trás, depois as da frente
    for (const face of [gl.FRONT, gl.BACK]) {
        gl.cullFace(face);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, mCopo, copoBuffer, COR_VIDRO, false);
    }

    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
}