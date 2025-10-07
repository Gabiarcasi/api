/**
 * Serviço de E-mail
 *
 * @description Este arquivo centraliza todas as funções de envio de e-mail do
 * aplicativo usando o serviço Resend. O Resend envia e-mails via API HTTP,
 * o que evita bloqueios de porta SMTP em provedores de nuvem como a Render.
 */

// Importa a classe Resend
const { Resend } = require('resend');

// Inicializa o Resend com a chave da API a partir das variáveis de ambiente
const resend = new Resend(process.env.RESEND_API_KEY);

// Define o e-mail de remetente. No plano gratuito do Resend,
// o envio é feito pelo domínio deles, mas o nome pode ser personalizado.
const fromEmail = 'Mariage <onboarding@resend.dev>';


/**
 * Envia um e-mail com um código de verificação de conta.
 */
const sendVerificationEmail = async (toEmail, code) => {
	try {
		await resend.emails.send({
			from: fromEmail,
			to: toEmail,
			subject: 'O seu código de verificação Mariage',
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
		});
		console.log(`E-mail de verificação enviado para ${toEmail} via Resend`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de verificação para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de verificação.');
	}
};

/**
 * Envia um e-mail para recuperação de senha com um código.
 */
const sendPasswordResetEmail = async (toEmail, code) => {
	try {
		await resend.emails.send({
			from: fromEmail,
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
		});
		console.log(`E-mail de recuperação de senha enviado para ${toEmail} via Resend`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de recuperação para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de recuperação.');
	}
};

/**
 * Envia um e-mail de convite para um membro da equipe de planejamento.
 */
const sendTeamInvitationEmail = async (toEmail, inviterName, weddingName, acceptUrl) => {
	try {
		await resend.emails.send({
			from: fromEmail,
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
		});
		console.log(`E-mail de convite enviado para ${toEmail} via Resend`);
	} catch (error) {
		console.error(`Erro ao enviar e-mail de convite para ${toEmail}:`, error);
		throw new Error('Falha ao enviar o e-mail de convite.');
	}
};

module.exports = {
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendTeamInvitationEmail
};