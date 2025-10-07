/**
 * Rota de Equipe do Casamento
 *
 * @description Este arquivo gerencia os endpoints relacionados à equipe de
 * planejamento de um casamento. Ele inclui funcionalidades para convidar,
 * aceitar convites, listar membros, atualizar permissões e gerenciar convites pendentes.
 */

// Importa os módulos necessários
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { sendTeamInvitationEmail } = require('../services/emailService');

const router = express.Router();
router.use(authMiddleware);

// --- Middlewares de Permissão ---

/**
 * Verifica se o usuário que faz a requisição tem permissão de acesso a um casamento.
 */
const canAccessWedding = async (req, res, next) => {
	try {
		const weddingId = req.params.weddingId;
		const userId = req.user.userId;

		const permission = await db.query(
			"SELECT 1 FROM wedding_users WHERE user_id = $1 AND wedding_id = $2",
			[userId, weddingId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para aceder aos dados deste casamento." });
		}
		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};

/**
 * Verifica se o usuário que faz a requisição tem permissão de EDIÇÃO em um casamento.
 */
const canEditWedding = async (req, res, next) => {
	try {
		// Pega o weddingId do corpo da requisição ou dos parâmetros
		const weddingId = req.body.weddingId || req.params.weddingId;
		const inviterId = req.user.userId;

		const permission = await db.query(
			`SELECT w.groom_name, w.bride_name FROM wedding_users wu 
			JOIN weddings w ON wu.wedding_id = w.wedding_id 
			WHERE wu.user_id = $1 AND wu.wedding_id = $2 AND wu.permission_level = 'edit'`,
			[inviterId, weddingId]
		);

		if (permission.rows.length === 0) {
			return res.status(403).json({ error: "Não tem permissão para modificar a equipa deste casamento." });
		}
		// Anexa o nome do casamento na requisição para uso posterior (no envio de e-mail)
		req.weddingName = permission.rows[0].groom_name + " & " + permission.rows[0].bride_name;
		next();
	} catch (error) {
		res.status(500).send('Erro no servidor');
	}
};


// --- Rotas de Equipe ---

/**
 * Rota para convidar um novo membro para a equipe.
 * @route POST /api/team/invite
 */
router.post('/invite', canEditWedding, async (req, res) => {
	try {
		const { weddingId, email, permissionLevel, relationship } = req.body;

		// Verifica se o usuário já é membro da equipe.
		const existingMember = await db.query(
			`SELECT 1 FROM wedding_users wu 
			JOIN users u ON wu.user_id = u.user_id 
			WHERE wu.wedding_id = $1 AND u.email = $2`,
			[weddingId, email]
		);
		
		if (existingMember.rows.length > 0) {
			return res.status(409).json({ error: "Este utilizador já faz parte da equipa de planeamento." });
		}

		// Gera um token único para o convite.
		const invitation_token = crypto.randomBytes(32).toString('hex');

		// Insere ou atualiza o convite no banco de dados.
		await db.query(
			`INSERT INTO wedding_invitations (wedding_id, email, permission_level, invitation_token, relationship)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (wedding_id, email) DO UPDATE SET
			permission_level = EXCLUDED.permission_level, invitation_token = EXCLUDED.invitation_token, status = 'pending', relationship = EXCLUDED.relationship`,
			[weddingId, email, permissionLevel, invitation_token, relationship]
		);

		const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitation_token}`;
		await sendTeamInvitationEmail(email, req.user.name, req.weddingName, acceptUrl);

		res.status(200).json({ message: `Convite enviado para ${email}.` });
	} catch (error) {
		console.error("Erro ao enviar convite:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Rota para aceitar um convite.
 * @route POST /api/team/accept-invitation
 */
router.post('/accept-invitation', async (req, res) => {
	try {
		const { token } = req.body;
		const userId = req.user.userId;
		
		const invitationResult = await db.query(
			"SELECT * FROM wedding_invitations WHERE invitation_token = $1 AND status = 'pending'",
			[token]
		);
		
		if (invitationResult.rows.length === 0) {
			return res.status(404).json({ error: "Convite inválido, expirado ou já utilizado." });
		}
		const invitation = invitationResult.rows[0];

		await db.query(
			"INSERT INTO wedding_users (user_id, wedding_id, permission_level, relationship) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
			[userId, invitation.wedding_id, invitation.permission_level, invitation.relationship]
		);
		
		await db.query("UPDATE wedding_invitations SET status = 'accepted' WHERE invitation_id = $1", [invitation.invitation_id]);

		res.status(200).json({ message: "Convite aceite com sucesso! Você agora faz parte da equipa.", weddingId: invitation.wedding_id });
	} catch (error) {
		console.error("Erro ao aceitar convite:", error);
		res.status(500).send('Erro no servidor');
	}
});


/**
 * Rota para listar os membros da equipe de um casamento.
 * @route GET /api/team/wedding/:weddingId
 */
router.get('/wedding/:weddingId', canAccessWedding, async (req, res) => {
	try {
		const { weddingId } = req.params;
		
		const result = await db.query(
			`SELECT u.user_id, u.name, u.email, wu.permission_level, wu.relationship 
             FROM wedding_users wu 
             JOIN users u ON wu.user_id = u.user_id 
             WHERE wu.wedding_id = $1`,
			[weddingId]
		);

		res.json(result.rows);
	} catch (error) {
		console.error("Erro ao listar membros da equipe:", error);
		res.status(500).send('Erro no servidor');
	}
});

// --- NOVAS ROTAS ---

/**
 * NOVO: Rota para listar convites pendentes de um casamento.
 * @route GET /api/team/invitations/:weddingId
 */
router.get('/invitations/:weddingId', canAccessWedding, async (req, res) => {
    try {
        const { weddingId } = req.params;
        const result = await db.query(
            "SELECT invitation_id, email, permission_level, relationship, created_at FROM wedding_invitations WHERE wedding_id = $1 AND status = 'pending'",
            [weddingId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar convites pendentes:", error);
        res.status(500).send('Erro no servidor');
    }
});

/**
 * NOVO: Rota para atualizar a permissão de um membro da equipe.
 * @route PATCH /api/team/member
 */
router.patch('/member', canEditWedding, async (req, res) => {
    try {
        const { weddingId, memberUserId, permissionLevel } = req.body;
        
        if (!['view', 'edit'].includes(permissionLevel)) {
            return res.status(400).json({ error: 'Nível de permissão inválido.' });
        }

        await db.query(
            'UPDATE wedding_users SET permission_level = $1 WHERE wedding_id = $2 AND user_id = $3',
            [permissionLevel, weddingId, memberUserId]
        );

        res.json({ success: true, message: 'Permissão atualizada.' });
    } catch (error) {
        console.error("Erro ao atualizar permissão:", error);
        res.status(500).send('Erro no servidor');
    }
});

/**
 * NOVO: Rota para cancelar/deletar um convite pendente.
 * @route DELETE /api/team/invitation/:invitationId
 */
router.delete('/invitation/:invitationId', async (req, res) => {
    try {
        const { invitationId } = req.params;
        const userId = req.user.userId;

        // Verifica se o usuário logado tem permissão de edição para o casamento associado a este convite
        const permission = await db.query(
            `SELECT 1 FROM wedding_invitations wi
             JOIN wedding_users wu ON wi.wedding_id = wu.wedding_id
             WHERE wi.invitation_id = $1 AND wu.user_id = $2 AND wu.permission_level = 'edit'`,
            [invitationId, userId]
        );

        if (permission.rows.length === 0) {
            return res.status(403).json({ error: 'Não tem permissão para cancelar este convite.' });
        }
        
        await db.query('DELETE FROM wedding_invitations WHERE invitation_id = $1', [invitationId]);

        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error("Erro ao cancelar convite:", error);
        res.status(500).send('Erro no servidor');
    }
});


module.exports = router;