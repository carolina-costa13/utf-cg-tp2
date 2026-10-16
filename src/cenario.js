// src/cenario.js
import { carregarModeloOBJ } from './carregaObjetos.js';

const m4 = twgl.m4;

// Pasta com os .obj e a textura (caminho relativo ao index.html)
const PASTA_OBJ = './assets/KayKit_Restaurant_Bits_1.0_FREE/Assets/obj/';

const ESCALA_MOVEIS = 0.65;

let diskBuffer = null;
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
const ANGULO_ABERTA_GELADEIRA = (100 * Math.PI) / 180; // 100 graus para a geladeira
const ANGULO_ABERTA_FORNO = (20 * Math.PI) / 180;     //20 graus para o forno

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

export async function initCenario(gl) {
    diskBuffer = twgl.primitives.createDiscBufferInfo(gl, 4.0, 48);

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
        console.log("Cenário carregado e porta do forno corrigida!");
    } catch (erro) {
        console.error("Erro ao carregar os modelos:", erro);
    }
}

// --- Desenho -----------------------------------------------------------------
function desenharObjeto(gl, programInfo, viewProjectionMatrix, worldMatrix, bufferInfo, cor, usaTextura = false) {
    const matFinal = m4.multiply(viewProjectionMatrix, worldMatrix);

    const uniforms = {
        u_matrix: matFinal,
        u_world: worldMatrix,
        u_color: cor,
        u_usaTextura: usaTextura ? 1 : 0,
    };
    if (texturaRestaurante) uniforms.u_texture = texturaRestaurante;

    twgl.setUniforms(programInfo, uniforms);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    twgl.drawBufferInfo(gl, bufferInfo);
}

export function desenharCenario(gl, programInfo, viewProjectionMatrix, time) {
    if (!diskBuffer) return;

    const branco = [1, 1, 1, 1];

    // --- A. CHÃO DO DIORAMA ---
    const worldChao = m4.translation([0, -0.01, 0]);
    desenharObjeto(gl, programInfo, viewProjectionMatrix, worldChao, diskBuffer, [0.85, 0.85, 0.85, 1.0]);

    // --- B. COZINHA EM L (Fundo: Canto -> Fogão -> Bancada Simples) ---
    if (bancadaCanto) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(-1.8, -1.8, 0), bancadaCanto, branco, true);
    }
    if (fogao) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(-0.5, -1.8, 0), fogao, branco, true);
    }
    if (bancadaSimples) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(0.8, -1.8, 0), bancadaSimples, branco, true);
    }

    if (tabuaDeCortar) {
        let worldTabua = m4.translation([0.8, 0.7, -1.8]);
        worldTabua = m4.scale(worldTabua, [ESCALA_MOVEIS, ESCALA_MOVEIS, ESCALA_MOVEIS]);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldTabua, tabuaDeCortar, branco, true);
    }

    // --- C. PAREDE LATERAL ---
    
    // 1. Bancada com Pia
    if (bancadaComPia) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(-1.8, -0.5, Math.PI / 2), bancadaComPia, branco, true);
    }

    const dt = ultimoTempo === null ? 0 : Math.min((time - ultimoTempo) / 1000, 0.1);
    ultimoTempo = time;
    atualizarPortas(dt);

    // 2. Geladeira Decorada
    if (geladeira) {
        const worldGeladeira = matrizMovel(-1.8, 0.8, Math.PI / 2);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldGeladeira, geladeira.corpo, branco, true);

        const worldPortaCima = matrizPortaGeladeira(worldGeladeira, portas.cima.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaCima, geladeira.portaCima, branco, true);

        const worldPortaBaixo = matrizPortaGeladeira(worldGeladeira, portas.baixo.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaBaixo, geladeira.portaBaixo, branco, true);
    }

    // 3. Forno (Com abertura controlada e eixo corrigido)
    if (forno) {
        const worldForno = matrizMovel(-1.8, 2.1, Math.PI / 2);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldForno, forno.corpo, branco, true);

        const worldPortaForno = matrizPortaForno(worldForno, portas.forno.angulo);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, worldPortaForno, forno.porta, branco, true);
    }

    // --- D. MESA E CADEIRAS ---
    const mesaX = 0.9;
    const mesaZ = 0.7;

    if (mesaRedonda) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(mesaX, mesaZ, 0), mesaRedonda, branco, true);
    }

    if (cadeira) {
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(mesaX - 0.95, mesaZ, Math.PI / 2), cadeira, branco, true);
        desenharObjeto(gl, programInfo, viewProjectionMatrix, matrizMovel(mesaX, mesaZ + 0.95, Math.PI), cadeira, branco, true);
    }
}