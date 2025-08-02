export default async function handler(req, res) {
    // Este código NÃO tenta fazer login. Ele APENAS verifica as variáveis de ambiente.
    const key1 = process.env.SED_SUBSCRIPTION_KEY_1;
    const key2 = process.env.SED_SUBSCRIPTION_KEY_2;

    const diagnostics = {
        titulo: "Relatório de Diagnóstico do Servidor",
        mensagem: "Este é o status das suas variáveis de ambiente na Vercel. Ambas precisam ser 'true'.",
        SED_SUBSCRIPTION_KEY_1_ENCONTRADA: !!key1,
        SED_SUBSCRIPTION_KEY_2_ENCONTRADA: !!key2,
        valor_key1: key1 ? `Encontrada. Termina com: ...${key1.slice(-4)}` : "!!! AUSENTE !!!",
        valor_key2: key2 ? `Encontrada. Termina com: ...${key2.slice(-4)}` : "!!! AUSENTE !!!"
    };

    // Retorna o resultado do diagnóstico como um JSON para o frontend.
    return res.status(200).json(diagnostics);
}
