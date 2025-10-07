/**
 * Rota Pública
 *
 * @description Este arquivo contém os endpoints para as funcionalidades públicas
 * do aplicativo, que não exigem que o usuário esteja logado. Isso inclui
 * o site público do casamento e a funcionalidade de RSVP para convidados.
 */

// Importa os módulos necessários
const express = require('express');
const db = require('../db');
const router = express.Router();

// ---

/**
 * Rota para o Site Público
 *
 * @description Endpoint para buscar as informações de um casamento a partir do
 * seu "slug" (o nome amigável na URL).
 */

/**
 * Busca dados para o site público do casamento.
 *
 * @route GET /api/public/site/:slug
 * @param {string} req.params.slug - O slug único do site do casamento.
 * @returns {object} Os detalhes do casamento e a história dos noivos.
 */
router.get('/site/:slug', async (req, res) => {
	try {
		const { slug } = req.params;

		// Faz uma busca no banco de dados, unindo as informações básicas do casamento
		// com os detalhes do site (como a história dos noivos).
		const result = await db.query(
			`SELECT w.*, d.our_story FROM weddings w
			LEFT JOIN wedding_site_details d ON w.wedding_id = d.wedding_id
			WHERE w.website_slug = $1`,
			[slug]
		);

		// Se nenhum casamento for encontrado com o slug, retorna um erro 404.
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Site não encontrado.' });
		}

		// Retorna os dados do primeiro (e único) resultado.
		res.json(result.rows[0]);
	} catch (error) {
		console.error("Erro ao buscar dados do site público:", error);
		res.status(500).send('Erro no servidor');
	}
});

// ---

/**
 * Rota de RSVP
 *
 * @description Endpoints para que convidados respondam aos seus convites.
 */

/**
 * Busca os dados de um convidado usando um token de RSVP.
 *
 * @route GET /api/public/rsvp/:token
 * @param {string} req.params.token - O token único de RSVP do convidado.
 * @returns {object} O nome completo do convidado.
 */
router.get('/rsvp/:token', async (req, res) => {
	try {
		const { token } = req.params;
		
		// Busca o convidado no banco de dados usando o token.
		const result = await db.query("SELECT full_name FROM guests WHERE rsvp_token = $1", [token]);
		
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Convite não encontrado.' });
		}
		
		// Retorna o nome completo do convidado para preencher o formulário.
		res.json(result.rows[0]);
	} catch (error) {
		console.error("Erro ao buscar dados do convidado para RSVP:", error);
		res.status(500).send('Erro no servidor');
	}
});

/**
 * Envia a resposta de RSVP de um convidado.
 *
 * @route POST /api/public/rsvp/:token
 * @param {string} req.params.token - O token único de RSVP do convidado.
 * @param {string} req.body.status - O status da resposta ('confirmed' ou 'declined').
 * @param {string} [req.body.message] - Uma mensagem opcional do convidado.
 * @returns {object} Um objeto de sucesso ou erro.
 */
router.post('/rsvp/:token', async (req, res) => {
	try {
		const { token } = req.params;
		const { status, message } = req.body;
		
		// Atualiza o status de RSVP e a mensagem do convidado no banco de dados.
		const result = await db.query(
			"UPDATE guests SET rsvp_status = $1, guest_message = $2 WHERE rsvp_token = $3 RETURNING guest_id",
			[status, message, token]
		);
		
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Convite não encontrado.' });
		}
		
		// Responde com sucesso.
		res.json({ success: true, message: "Resposta enviada com sucesso!" });
	} catch (error) {
		console.error("Erro ao enviar resposta de RSVP:", error);
		res.status(500).send('Erro no servidor');
	}
});

module.exports = router;