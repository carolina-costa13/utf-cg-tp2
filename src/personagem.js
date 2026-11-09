import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';

const poses = [
    { translation: [1.05, 0.32, 2.4], rotationY: Math.PI },          // Pose 1: Perto da mesa de jantar (na frente, a olhar para a mesa)
    { translation: [1.95, 1.95, -1.3], rotationY: -Math.PI / 4 },    // Pose 2: Em cima da geladeira (com altura Y para ficar no topo)
    { translation: [-1.95, 0.95, -1.3], rotationY: Math.PI / 4 }    // Pose 3: Em cima da bancada de canto (corner)
];

let currentPoseIndex = 0;
let bufferInfoGato = null;
let texturaGato = null;

window.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
        currentPoseIndex = (currentPoseIndex + 1) % poses.length;
        console.log(`Gato mudou para a pose: ${currentPoseIndex + 1}`);
    }
});

function carregarTexturaGato(gl, url) {
    return new Promise((resolve, reject) => {
        const tex = twgl.createTexture(
            gl,
            { src: url, wrap: gl.CLAMP_TO_EDGE },
            (erro) => (erro ? reject(erro) : resolve(tex))
        );
    });
}

export async function initGato(gl, caminhoObj, caminhoTextura) {
    try {
        // 1. Carregar textura e modelo em paralelo
        const [respostaObj, tex] = await Promise.all([
            fetch(caminhoObj),
            carregarTexturaGato(gl, caminhoTextura)
        ]);

        if (!respostaObj.ok) throw new Error(`Erro ao carregar ${caminhoObj}`);
        texturaGato = tex;

        const textoObj = await respostaObj.text();
        const posicoes = [];
        const normais = [];
        const texcoords = [];

        // Arrays temporários para lidar com os índices do OBJ se necessário
        const vTemp = [];
        const vnTemp = [];
        const vtTemp = [];

        const linhas = textoObj.split('\n');
        for (let linha of linhas) {
            linha = linha.trim();
            if (linha.startsWith('v ')) {
                vTemp.push(linha.split(/\s+/).slice(1).map(Number));
            } else if (linha.startsWith('vt ')) {
                vtTemp.push(linha.split(/\s+/).slice(1).map(Number));
            } else if (linha.startsWith('vn ')) {
                vnTemp.push(linha.split(/\s+/).slice(1).map(Number));
            } else if (linha.startsWith('f ')) {
                const partes = linha.split(/\s+/).slice(1);
                for (let p of partes) {
                    const indices = p.split('/');
                    const vi = parseInt(indices[0]) - 1;
                    const vti = indices[1] ? parseInt(indices[1]) - 1 : -1;
                    const vni = indices[2] ? parseInt(indices[2]) - 1 : -1;

                    if (vi >= 0 && vTemp[vi]) posicoes.push(...vTemp[vi]);
                    if (vti >= 0 && vtTemp[vti]) texcoords.push(...vtTemp[vti]);
                    else texcoords.push(0, 0);

                    if (vni >= 0 && vnTemp[vni]) normais.push(...vnTemp[vni]);
                    else normais.push(0, 1, 0);
                }
            }
        }

        const arrays = {
            position: { numComponents: 3, data: new Float32Array(posicoes) },
            normal: { numComponents: 3, data: new Float32Array(normais) },
            texcoord: { numComponents: 2, data: new Float32Array(texcoords) }
        };

        bufferInfoGato = twgl.createBufferInfoFromArrays(gl, arrays);
        console.log("Modelo e textura do gato carregados com sucesso!");
    } catch (erro) {
        console.error("Erro ao carregar o modelo do gato:", erro);
    }
}

export function desenharGato(gl, programInfo, viewProjectionMatrix, iluminacao) {
    if (!bufferInfoGato) return;

    const pose = poses[currentPoseIndex];
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, pose.translation);
    mat4.rotateY(modelMatrix, modelMatrix, pose.rotationY);
    
    // Escala de proporção ajustada para o diorama
    mat4.scale(modelMatrix, modelMatrix, [1.0, 1.0, 1.0]);

    const matrizFinal = mat4.create();
    mat4.multiply(matrizFinal, viewProjectionMatrix, modelMatrix);

    const uniforms = {
        u_matrix: matrizFinal,
        u_world: modelMatrix,
        u_luzDirecao: iluminacao.direcaoLuz,
        u_color: [1.0, 1.0, 1.0, 1.0], 
        u_usaTextura: 1.0, // Ativa o uso de textura no shader
        u_xadrez: 0.0
    };

    if (texturaGato) uniforms.u_texture = texturaGato;

    twgl.setUniforms(programInfo, uniforms);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfoGato);
    twgl.drawBufferInfo(gl, bufferInfoGato);
}

