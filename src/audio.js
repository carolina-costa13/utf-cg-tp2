// src/audio.js

const sons = {
    miado: new Audio('./soundEffects/dragon-studio-cat-meow-401729.mp3'),
    ronronar: new Audio('./soundEffects/universfield-purring-cat-156459.mp3'),
    geladeiraAbrir: new Audio('./soundEffects/freesound_community-fridge-open-80053.mp3'),
    geladeiraFechar: new Audio('./soundEffects/freesound_community-fridge-close-80052.mp3'),
    geladeiraAlarme: new Audio('./soundEffects/refrigerator-01.mp3'),
    ventilador: new Audio('./soundEffects/dragon-studio-ceiling-fan-ambience-584737.mp3'),
    fritura: new Audio('./soundEffects/freesound_community-frying-food-24399.mp3'),
    fornoFechar: new Audio('./soundEffects/freesound_community-oven-door-close-10-feet_wav-44919.mp3'),
    fornoAbrir: new Audio('./soundEffects/freesound_community-oven-door-open-2-inches-44921.mp3'),
    agua: new Audio('./soundEffects/allyinnature-running-stream-water-sound-239612.mp3'),
    incendioAlarme: new Audio('./soundEffects/freesound_community-fire-alarm-33770.mp3')

};

sons.ventilador.loop = true;
sons.ventilador.volume = 0.1;
sons.miado.volume = 0.1;
sons.geladeiraAlarme.volume = 0.2;
sons.geladeiraAlarme.loop = true;
sons.fritura.volume= 0.2;
sons.agua.volume = 0.1;

// Pré-carrega todos os sons para evitar atrasos
Object.values(sons).forEach(som => {
    som.preload = 'auto';
    som.load();
});

// Função para iniciar um som
export function tocarSom(nome) {
    const som = sons[nome];
    if (som) {
        som.currentTime = 0; // Reinicia para o início
        som.play().catch(erro => console.log("Áudio aguardando interação do usuário:", erro));
    }
}

// Função específica para parar/pausar um som (essencial para o alarme!)
export function pararSom(nome) {
    const som = sons[nome];
    if (som) {
        som.pause();
        som.currentTime = 0; // Volta ao início para a próxima vez
    }
}

// --- Ventilador: ambiente contínuo, respeitando o bloqueio de autoplay ---
let ventiladorIniciado = false;

function iniciarVentilador() {
    if (ventiladorIniciado) return;
    sons.ventilador.play()
        .then(() => {
            ventiladorIniciado = true;
            window.removeEventListener('click', iniciarVentilador);
            window.removeEventListener('keydown', iniciarVentilador);
            window.removeEventListener('touchstart', iniciarVentilador);
        })
        .catch(() => { /* bloqueado: tenta de novo na próxima interação */ });
}

iniciarVentilador(); // tenta já (funciona se o navegador permitir)
window.addEventListener('click', iniciarVentilador);
window.addEventListener('keydown', iniciarVentilador);
window.addEventListener('touchstart', iniciarVentilador)