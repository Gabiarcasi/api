/**
 * Rota de Usuários
 *
 * @description Este arquivo gerencia as rotas relacionadas às operações do
 * usuário, como a exclusão da própria conta, em conformidade com o direito
 * ao esquecimento da LGPD.
 */

const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

// Protege todas as rotas neste arquivo com autenticação
router.use(authMiddleware);

/**
 * Rota para um usuário deletar a própria conta.
 *
 * @route DELETE /api/users/me
 * @description Exclui todos os dados pessoais associados ao usuário logado.
 * Utiliza uma transação para garantir a integridade da operação.
 * @access Privado
 */
router.delete('/me', async (req, res) => {
    const userId = req.user.userId;

    // Para uma exclusão completa, o ideal é usar uma transação
    // para garantir que todos os dados sejam removidos atomicamente.
    try {
        await db.query('BEGIN'); // Inicia uma transação

        // Deleta dados relacionados em outras tabelas para evitar erros de chave estrangeira.
        // 1. Remove convites pendentes associados ao e-mail do usuário.
        await db.query('DELETE FROM wedding_invitations WHERE email = (SELECT email FROM users WHERE user_id = $1)', [userId]);
        
        // 2. Remove os refresh tokens do usuário.
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        
        // 3. Remove as associações do usuário com casamentos.
        await db.query('DELETE FROM wedding_users WHERE user_id = $1', [userId]);
        
        // 4. Finalmente, deleta o registro do usuário da tabela principal.
        const deleteResult = await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

        if (deleteResult.rowCount === 0) {
            throw new Error('Usuário não encontrado para exclusão.');
        }
        
        await db.query('COMMIT'); // Confirma a transação se tudo ocorreu bem

        // Limpa o cookie de refresh token e envia uma resposta de sucesso.
        res.clearCookie('refreshToken');
        res.status(200).json({ message: 'Sua conta e todos os dados associados foram excluídos com sucesso.' });

    } catch (error) {
        await db.query('ROLLBACK'); // Desfaz a transação em caso de erro
        console.error("Erro ao deletar usuário:", error);
        res.status(500).send('Erro no servidor ao tentar deletar a conta.');
    }
});

module.exports = router;