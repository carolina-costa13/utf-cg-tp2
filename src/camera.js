// src/camera.js
const m4 = twgl.m4;
 
export function calcularMatrizesCamera(tipoCamera, cameraRotation, canvas) {
    const aspect = canvas.clientWidth / canvas.clientHeight;
 
    // Projeção perspectiva (FOV de 60 graus, near = 0.1, far = 200)
    const projectionMatrix = m4.perspective((60 * Math.PI) / 180, aspect, 0.1, 200);
 
    let cameraMatrix;
 
    if (tipoCamera === 1) {
        // Câmera 1: órbita em torno do centro [0, 0, 0]
        const eye = [Math.cos(cameraRotation) * 6, 3.5, Math.sin(cameraRotation) * 6];
        const target = [0, 0, 0];
        const up = [0, 1, 0];
        cameraMatrix = m4.lookAt(eye, target, up);
    } else {
        // Câmera 2: vista superior olhando para baixo
        const eye = [0, 8, 0.01];
        const target = [0, 0, 0];
        const up = [0, 0, -1];
        cameraMatrix = m4.lookAt(eye, target, up);
    }
 
    // CORREÇÃO PRINCIPAL: m4.lookAt devolve a matriz de MUNDO da câmera.
    // A matriz de view é a inversa dela.
    const viewMatrix = m4.inverse(cameraMatrix);
 
    // ViewProjection = Projeção * View
    return m4.multiply(projectionMatrix, viewMatrix);
}
 