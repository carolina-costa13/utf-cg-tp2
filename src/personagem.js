import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';
import { tocarSom } from './audio.js';

const poses = [
    { translation: [1.05, 0.3, 2.4], rotationY: Math.PI, scale: [25, 25, 25] },         // Gato 1 (Perto da mesa)
    { translation: [1.95, 1.7, -1.3], rotationY: -Math.PI / 4, scale: [0.1, 0.1, 0.1] },    // Gato 2 (Geladeira)
    { translation: [-1.95, 1.3, -1.3], rotationY: Math.PI / 4, scale: [0.6, 0.6, 0.6] }     // Gato 3 (Bancada)
];

let currentPoseIndex = 0;
let gatosPartes = [[], [], []]; // Guarda as partes divididas por material para cada gato

window.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
        currentPoseIndex = (currentPoseIndex + 1) % poses.length;
        console.log(`Gato ativo alterado para a pose: ${currentPoseIndex + 1}`);
        tocarSom('miado');
    }
});

function carregarTexturaUnica(gl, url) {
    return new Promise((resolve, reject) => {
        const tex = twgl.createTexture(
            gl,
            { src: url, wrap: gl.CLAMP_TO_EDGE, flipY: 1 },
            (erro) => (erro ? reject(erro) : resolve(tex))
        );
    });
}

async function carregarTextura(gl, inputCaminhos) {
    if (Array.isArray(inputCaminhos)) {
        return Promise.all(inputCaminhos.map(url => carregarTexturaUnica(gl, url)));
    } else {
        return [await carregarTexturaUnica(gl, inputCaminhos)];
    }
}

// Lê o .obj agrupando por material (usemtl) para evitar distorção de UVs
async function carregarModeloPorMateriais(gl, caminhoObj, texturasCarregadas) {
    const respostaObj = await fetch(caminhoObj);
    if (!respostaObj.ok) throw new Error(`Erro ao carregar ${caminhoObj}`);
    const textoObj = await respostaObj.text();

    const v = [], vt = [], vn = [];
    const grupos = {};
    let materialAtual = 'default';

    const indice = (valor, tamanho) => (valor < 0 ? tamanho + valor : valor - 1);

    const adicionarVertice = (grupo, p) => {
        const [a, b, c] = p.split('/');
        const vi = indice(parseInt(a), v.length);
        const vti = b && b !== '' ? indice(parseInt(b), vt.length) : -1;
        const vni = c && c !== '' ? indice(parseInt(c), vn.length) : -1;

        grupo.position.push(...(v[vi] || [0, 0, 0]));
        grupo.texcoord.push(...(vti >= 0 && vt[vti] ? vt[vti].slice(0, 2) : [0, 0]));
        grupo.normal.push(...(vni >= 0 && vn[vni] ? vn[vni] : [0, 1, 0]));
    };

    for (let linha of textoObj.split('\n')) {
        linha = linha.trim();
        if (linha.startsWith('v ')) {
            v.push(linha.split(/\s+/).slice(1).map(Number));
        } else if (linha.startsWith('vt ')) {
            vt.push(linha.split(/\s+/).slice(1).map(Number));
        } else if (linha.startsWith('vn ')) {
            vn.push(linha.split(/\s+/).slice(1).map(Number));
        } else if (linha.startsWith('usemtl ')) {
            materialAtual = linha.slice(7).trim();
        } else if (linha.startsWith('f ')) {
            const partes = linha.split(/\s+/).slice(1);
            if (!grupos[materialAtual]) {
                grupos[materialAtual] = { position: [], normal: [], texcoord: [] };
            }
            const grupo = grupos[materialAtual];

            if (partes.length === 3) {
                for (let p of partes) adicionarVertice(grupo, p);
            } else if (partes.length === 4) {
                adicionarVertice(grupo, partes[0]); adicionarVertice(grupo, partes[1]); adicionarVertice(grupo, partes[2]);
                adicionarVertice(grupo, partes[0]); adicionarVertice(grupo, partes[2]); adicionarVertice(grupo, partes[3]);
            }
        }
    }

    const partesRenderizacao = [];
    let indiceTextura = 0;

    for (const [matNome, dados] of Object.entries(grupos)) {
        const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
            position: { numComponents: 3, data: new Float32Array(dados.position) },
            normal: { numComponents: 3, data: new Float32Array(dados.normal) },
            texcoord: { numComponents: 2, data: new Float32Array(dados.texcoord) }
        });

        // Associa a textura correspondente à ordem dos materiais ou usa a última disponível como segurança
        const texturaAtiva = texturasCarregadas[indiceTextura] || texturasCarregadas[0];
        partesRenderizacao.push({ bufferInfo, textura: texturaAtiva });
        
        if (indiceTextura < texturasCarregadas.length - 1) {
            indiceTextura++;
        }
    }

    return partesRenderizacao;
}

