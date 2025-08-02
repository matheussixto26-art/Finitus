// Usamos o 'node-fetch' pois o 'fetch' nativo do Node.js ainda pode ser experimental em alguns ambientes.
// Na Vercel, isso garante compatibilidade.
import fetch from 'node-fetch';

// Handler principal da função serverless
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { user, senha } = req.body;

        if (!user || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        // --- PASSO 1: Autenticação Inicial (SED) ---
        const sedTokenResponse = await fetch('https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_1,
            },
            body: JSON.stringify({ user, senha }),
        });

        const sedTokenData = await sedTokenResponse.json();
        if (!sedTokenResponse.ok) {
            return res.status(sedTokenResponse.status).json({ error: `Erro na autenticação inicial (SED): ${sedTokenData.Message || 'Credenciais inválidas'}` });
        }
        const initialToken = sedTokenData.token; // O token JWT do passo 1

        // --- PASSO 2: Troca de Token (Plataforma de Mídia) ---
        const finalTokenResponse = await fetch('https://edusp-api.ip.tv/registration/edusp/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-realm': 'edusp',
                'x-api-platform': 'webclient',
            },
            body: JSON.stringify({ token: initialToken }),
        });
        
        const finalTokenData = await finalTokenResponse.json();
        if (!finalTokenResponse.ok) {
            return res.status(finalTokenResponse.status).json({ error: 'Erro ao trocar o token na plataforma de mídia.' });
        }
        const finalToken = finalTokenData.token; // O token JWT final do passo 2

        // --- PASSO 3: Acesso aos Dados do Aluno ---
        // Extraindo o código do aluno do payload do token inicial para usar nas chamadas
        const decodedToken = JSON.parse(Buffer.from(initialToken.split('.')[1], 'base64').toString());
        const codigoAluno = decodedToken.CD_USUARIO;

        // Requisições em paralelo para buscar todos os dados
        const [userData, turmasData, disciplinasData, bimestresData] = await Promise.all([
            // Dados principais do usuário
            fetch(`https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true`, {
                headers: { 'x-api-key': finalToken, 'x-api-realm': 'edusp', 'x-api-platform': 'webclient' }
            }).then(r => r.json()),
            
            // Lista de Turmas
            fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
            }).then(r => r.json()),

            // Lista de Disciplinas
            fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Disciplina/ListarDisciplinaPorAluno?codigoAluno=${codigoAluno}`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
            }).then(r => r.json()),

             // Lista de Bimestres (precisa de um ID de escola, pegamos da primeira turma)
             fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
            }).then(r => r.json()).then(turmas => {
                if(turmas && turmas.length > 0) {
                    const escolaId = turmas[0].escolaId;
                    return fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Bimestre/ListarBimestres?escolaId=${escolaId}`, {
                        headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
                    }).then(r => r.json());
                }
                return null;
            }),
        ]);

        // Combinar todos os dados em um único objeto de resposta
        const aggregatedData = {
            dadosPrincipais: userData,
            turmas: turmasData,
            disciplinas: disciplinasData,
            bimestres: bimestresData,
            infoTokenDecodificado: decodedToken // Adicionando para referência
        };

        res.status(200).json(aggregatedData);

    } catch (error) {
        console.error('ERRO GERAL NO BACKEND:', error);
        res.status(500).json({ error: 'Falha interna no servidor.' });
    }
}
