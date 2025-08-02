// api/get_student_data.js
import fetch from 'node-fetch';

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

        // Verificação de erro aprimorada
        if (!sedTokenResponse.ok) {
            const errorText = await sedTokenResponse.text(); // Pega o erro como texto
            console.error('Erro da API SED:', errorText); // Log para depuração na Vercel
            return res.status(sedTokenResponse.status).json({
                error: `Erro na autenticação inicial (SED). Verifique se o RA, dígito e senha estão corretos. (Detalhe: ${errorText})`
            });
        }

        const sedTokenData = await sedTokenResponse.json();
        const initialToken = sedTokenData.token;

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
        
        if (!finalTokenResponse.ok) {
            const errorText = await finalTokenResponse.text();
            console.error('Erro na troca de token:', errorText);
            return res.status(finalTokenResponse.status).json({ error: `Erro ao obter o token final. (Detalhe: ${errorText})` });
        }
        
        const finalTokenData = await finalTokenResponse.json();
        const finalToken = finalTokenData.token;

        // --- PASSO 3: Acesso aos Dados do Aluno ---
        const decodedToken = JSON.parse(Buffer.from(initialToken.split('.')[1], 'base64').toString());
        const codigoAluno = decodedToken.CD_USUARIO;
        
        const turmasResponse = await fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, {
            headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
        });
        const turmasData = await turmasResponse.json();
        const escolaId = turmasData.length > 0 ? turmasData[0].escolaId : null;

        const [userData, disciplinasData, bimestresData] = await Promise.all([
            fetch(`https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true`, {
                headers: { 'x-api-key': finalToken, 'x-api-realm': 'edusp', 'x-api-platform': 'webclient' }
            }).then(r => r.ok ? r.json() : r.text().then(text => Promise.reject(new Error(`Erro ao buscar dados principais: ${text}`)))),
            
            fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Disciplina/ListarDisciplinaPorAluno?codigoAluno=${codigoAluno}`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
            }).then(r => r.ok ? r.json() : r.text().then(text => Promise.reject(new Error(`Erro ao buscar disciplinas: ${text}`)))),

            escolaId ? fetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Bimestre/ListarBimestres?escolaId=${escolaId}`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.SED_SUBSCRIPTION_KEY_2 }
            }).then(r => r.ok ? r.json() : r.text().then(text => Promise.reject(new Error(`Erro ao buscar bimestres: ${text}`)))) : Promise.resolve(null),
        ]);

        const aggregatedData = {
            dadosPrincipais: userData,
            turmas: turmasData,
            disciplinas: disciplinasData,
            bimestres: bimestresData,
            infoTokenDecodificado: decodedToken
        };

        res.status(200).json(aggregatedData);

    } catch (error) {
        console.error('ERRO GERAL NO BACKEND:', error);
        res.status(500).json({ error: error.message || 'Falha interna no servidor.' });
    }
}
