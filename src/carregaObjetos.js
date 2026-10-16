// src/carregaObjetos.js
 
// Converte o texto de um .obj em arrays de posição, normal e texcoord (já triangulados)
export function parseOBJ(texto) {
    // O índice 0 é "fantasma", pois os índices do OBJ começam em 1
    const tempPositions = [[0, 0, 0]];
    const tempTexcoords = [[0, 0]];
    const tempNormals = [[0, 0, 0]];
 
    const position = [];
    const normal = [];
    const texcoord = [];
 
    // Suporta índices negativos (relativos ao fim da lista) do formato OBJ
    const resolver = (idx, lista) => (idx < 0 ? lista.length + idx : idx);
 
    for (let linha of texto.split('\n')) {
        linha = linha.trim();
 
        if (linha.startsWith('v ')) {
            tempPositions.push(linha.split(/\s+/).slice(1).map(Number));
        } else if (linha.startsWith('vt ')) {
            const [u, v] = linha.split(/\s+/).slice(1).map(Number);
            // O OBJ tem v=0 embaixo; a imagem no WebGL tem a primeira linha em cima.
            // Por isso invertemos o v.
            tempTexcoords.push([u, 1 - v]);
        } else if (linha.startsWith('vn ')) {
            tempNormals.push(linha.split(/\s+/).slice(1).map(Number));
        } else if (linha.startsWith('f ')) {
            const partes = linha.split(/\s+/).slice(1);
 
            // Triangula polígonos (quads etc.) em leque
            for (let i = 1; i < partes.length - 1; i++) {
                const tri = [partes[0], partes[i], partes[i + 1]];
 
                for (const vert of tri) {
                    // Formatos aceitos: v, v/vt, v//vn, v/vt/vn
                    const idx = vert.split('/');
                    const pIdx = resolver(parseInt(idx[0]), tempPositions);
                    const tIdx = idx[1] ? resolver(parseInt(idx[1]), tempTexcoords) : 0;
                    const nIdx = idx[2] ? resolver(parseInt(idx[2]), tempNormals) : 0;
 
                    const p = tempPositions[pIdx] || [0, 0, 0];
                    position.push(p[0], p[1], p[2]);
 
                    const t = tempTexcoords[tIdx] || [0, 0];
                    texcoord.push(t[0], t[1]);
 
                    const n = (nIdx > 0 && tempNormals[nIdx]) || [0, 1, 0];
                    normal.push(n[0], n[1], n[2]);
                }
            }
        }
    }
 
    return { position, normal, texcoord };
}
 
export async function carregarModeloOBJ(gl, url) {
    const resposta = await fetch(url);
    if (!resposta.ok) {
        throw new Error(`Não foi possível carregar ${url} (HTTP ${resposta.status})`);
    }
    const texto = await resposta.text();
    const { position, normal, texcoord } = parseOBJ(texto);
 
    const arrays = {
        position: { numComponents: 3, data: new Float32Array(position) },
        normal: { numComponents: 3, data: new Float32Array(normal) },
        texcoord: { numComponents: 2, data: new Float32Array(texcoord) },
    };
 
    console.log(`[OBJ Loader] ${url} -> vértices: ${position.length / 3}`);
    return twgl.createBufferInfoFromArrays(gl, arrays);
}