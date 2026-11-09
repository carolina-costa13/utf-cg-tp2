import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';

const poses = [
   { translation: [1.05, 0.3, 2.4], rotationY: Math.PI, scale: [23, 23, 23] },         // Gato 1 (Perto da mesa)
    { translation: [1.95, 1.7, -1.3], rotationY: -Math.PI / 4, scale: [0.1, 0.1, 0.1] },     // Gato 2 (Geladeira - ex: menor)
    { translation: [-1.95, 1.3, -1.3], rotationY: Math.PI / 4, scale: [0.7, 0.7, 0.7] }      // Gato 3 (Bancada - ex: maior)
];

let currentPoseIndex = 0;
let bufferInfoGatos = [null, null, null];
let texturaGatos = [null, null, null]; // Cada posição pode guardar um array de texturas

window.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
        currentPoseIndex = (currentPoseIndex + 1) % poses.length;
        console.log(`Gato ativo alterado para a pose: ${currentPoseIndex + 1}`);
    }
});

// Função auxiliar para carregar uma textura isolada
function carregarTexturaUnica(gl, url) {
    return new Promise((resolve, reject) => {
        const tex = twgl.createTexture(
            gl,
            { src: url, wrap: gl.CLAMP_TO_EDGE },
            (erro) => (erro ? reject(erro) : resolve(tex))
        );
    });
}

// Carrega texturas (seja uma string única ou um array de strings)
async function carregarTextura(gl, inputCaminhos) {
    if (Array.isArray(inputCaminhos)) {
        return Promise.all(inputCaminhos.map(url => carregarTexturaUnica(gl, url)));
    } else {
        return carregarTexturaUnica(gl, inputCaminhos);
    }
}

async function carregarModeloObj(gl, caminhoObj) {
    const respostaObj = await fetch(caminhoObj);
    if (!respostaObj.ok) throw new Error(`Erro ao carregar ${caminhoObj}`);
    const textoObj = await respostaObj.text();

    const posicoes = [];
    const normais = [];
    const texcoords = [];

    const vTemp = [], vnTemp = [], vtTemp = [];
    const linhas = textoObj.split('\n');
    
    const processarVertice = (p) => {
        const indices = p.split('/');
        const vi = parseInt(indices[0]) - 1;
        const vti = indices[1] && indices[1] !== '' ? parseInt(indices[1]) - 1 : -1;
        const vni = indices[2] && indices[2] !== '' ? parseInt(indices[2]) - 1 : -1;

        posicoes.push(...(vi >= 0 && vTemp[vi] ? vTemp[vi] : [0, 0, 0]));
        texcoords.push(...(vti >= 0 && vtTemp[vti] ? vtTemp[vti] : [0, 0]));
        normais.push(...(vni >= 0 && vnTemp[vni] ? vnTemp[vni] : [0, 1, 0]));
    };

    for (let linha of linhas) {
        linha = linha.trim();
        if (linha.startsWith('v ')) vTemp.push(linha.split(/\s+/).slice(1).map(Number));
        else if (linha.startsWith('vt ')) vtTemp.push(linha.split(/\s+/).slice(1).map(Number));
        else if (linha.startsWith('vn ')) vnTemp.push(linha.split(/\s+/).slice(1).map(Number));
        else if (linha.startsWith('f ')) {
            const partes = linha.split(/\s+/).slice(1);
            if (partes.length === 3) {
                for (let p of partes) processarVertice(p);
            } else if (partes.length === 4) {
                processarVertice(partes[0]); processarVertice(partes[1]); processarVertice(partes[2]);
                processarVertice(partes[0]); processarVertice(partes[2]); processarVertice(partes[3]);
            }
        }
    }

    const arrays = {
        position: { numComponents: 3, data: new Float32Array(posicoes) },
        normal: { numComponents: 3, data: new Float32Array(normais) },
        texcoord: { numComponents: 2, data: new Float32Array(texcoords) }
    };

    return twgl.createBufferInfoFromArrays(gl, arrays);
}

export async function initGatos(gl, caminhosObj, caminhosTextura) {
    try {
        for (let i = 0; i < 3; i++) {
            const [bufferInfo, tex] = await Promise.all([
                carregarModeloObj(gl, caminhosObj[i]),
                carregarTextura(gl, caminhosTextura[i])
            ]);
            bufferInfoGatos[i] = bufferInfo;
            texturaGatos[i] = tex;
        }
        console.log("Os 3 modelos de gato e respetivas texturas foram carregados com sucesso!");
    } catch (erro) {
        console.error("Erro ao carregar os modelos dos gatos:", erro);
    }
}

export function desenharGatos(gl, programInfo, viewProjectionMatrix, iluminacao) {
    const i = currentPoseIndex;
    if (!bufferInfoGatos[i]) return;

    const pose = poses[i];
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, pose.translation);
    mat4.rotateY(modelMatrix, modelMatrix, pose.rotationY);
    mat4.scale(modelMatrix, modelMatrix, pose.scale);

    const matrizFinal = mat4.create();
    mat4.multiply(matrizFinal, viewProjectionMatrix, modelMatrix);

    const uniforms = {
        u_matrix: matrizFinal,
        u_world: modelMatrix,
        u_luzDirecao: iluminacao.direcaoLuz,
        u_color: [1.0, 1.0, 1.0, 1.0], 
        u_usaTextura: 1.0, 
        u_xadrez: 0.0
    };

   
    const texAtiva = texturaGatos[i];
    uniforms.u_texture = Array.isArray(texAtiva) ? texAtiva[0] : texAtiva;

    twgl.setUniforms(programInfo, uniforms);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfoGatos[i]);
    twgl.drawBufferInfo(gl, bufferInfoGatos[i]);
}
