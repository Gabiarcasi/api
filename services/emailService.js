/**
 * Serviço de E-mail
 *
 * @description Este arquivo centraliza todas as funções de envio de e-mail do
 * aplicativo. Ele usa Nodemailer para configurar um transportador SMTP e
 * definir modelos de e-mail para diferentes finalidades, como verificação de
 * conta, recuperação de senha e convites para a equipe de planejamento.
 */

// Importa o módulo Nodemailer
const nodemailer = require('nodemailer');

// Configura o transportador de e-mail usando as credenciais do Gmail
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASSWORD
	},
	// Permite conexões não autorizadas (útil em ambientes de desenvolvimento)
	tls: {
		rejectUnauthorized: false
	}
});

// ---

/**
 * Funções de Envio de E-mail
 *
 * @description Funções assíncronas para enviar e-mails com base em modelos predefinidos.
 */

/**
 * Envia um e-mail com um código de verificação de conta.
 *
 * @param {string} toEmail - O endereço de e-mail do destinatário.
 * @param {string} code - O código de verificação a ser enviado.
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (toEmail, code) => {
	try {
		// Opções do e-mail
		const mailOptions = {
			from: `"Mariage" <${process.env.EMAIL_USER}>`,
			to: toEmail,
			subject: 'O seu código de verificação Mariage',
			// Conteúdo do e-mail em HTML
			html: `
				<div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
					<h2>Bem-vindo(a) ao Mariage!</h2>
					<p>Obrigado por se registar. Por favor, use o código abaixo para verificar o seu e-mail:</p>
					<p style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background: #f0f0f0; padding: 10px; border-radius: 5px;">
						${code}
					</p>
					<p>Este código expira em 15 minutos.</p>
				</div>
			`
		};
		await transporter.sendMail(mailOptions);
		console.log(`E-mail de verificação enviado para ${toEmail}`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de verificação para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de verificação.');
	}
};

/**
 * Envia um e-mail para recuperação de senha com um código.
 *
 * @param {string} toEmail - O endereço de e-mail do destinatário.
 * @param {string} code - O código de recuperação de senha.
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (toEmail, code) => {
	try {
		const mailOptions = {
			from: `"Mariage" <${process.env.EMAIL_USER}>`,
			to: toEmail,
			subject: 'Recuperação de Senha - Mariage',
			html: `
				<div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
					<h2>Recuperação de Senha</h2>
					<p>Recebemos um pedido para redefinir a sua senha. Use o código abaixo para continuar:</p>
					<p style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background: #f0f0f0; padding: 10px; border-radius: 5px;">
						${code}
					</p>
					<p>Este código expira em 15 minutos. Se não solicitou esta alteração, por favor, ignore este e-mail.</p>
				</div>
			`
		};
		await transporter.sendMail(mailOptions);
		console.log(`E-mail de recuperação de senha enviado para ${toEmail}`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de recuperação para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de recuperação.');
	}
};

/**
 * Envia um e-mail de convite para um membro da equipe de planejamento.
 *
 * @param {string} toEmail - O endereço de e-mail do convidado.
 * @param {string} inviterName - O nome da pessoa que enviou o convite.
 * @param {string} weddingName - O nome do casamento.
 * @param {string} acceptUrl - O URL para aceitar o convite.
 * @returns {Promise<void>}
 */
const sendTeamInvitationEmail = async (toEmail, inviterName, weddingName, acceptUrl) => {
	try {
		const mailOptions = {
			from: `"Mariage" <${process.env.EMAIL_USER}>`,
			to: toEmail,
			subject: `Você foi convidado(a) para planear um casamento!`,
			html: `
				<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
					<h2>Olá!</h2>
					<p><strong>${inviterName}</strong> convidou você para colaborar no planeamento do casamento de <strong>${weddingName}</strong>.</p>
					<p>Clique no botão abaixo para aceitar o convite e juntar-se à equipe de planeamento:</p>
					<p style="text-align: center; margin: 20px 0;">
						<a href="${acceptUrl}" style="background-color: #C9A96A; color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold;">
							Aceitar Convite
						</a>
					</p>
					<p>Se não estava à espera deste convite, pode ignorar este e-mail com segurança.</p>
					<p>Com os melhores cumprimentos,<br>A Equipe Mariage</p>
				</div>
			`
		};
		await transporter.sendMail(mailOptions);
		console.log(`E-mail de convite enviado para ${toEmail}`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de convite para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de convite.');
	}
};

// Exporta as funções para serem usadas em outras partes do aplicativo.
module.exports = {
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendTeamInvitationEmail
};