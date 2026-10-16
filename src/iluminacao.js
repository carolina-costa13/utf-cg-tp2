// src/iluminacao.js

export function criarIluminacao() {
    // Retorna os parâmetros de luz que serão enviados para os uniforms do shader
    return {
        corAmbiente: [0.3, 0.3, 0.3, 1.0],     // Intensidade e cor da luz ambiente
        corDirecional: [1.0, 1.0, 1.0, 1.0],   // Cor da luz principal (ex: luz do sol/estúdio)
        direcaoLuz: [0.5, 0.8, 1.0]            // Vetor de direção de onde a luz incide
    };
}