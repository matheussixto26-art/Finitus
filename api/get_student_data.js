import fetch from 'node-fetch';

export default async function handler(req, res) {
    console.time("Tempo total da função"); // Inicia o timer geral

    if (req.method !== 'POST') {
        console.timeEnd("Tempo total da função");
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { user, senha } = req.body;
        if (!user || !senha) {
            console.timeEnd("Tempo total da função");
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        console.time("Passo 1: Autenticação SED");
        const sedTokenResponse = await fetch('https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_1 },
            body: JSON.stringify({ user, senha }),
        });
        console.timeEnd("Passo 1: Autenticação SED");

        if (!sedTokenResponse.ok) {
            const errorText = await sedTokenResponse.text();
            console.error('Erro da API SED:', errorText);
            console.timeEnd("Tempo total da função");
            return res.status(sedTokenResponse.status).json({
                error: `Erro na autenticação inicial (SED). Verifique as credenciais. (Detalhe: ${errorText})`
            });
        }
        const sedTokenData = await sedTokenResponse.json();
        const initialToken = sedTokenData.token;

        console.time("Passo 2: Troca de Token");
        const finalTokenResponse = await fetch('https://edusp-api.ip.tv/registration/edusp/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-realm': 'edusp', 'x-api-platform': 'webclient' },
            body: JSON.stringify({ token: initialToken }),
        });
        console.timeEnd("Passo 2: Troca de Token");
        
        if (!finalTokenResponse.ok) {
            const errorText = await finalTokenResponse.text();
            console.error('Erro na troca de token:', errorText);
            console.timeEnd("Tempo total da função");
            return res.status(finalTokenResponse.status).json({ error: `Erro ao obter o token final. (Detalhe: ${errorText})` });
        }
        const finalTokenData = await finalTokenResponse.json();
        const finalToken = finalTokenData.token;
        
        const decodedToken = JSON.parse(Buffer.from(initialToken.split('.')[1], 'base64').toString());
        const codigoAluno = decodedToken.CD_USUARIO;

        console.time("Passo 3: Busca de dados em paralelo");
        const [userData, turmasData, disciplinasData] = await Promise.all([
            fetch(`https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true`, { headers: { 'x-api-key': finalToken, 'x-api-realm': 'edusp', 'x-api-platform': 'webclient' } }).then(r => r.json()),
            fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, { headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 } }).then(r => r.json()),
            fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Disciplina/ListarDisciplinaPorAluno?codigoAluno=${codigoAluno}`, { headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 } }).then(r => r.json()),
        ]);
        console.timeEnd("Passo 3: Busca de dados em paralelo");

        const aggregatedData = {
            dadosPrincipais: userData,
            turmas: turmasData,
            disciplinas: disciplinasData,
            infoTokenDecodificado: decodedToken
        };

        console.timeEnd("Tempo total da função");
        res.status(200).json(aggregatedData);

    } catch (error) {
        console.error('ERRO GERAL NO BACKEND:', error);
        console.timeEnd("Tempo total da função");
        res.status(500).json({ error: error.message || 'Falha interna no servidor.' });
    }
}