export async function initGatos(gl, caminhosObj, caminhosTextura) {
    try {
        for (let i = 0; i < 3; i++) {
            const texturasCarregadas = await carregarTextura(gl, caminhosTextura[i]);
            gatosPartes[i] = await carregarModeloPorMateriais(gl, caminhosObj[i], texturasCarregadas);
        }
        console.log("Os 3 modelos de gato e respetivas texturas por material foram carregados com sucesso!");
    } catch (erro) {
        console.error("Erro ao carregar os modelos dos gatos:", erro);
    }
}

export function desenharGatos(gl, programInfo, viewProjectionMatrix, iluminacao) {
    const i = currentPoseIndex;
    const partes = gatosPartes[i];
    if (!partes || partes.length === 0) return;

    const pose = poses[i];
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, pose.translation);
    mat4.rotateY(modelMatrix, modelMatrix, pose.rotationY);
    mat4.scale(modelMatrix, modelMatrix, pose.scale);

    const matrizFinal = mat4.create();
    mat4.multiply(matrizFinal, viewProjectionMatrix, modelMatrix);

    // Desenha cada parte do gato com a sua textura respetiva
    for (const parte of partes) {
        const uniforms = {
            u_matrix: matrizFinal,
            u_world: modelMatrix,
            u_luzDirecao: iluminacao.direcaoLuz,
            u_color: [1.0, 1.0, 1.0, 1.0], 
            u_usaTextura: 1.0, 
            u_xadrez: 0.0,
            u_texture: parte.textura
        };

        twgl.setUniforms(programInfo, uniforms);
        twgl.setBuffersAndAttributes(gl, programInfo, parte.bufferInfo);
        twgl.drawBufferInfo(gl, parte.bufferInfo);
    }
}
export function verificarCliqueNoGato(event, canvas, viewProjectionMatrix) {
    // 1. Corrige para usar as dimensões reais do elemento no ecrã
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
    const y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

    const invViewProj = twgl.m4.inverse(viewProjectionMatrix);
    if (!invViewProj) return false;

    const nearPoint = twgl.m4.transformPoint(invViewProj, [x, y, -1]);
    const farPoint = twgl.m4.transformPoint(invViewProj, [x, y, 1]);
    const direcao = twgl.v3.normalize(twgl.v3.subtract(farPoint, nearPoint));
    const raio = { origem: nearPoint, direcao };

    // 2. Obtém dinamicamente a posição e escala do gato ativo (pose atual)
    const poseAtiva = poses[currentPoseIndex];
    const posicaoGato = poseAtiva.translation;
    
    // Como a escala varia muito entre as poses (ex: 23 vs 0.1), 
    // adaptamos o tamanho da caixa de colisão com base na escala da pose atual:
    const fatorEscala = Array.isArray(poseAtiva.scale) ? poseAtiva.scale[0] : poseAtiva.scale;
    const tamanhoGato = [1.0 * Math.min(Math.max(fatorEscala * 0.1, 0.5), 2.0), 
                         1.0 * Math.min(Math.max(fatorEscala * 0.1, 0.5), 2.0), 
                         1.0 * Math.min(Math.max(fatorEscala * 0.1, 0.5), 2.0)];

    const min = twgl.v3.subtract(posicaoGato, twgl.v3.divScalar(tamanhoGato, 2));
    const max = twgl.v3.add(posicaoGato, twgl.v3.divScalar(tamanhoGato, 2));

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

    return true; // Acertou no gato da pose atual!
}