// src/iluminacao.js

export function criarIluminacao() {
    // Retorna os parâmetros de luz que serão enviados para os uniforms do shader
    return {
        corAmbiente: [0.6, 0.6, 0.6, 1.0],     // Intensidade e cor da luz ambiente
        corDirecional: [0.3, 0.3, 0.3, 1.0],   // Cor da luz principal (ex: luz do sol/estúdio)
        direcaoLuz: [0.5, 0.8, 1.0],            // Vetor de direção de onde a luz incide

        // Luminária (luz pontual)
        corLuz: [0.9, 0.83, 0.68, 1.0],           // branco quente
        atenuacao: [1.0, 0.1, 0.1]  
    };
}